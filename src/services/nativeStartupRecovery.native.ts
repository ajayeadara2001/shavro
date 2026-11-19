import {
  recoverInterruptedRestore,
  assertShavroStorageWritable,
} from "./backupRestoreWrite";

import { assertNoPendingRestoreRecovery } from "./restoreRecoveryState";

import { assertNoPendingSQLiteRestoreRecovery } from "../database/sqliteRestoreRecovery.native";

import {
  getPersistedShavroStorageMode,
  getShavroStorageMode,
} from "../database/sqliteStorageMode.native";

import { reconcilePendingSQLiteRestore } from "../database/sqliteRestoreReconciliation.native";

/**
 * Native startup recovery verification.
 *
 * This service:
 * - Preserves legacy AsyncStorage recovery.
 * - Never performs legacy rollback in SQLite mode.
 * - Never activates SQLite.
 * - Never clears SQLite recovery markers.
 * - Does not modify SQLite financial records.
 *
 * Every failure blocks normal startup.
 */
export async function verifyNativeStartupRecovery(): Promise<void> {
  const initialMode = await getPersistedShavroStorageMode();

  // =====================================
  // 1. LEGACY ASYNCSTORAGE
  // =====================================

  if (initialMode === "async-storage") {
    await recoverInterruptedRestore();

    await assertNoPendingRestoreRecovery();

    const verifiedMode = await getPersistedShavroStorageMode();

    if (verifiedMode !== "async-storage") {
      throw new Error("Shavro storage mode changed during startup recovery.");
    }

    return;
  }

  // =====================================
  // 2. VERIFY SQLITE PROVIDER
  // =====================================

  if (initialMode !== "sqlite") {
    throw new Error("Unsupported Shavro storage provider.");
  }

  // Check existing legacy restore, completion,
  // and integrity protection before proceeding.
  await assertShavroStorageWritable();

  // =====================================
  // 3. READ-ONLY RECONCILIATION
  // =====================================

  const result = await reconcilePendingSQLiteRestore();

  if (result.status === "verified_committed") {
    throw new Error(
      "SQLite restore records match the recovery snapshot, " +
        "but restore finalization remains pending. " +
        "Financial operations are blocked.",
    );
  }

  if (result.status === "unresolved") {
    throw new Error("SQLite restore recovery is unresolved. " + result.reason);
  }

  if (result.status !== "no_pending_restore") {
    throw new Error("Unexpected SQLite restore recovery state.");
  }

  // =====================================
  // 4. DATABASE AND PROVIDER READINESS
  // =====================================

  // This performs the existing SQLite
  // recovery-marker, schema v4, migration
  // and integrity verification.
  const verifiedMode = await getShavroStorageMode();

  if (verifiedMode !== "sqlite") {
    throw new Error("Shavro storage mode changed during startup.");
  }

  // =====================================
  // 5. FINAL SAFETY CHECKS
  // =====================================

  const finalMode = await getPersistedShavroStorageMode();

  if (finalMode !== "sqlite") {
    throw new Error(
      "Shavro storage provider changed during startup verification.",
    );
  }

  // Detect a recovery marker introduced
  // during the preceding verification steps.
  await assertNoPendingSQLiteRestoreRecovery();

  // Check existing restore completion and
  // integrity protection once more.
  await assertShavroStorageWritable();
}
