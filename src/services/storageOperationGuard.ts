import { Platform } from "react-native";

import { assertNoPendingRestoreRecovery } from "./restoreRecoveryState";
import { assertNoPendingSQLiteRestoreRecovery } from "../database/sqliteRestoreRecovery.native";
import { runWithBrowserFinancialLock } from "./browserFinancialLock";

/**
 * Shavro Financial Storage Coordinator
 *
 * Protects financial writes and restoration.
 *
 * Features:
 * - Sequential writes within one JS runtime
 * - Exclusive restore/recovery access
 * - Persistent legacy and native SQLite recovery journal checks
 * - Browser-wide locking for normal writes
 * - Safe lock release after failures
 *
 * The browser-wide lock must also be
 * integrated with restore/recovery before
 * Restore Now can be enabled.
 */

let pendingFinancialWrites = 0;

let exclusiveOperation = false;

let writeQueue: Promise<void> = Promise.resolve();

// -----------------------------------------
// STATUS
// -----------------------------------------

export function isExclusiveStorageOperationActive(): boolean {
  return exclusiveOperation;
}

export function hasActiveFinancialWrites(): boolean {
  return pendingFinancialWrites > 0;
}

export function assertNoExclusiveStorageOperation(): void {
  if (exclusiveOperation) {
    throw new Error(
      "Financial records are temporarily unavailable while Shavro is restoring data.",
    );
  }
}

// -----------------------------------------
// NORMAL FINANCIAL WRITES
// -----------------------------------------

/**
 * Execute a complete financial write.
 *
 * The operation must include its entire
 * read-modify-write sequence.
 *
 * Native:
 * - Uses the local serialized queue
 * - Checks both legacy and SQLite recovery journals
 *
 * Web:
 * - Uses the local serialized queue
 * - Acquires the cross-tab Web Lock
 * - Checks recovery state while locked
 * - Executes the write while locked
 *
 * Do not nest runFinancialWrite calls.
 */
export async function runFinancialWrite<T>(
  operation: () => Promise<T>,
): Promise<T> {
  // Reject immediately if an exclusive
  // restore/recovery is active locally.
  assertNoExclusiveStorageOperation();

  // Reserve synchronously so an exclusive
  // operation cannot start while this
  // write is queued or running.
  pendingFinancialWrites += 1;

  const previousWrite = writeQueue;

  let finishQueue!: () => void;

  writeQueue = new Promise<void>((resolve) => {
    finishQueue = resolve;
  });

  try {
    // Serialize writes in this JS runtime.
    await previousWrite;

    assertNoExclusiveStorageOperation();

    /**
     * On web, acquire the browser-wide
     * exclusive lock BEFORE checking
     * recovery state or reading data.
     *
     * On native, this helper executes
     * the callback directly.
     */
    return await runWithBrowserFinancialLock(async () => {
      assertNoExclusiveStorageOperation();

      // Fail closed if recovery is pending
      // or storage cannot be inspected.
      await assertNoPendingRestoreRecovery();

      // A pending native SQLite restoration must block all financial
      // mutations, even before the active provider is selected.
      // Never load the native SQLite module on web.
      if (Platform.OS !== "web") {
        await assertNoPendingSQLiteRestoreRecovery();
      }

      return operation();
    });
  } finally {
    pendingFinancialWrites = Math.max(0, pendingFinancialWrites - 1);

    // Always release the next queued write,
    // including when lock acquisition,
    // recovery inspection or writing fails.
    finishQueue();
  }
}

// -----------------------------------------
// EXCLUSIVE OPERATIONS
// -----------------------------------------

/**
 * Reserve exclusive access within
 * the current JS runtime.
 *
 * Reject if another exclusive operation
 * or financial write is active/queued.
 */
export function beginExclusiveStorageOperation(): () => void {
  if (exclusiveOperation) {
    throw new Error("Another exclusive storage operation is already running.");
  }

  if (pendingFinancialWrites > 0) {
    throw new Error(
      "Cannot restore financial records while another transaction is being saved. Try again after it finishes.",
    );
  }

  exclusiveOperation = true;

  let released = false;

  return () => {
    if (released) {
      return;
    }

    released = true;

    exclusiveOperation = false;
  };
}

/**
 * Run backup restoration or startup recovery
 * with exclusive financial storage access.
 *
 * Native:
 * - Acquires the local exclusive guard
 *
 * Web:
 * - Acquires the local exclusive guard
 * - Acquires the browser-wide Web Lock
 * - Keeps both guards until completion
 *
 * All guarded financial writes must use
 * the same browser lock name.
 */
export async function runExclusiveStorageOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  // Reserve the local exclusive guard
  // immediately, before any async work.
  const release = beginExclusiveStorageOperation();

  try {
    // Web: acquire cross-tab exclusive access.
    // Native: execute directly.
    return await runWithBrowserFinancialLock(async () => {
      return await operation();
    });
  } finally {
    // Release the local guard whether
    // restoration succeeds or fails.
    release();
  }
}
