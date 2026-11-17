import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { assertNoPendingRestoreCompletion } from "./restoreCompletionState";

/**
 * Shavro Restore Recovery State
 *
 * Protects financial writes when:
 *
 * 1. An interrupted restore recovery journal exists.
 * 2. A restore completion marker exists.
 * 3. A persistent restore integrity state is unresolved.
 * 4. Any required safety record cannot be inspected.
 *
 * This module never modifies or removes financial
 * records, recovery journals, completion markers,
 * or integrity records.
 *
 * IMPORTANT:
 * These checks must be performed while holding
 * the financial storage lock, before beginning
 * the complete read-modify-write operation.
 */

// =========================================
// STORAGE KEYS
// =========================================

export const RESTORE_RECOVERY_STORAGE_KEY = "shavro_restore_recovery_v1";

export const RESTORE_INTEGRITY_STORAGE_KEY = "shavro_restore_integrity_v1";

const INTEGRITY_VERSION = 1 as const;

// =========================================
// INTEGRITY STATE MODEL
// =========================================

interface RestoreIntegrityState {
  version: typeof INTEGRITY_VERSION;
  createdAt: string;
  backupCreatedAt: string;
  status: "finalizing" | "committed";
}

// =========================================
// PLATFORM STORAGE HELPERS
// =========================================

async function readRaw(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") {
      throw new Error("Browser storage is unavailable.");
    }

    return window.localStorage.getItem(key);
  }

  return AsyncStorage.getItem(key);
}

// =========================================
// RECOVERY JOURNAL READ
// =========================================

/**
 * Read the recovery journal without parsing it.
 *
 * Even corrupted recovery data must remain
 * available for investigation and recovery.
 *
 * Storage read errors propagate.
 */
export async function getRestoreRecoveryJournalRaw(): Promise<string | null> {
  return readRaw(RESTORE_RECOVERY_STORAGE_KEY);
}

// =========================================
// RECOVERY STATUS
// =========================================

/**
 * Returns true whenever any recovery journal
 * exists, including malformed journal data.
 *
 * Storage errors propagate to the caller.
 */
export async function isRestoreRecoveryPending(): Promise<boolean> {
  const raw = await getRestoreRecoveryJournalRaw();

  return raw !== null;
}

// =========================================
// INTEGRITY STATE VALIDATION
// =========================================

/**
 * Parse and validate persistent restore
 * integrity information.
 *
 * Invalid or corrupted data must never
 * silently be treated as a safe state.
 */
function parseIntegrityState(raw: string): RestoreIntegrityState {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Restore integrity state is unreadable.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Restore integrity state is invalid.");
  }

  const state = parsed as Record<string, unknown>;

  if (
    state.version !== INTEGRITY_VERSION ||
    (state.status !== "finalizing" && state.status !== "committed") ||
    typeof state.createdAt !== "string" ||
    typeof state.backupCreatedAt !== "string" ||
    !Number.isFinite(Date.parse(state.createdAt)) ||
    !Number.isFinite(Date.parse(state.backupCreatedAt))
  ) {
    throw new Error("Restore integrity state is incompatible.");
  }

  return parsed as unknown as RestoreIntegrityState;
}

// =========================================
// INTEGRITY STATE READ
// =========================================

/**
 * Read the independent persistent
 * restore integrity record.
 *
 * A missing record is allowed for legacy
 * installations that have never restored
 * a backup.
 *
 * A malformed record is never ignored.
 */
async function getRestoreIntegrityState(): Promise<RestoreIntegrityState | null> {
  const raw = await readRaw(RESTORE_INTEGRITY_STORAGE_KEY);

  if (raw === null) {
    return null;
  }

  return parseIntegrityState(raw);
}

// =========================================
// INTEGRITY SAFETY CHECK
// =========================================

/**
 * Reject financial writes when the
 * integrity record indicates an
 * unresolved restore finalization.
 *
 * Allowed:
 * - No integrity record (legacy state)
 * - Valid "committed" integrity record
 *
 * Blocked:
 * - "finalizing" integrity record
 * - Corrupted integrity record
 * - Incompatible integrity record
 * - Storage inspection failure
 *
 * IMPORTANT:
 * A committed record does not override
 * a pending recovery journal or completion
 * marker. Those are checked separately.
 */
export async function assertNoPendingRestoreIntegrity(): Promise<void> {
  let state: RestoreIntegrityState | null;

  try {
    state = await getRestoreIntegrityState();
  } catch (error) {
    console.error("Unable to inspect restore integrity state:", error);

    throw new Error(
      "Shavro cannot verify restore integrity. Financial changes are temporarily unavailable.",
    );
  }

  if (state?.status === "finalizing") {
    throw new Error(
      "Shavro has an unresolved restore integrity state. Financial changes are blocked.",
    );
  }
}

// =========================================
// COMBINED FINANCIAL WRITE SAFETY
// =========================================

/**
 * Check every persistent restore safety
 * record before allowing a normal
 * financial modification.
 *
 * Check order:
 *
 * 1. Recovery journal
 * 2. Completion marker
 * 3. Persistent integrity state
 *
 * Missing the recovery journal alone
 * does not prove restoration completed.
 *
 * This function does not acquire a lock.
 * Call it from runFinancialWrite() while
 * the shared storage lock is held.
 */
export async function assertNoPendingRestoreRecovery(): Promise<void> {
  let recoveryPending: boolean;

  // =======================================
  // STEP 1: RECOVERY JOURNAL
  // =======================================

  try {
    recoveryPending = await isRestoreRecoveryPending();
  } catch (error) {
    console.error("Unable to inspect restore recovery state:", error);

    throw new Error(
      "Shavro cannot verify that financial data is safe to modify. Please restart the app and try again.",
    );
  }

  if (recoveryPending) {
    throw new Error(
      "Shavro detected an unfinished backup recovery. Financial records cannot be changed until recovery completes.",
    );
  }

  // =======================================
  // STEP 2: COMPLETION MARKER
  // =======================================

  /**
   * This function blocks:
   * - Existing completion markers
   * - Completion marker read failures
   *
   * It is implemented in
   * restoreCompletionState.ts.
   */
  await assertNoPendingRestoreCompletion();

  // =======================================
  // STEP 3: INTEGRITY RECORD
  // =======================================

  /**
   * Even when both earlier safety records
   * are absent, an unresolved finalizing
   * integrity record must block writes.
   *
   * Read errors and invalid records also
   * block financial modifications.
   */
  await assertNoPendingRestoreIntegrity();
}
