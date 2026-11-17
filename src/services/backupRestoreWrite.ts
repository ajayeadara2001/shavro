import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import type { ShavroBackup, ShavroBackupSummary } from "../types/backup";

import {
  BACKUP_STORAGE_KEYS,
  captureRestoreStorageSnapshot,
} from "./backupRestore";

import type {
  BackupCollectionName,
  RestoreStorageSnapshot,
} from "./backupRestore";

import {
  validateShavroBackup,
  getShavroBackupSummary,
} from "../utils/backupValidation";

import { runExclusiveStorageOperation } from "./storageOperationGuard";

import {
  hasPendingRestoreCompletion,
  getRestoreCompletionMarker,
  createRestoreCompletionMarker,
  clearRestoreCompletionMarker,
  assertNoPendingRestoreCompletion,
} from "./restoreCompletionState";

// =========================================
// CONSTANTS
// =========================================

const RECOVERY_KEY = "shavro_restore_recovery_v1";
const RECOVERY_VERSION = 1 as const;

export const RESTORE_INTEGRITY_KEY = "shavro_restore_integrity_v1";

const INTEGRITY_VERSION = 1 as const;

const MAX_FINALIZATION_CHECKS = 2;

const COLLECTIONS: BackupCollectionName[] = [
  "expenses",
  "incomes",
  "customCategories",
  "customPaymentMethods",
];

// =========================================
// RECOVERY JOURNAL MODEL
// =========================================

interface RestoreRecoveryJournal {
  version: typeof RECOVERY_VERSION;
  createdAt: string;
  snapshot: RestoreStorageSnapshot;
}

// =========================================
// PERSISTENT RESTORE INTEGRITY MODEL
// =========================================

/**
 * This state remains independent of the
 * recovery journal and completion marker.
 *
 * "finalizing":
 *   A restore entered its final commit stage.
 *   Financial modifications must remain blocked.
 *
 * "committed":
 *   The imported collections were verified
 *   and finalization completed.
 *
 * A committed record is retained as durable
 * evidence of the finalization decision.
 */
interface RestoreIntegrityState {
  version: typeof INTEGRITY_VERSION;
  createdAt: string;
  backupCreatedAt: string;
  status: "finalizing" | "committed";
}

// =========================================
// RESTORE OPERATION STATE
// =========================================

let restoreInProgress = false;

// =========================================
// PLATFORM STORAGE HELPERS
// =========================================

async function readValue(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") {
      throw new Error("Browser storage unavailable.");
    }

    return window.localStorage.getItem(key);
  }

  return AsyncStorage.getItem(key);
}

async function writeValue(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") {
      throw new Error("Browser storage unavailable.");
    }

    window.localStorage.setItem(key, value);
    return;
  }

  await AsyncStorage.setItem(key, value);
}

async function removeValue(key: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") {
      throw new Error("Browser storage unavailable.");
    }

    window.localStorage.removeItem(key);
    return;
  }

  await AsyncStorage.removeItem(key);
}

async function verifyValue(
  key: string,
  expected: string | null,
): Promise<void> {
  const actual = await readValue(key);

  if (actual !== expected) {
    throw new Error(`Storage verification failed for ${key}.`);
  }
}

// =========================================
// RECOVERY JOURNAL VALIDATION
// =========================================

function parseRecoveryJournal(raw: string): RestoreRecoveryJournal {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Restore recovery data is unreadable.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Restore recovery data is invalid.");
  }

  const journal = parsed as Record<string, unknown>;

  if (
    journal.version !== RECOVERY_VERSION ||
    typeof journal.createdAt !== "string" ||
    !Number.isFinite(Date.parse(journal.createdAt)) ||
    typeof journal.snapshot !== "object" ||
    journal.snapshot === null ||
    Array.isArray(journal.snapshot)
  ) {
    throw new Error("Restore recovery data is incompatible.");
  }

  const snapshot = journal.snapshot as Record<string, unknown>;

  for (const collection of COLLECTIONS) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, collection)) {
      throw new Error("Restore recovery snapshot is incomplete.");
    }

    const original = snapshot[collection];

    if (original !== null && typeof original !== "string") {
      throw new Error("Restore recovery snapshot is invalid.");
    }
  }

  return parsed as unknown as RestoreRecoveryJournal;
}

// =========================================
// INTEGRITY STATE VALIDATION
// =========================================

function parseRestoreIntegrityState(raw: string): RestoreIntegrityState {
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
// INTEGRITY STATE STORAGE
// =========================================

async function getRestoreIntegrityState(): Promise<RestoreIntegrityState | null> {
  const raw = await readValue(RESTORE_INTEGRITY_KEY);

  if (raw === null) {
    return null;
  }

  return parseRestoreIntegrityState(raw);
}

/**
 * Persistent integrity information must
 * be verified after writing.
 */
async function saveRestoreIntegrityState(
  state: RestoreIntegrityState,
): Promise<void> {
  const serialized = JSON.stringify(state);

  await writeValue(RESTORE_INTEGRITY_KEY, serialized);

  await verifyValue(RESTORE_INTEGRITY_KEY, serialized);
}

/**
 * Enter finalization before deleting
 * the recovery journal.
 *
 * This operation may replace an earlier
 * committed record, because a new restore
 * is starting while the exclusive lock
 * is held.
 *
 * It must never replace an unresolved
 * finalizing record.
 */
async function beginRestoreIntegrityFinalization(
  backupCreatedAt: string,
): Promise<RestoreIntegrityState> {
  const existing = await getRestoreIntegrityState();

  if (existing?.status === "finalizing") {
    throw new Error("An unresolved restore integrity state already exists.");
  }

  const state: RestoreIntegrityState = {
    version: INTEGRITY_VERSION,
    createdAt: new Date().toISOString(),
    backupCreatedAt,
    status: "finalizing",
  };

  await saveRestoreIntegrityState(state);

  return state;
}

/**
 * Mark the restore committed.
 *
 * This must run only after:
 * - All four collections were verified
 * - Recovery journal was removed
 * - Completion marker was cleared
 *
 * The finalization state must still match
 * the restore being committed.
 */
async function commitRestoreIntegrityState(
  expected: RestoreIntegrityState,
): Promise<void> {
  const current = await getRestoreIntegrityState();

  if (
    current === null ||
    current.status !== "finalizing" ||
    current.createdAt !== expected.createdAt ||
    current.backupCreatedAt !== expected.backupCreatedAt
  ) {
    throw new Error("Restore integrity state changed during finalization.");
  }

  const committed: RestoreIntegrityState = {
    ...expected,
    status: "committed",
  };

  await saveRestoreIntegrityState(committed);
}

/**
 * Clear the unresolved finalization state
 * after a verified rollback.
 *
 * A previously committed record is not
 * removed by rollback cleanup.
 */
async function clearUnresolvedRestoreIntegrityState(): Promise<void> {
  const current = await getRestoreIntegrityState();

  if (current?.status !== "finalizing") {
    return;
  }

  await removeValue(RESTORE_INTEGRITY_KEY);

  await verifyValue(RESTORE_INTEGRITY_KEY, null);
}

// =========================================
// INTEGRITY STATUS CHECK
// =========================================

/**
 * Checks whether the persistent integrity
 * state is unresolved.
 *
 * Read and validation errors propagate.
 *
 * Ordinary financial write guards must
 * call this while holding their lock.
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
// SNAPSHOT VERIFICATION
// =========================================

async function verifySnapshot(snapshot: RestoreStorageSnapshot): Promise<void> {
  for (const collection of COLLECTIONS) {
    const key = BACKUP_STORAGE_KEYS[collection];

    await verifyValue(key, snapshot[collection]);
  }
}

// =========================================
// RESTORE ORIGINAL SNAPSHOT
// =========================================

async function restoreOriginalSnapshot(
  snapshot: RestoreStorageSnapshot,
): Promise<void> {
  for (const collection of COLLECTIONS) {
    const key = BACKUP_STORAGE_KEYS[collection];
    const original = snapshot[collection];

    if (original === null) {
      await removeValue(key);
    } else {
      await writeValue(key, original);
    }

    await verifyValue(key, original);
  }
}

// =========================================
// BUILD RESTORED DATA
// =========================================

function buildRestoreValues(
  backup: ShavroBackup,
): Record<BackupCollectionName, string> {
  return {
    expenses: JSON.stringify(backup.data.expenses),

    incomes: JSON.stringify(backup.data.incomes),

    customCategories: JSON.stringify(backup.data.customCategories),

    customPaymentMethods: JSON.stringify(backup.data.customPaymentMethods),
  };
}

// =========================================
// VERIFY RESTORED COLLECTIONS
// =========================================

async function verifyRestoredValues(
  values: Record<BackupCollectionName, string>,
): Promise<void> {
  for (const collection of COLLECTIONS) {
    await verifyValue(BACKUP_STORAGE_KEYS[collection], values[collection]);
  }
}

// =========================================
// VERIFIED ROLLBACK CLEANUP
// =========================================

/**
 * Called only after the original financial
 * snapshot has been restored and verified.
 *
 * Clear the completion marker and
 * unresolved integrity record BEFORE
 * removing the recovery journal.
 *
 * This preserves the journal for longer
 * if cleanup fails.
 */
async function finalizeVerifiedRollback(): Promise<void> {
  if (await hasPendingRestoreCompletion()) {
    await clearRestoreCompletionMarker();
  }

  await clearUnresolvedRestoreIntegrityState();

  await removeValue(RECOVERY_KEY);

  await verifyValue(RECOVERY_KEY, null);

  await assertNoPendingRestoreCompletion();

  await assertNoPendingRestoreIntegrity();
}

// =========================================
// FINAL COMMIT VERIFICATION
// =========================================

/**
 * The restore commit is complete only
 * when all of these conditions hold.
 *
 * A committed integrity record is durable
 * evidence of finalization.
 */
async function verifyCommittedRestore(
  values: Record<BackupCollectionName, string>,
): Promise<void> {
  await verifyValue(RECOVERY_KEY, null);

  await assertNoPendingRestoreCompletion();

  await verifyRestoredValues(values);

  const integrity = await getRestoreIntegrityState();

  if (integrity?.status !== "committed") {
    throw new Error("Restore commit integrity verification failed.");
  }
}

// =========================================
// RESTORE STATUS
// =========================================

export function isShavroRestoreInProgress(): boolean {
  return restoreInProgress;
}

export async function hasPendingRestoreRecovery(): Promise<boolean> {
  return (await readValue(RECOVERY_KEY)) !== null;
}

/**
 * Compatibility check for existing callers.
 *
 * This does not acquire a storage lock.
 * Normal writes must still be coordinated
 * through runFinancialWrite().
 */
export async function assertShavroStorageWritable(): Promise<void> {
  if (restoreInProgress) {
    throw new Error("Financial records cannot be changed during restoration.");
  }

  if (await hasPendingRestoreRecovery()) {
    throw new Error("Data recovery must finish before editing records.");
  }

  await assertNoPendingRestoreCompletion();

  await assertNoPendingRestoreIntegrity();
}

// =========================================
// STARTUP RECOVERY
// =========================================

/**
 * Recovery policy:
 *
 * Journal exists:
 *   Restore original financial snapshot.
 *   Verify rollback.
 *   Clear remaining safety records.
 *
 * Journal absent + completion marker:
 *   Unresolved. Block startup.
 *
 * Journal absent + finalizing integrity:
 *   Unresolved. Block startup.
 *
 * Journal absent + committed integrity:
 *   No interrupted restoration detected.
 *
 * All records absent:
 *   Legacy/normal startup.
 *
 * A missing record is not, by itself,
 * proof of successful finalization.
 */
export async function recoverInterruptedRestore(): Promise<boolean> {
  return runExclusiveStorageOperation(async () => {
    if (restoreInProgress) {
      throw new Error("Another restore operation is running.");
    }

    restoreInProgress = true;

    try {
      // =================================
      // STEP 1: READ SAFETY RECORDS
      // =================================

      const rawJournal = await readValue(RECOVERY_KEY);

      const completionMarker = await getRestoreCompletionMarker();

      const integrity = await getRestoreIntegrityState();

      // =================================
      // STEP 2: NO RECOVERY JOURNAL
      // =================================

      if (rawJournal === null) {
        if (completionMarker !== null) {
          throw new Error(
            "Restore completion is unresolved and the recovery journal is missing.",
          );
        }

        if (integrity?.status === "finalizing") {
          throw new Error(
            "Restore integrity is unresolved and the recovery journal is missing.",
          );
        }

        // No pending restore markers.
        // A committed record may remain.
        return false;
      }

      // =================================
      // STEP 3: VALIDATE JOURNAL
      // =================================

      const journal = parseRecoveryJournal(rawJournal);

      // =================================
      // STEP 4: RESTORE ORIGINAL DATA
      // =================================

      await restoreOriginalSnapshot(journal.snapshot);

      await verifySnapshot(journal.snapshot);

      // =================================
      // STEP 5: CLEANUP VERIFIED ROLLBACK
      // =================================

      await finalizeVerifiedRollback();

      return true;
    } catch (error) {
      console.error("Interrupted restore recovery failed:", error);

      throw new Error(
        "Shavro could not safely resolve its previous backup restoration. Do not clear app storage or continue editing financial records.",
      );
    } finally {
      restoreInProgress = false;
    }
  });
}

// =========================================
// PROTECTED BACKUP RESTORE
// =========================================

/**
 * Replaces four financial collections.
 *
 * Requirements:
 * - Explicit user confirmation
 * - Exclusive financial storage access
 * - Verified original snapshot
 * - Persistent recovery journal
 * - Verified replacement data
 * - Durable finalization state
 *
 * Restore actions remain disabled until
 * all safety integration tests pass.
 */
export async function applyShavroRestore(
  backup: ShavroBackup,
): Promise<ShavroBackupSummary> {
  return runExclusiveStorageOperation(async () => {
    if (restoreInProgress) {
      throw new Error("A restore operation is already running.");
    }

    restoreInProgress = true;

    let originalSnapshot: RestoreStorageSnapshot | null = null;

    let serializedJournal: string | null = null;

    let journalWriteAttempted = false;
    let replacementStarted = false;

    let completionClearAttempted = false;

    let integrityFinalizationStarted = false;

    let finalizationState: RestoreIntegrityState | null = null;

    let restoredValues: Record<BackupCollectionName, string> | null = null;

    let summary: ShavroBackupSummary | null = null;

    try {
      // =================================
      // STEP 1: VALIDATE BACKUP
      // =================================

      const validBackup = validateShavroBackup(backup);

      // =================================
      // STEP 2: CHECK SAFETY RECORDS
      // =================================

      if ((await readValue(RECOVERY_KEY)) !== null) {
        throw new Error(
          "An interrupted restore must be recovered before starting another restore.",
        );
      }

      if (await hasPendingRestoreCompletion()) {
        throw new Error(
          "An unresolved restore completion state must be resolved before another restore.",
        );
      }

      await assertNoPendingRestoreIntegrity();

      summary = getShavroBackupSummary(validBackup);

      // =================================
      // STEP 3: CAPTURE ORIGINAL DATA
      // =================================

      originalSnapshot = await captureRestoreStorageSnapshot();

      const journal: RestoreRecoveryJournal = {
        version: RECOVERY_VERSION,
        createdAt: new Date().toISOString(),
        snapshot: originalSnapshot,
      };

      serializedJournal = JSON.stringify(journal);

      // =================================
      // STEP 4: SAVE RECOVERY JOURNAL
      // =================================

      journalWriteAttempted = true;

      await writeValue(RECOVERY_KEY, serializedJournal);

      await verifyValue(RECOVERY_KEY, serializedJournal);

      await verifySnapshot(originalSnapshot);

      // =================================
      // STEP 5: REPLACE COLLECTIONS
      // =================================

      restoredValues = buildRestoreValues(validBackup);

      for (const collection of COLLECTIONS) {
        replacementStarted = true;

        const key = BACKUP_STORAGE_KEYS[collection];

        const value = restoredValues[collection];

        await writeValue(key, value);

        await verifyValue(key, value);
      }

      // =================================
      // STEP 6: VERIFY IMPORTED DATA
      // =================================

      await verifyRestoredValues(restoredValues);

      // =================================
      // STEP 7: CREATE COMPLETION MARKER
      // =================================

      await createRestoreCompletionMarker(validBackup.createdAt);

      // =================================
      // STEP 8: BEGIN DURABLE FINALIZATION
      // =================================

      /**
       * Create independent persistent
       * finalization evidence BEFORE
       * deleting the recovery journal.
       *
       * Set this flag before writing, so
       * ambiguous write failures are
       * handled conservatively.
       */
      integrityFinalizationStarted = true;

      finalizationState = await beginRestoreIntegrityFinalization(
        validBackup.createdAt,
      );

      // =================================
      // STEP 9: REMOVE RECOVERY JOURNAL
      // =================================

      await removeValue(RECOVERY_KEY);

      await verifyValue(RECOVERY_KEY, null);

      // =================================
      // STEP 10: PRE-COMMIT VERIFICATION
      // =================================

      await verifyRestoredValues(restoredValues);

      await verifyValue(RECOVERY_KEY, null);

      // Verify the finalization marker
      // still exists before clearing it.
      if (!(await hasPendingRestoreCompletion())) {
        throw new Error(
          "Restore completion marker disappeared before final commit.",
        );
      }

      const pendingIntegrity = await getRestoreIntegrityState();

      if (pendingIntegrity?.status !== "finalizing") {
        throw new Error(
          "Restore integrity state is missing before final commit.",
        );
      }

      // =================================
      // STEP 11: CLEAR COMPLETION MARKER
      // =================================

      completionClearAttempted = true;

      await clearRestoreCompletionMarker();

      // =================================
      // STEP 12: DURABLE COMMIT
      // =================================

      /**
       * Do not remove the integrity record.
       *
       * Change finalizing -> committed.
       *
       * If this write fails before
       * persistence, the finalizing record
       * remains to block future writes.
       */
      await commitRestoreIntegrityState(finalizationState);

      // =================================
      // STEP 13: SUCCESS
      // =================================

      return summary;
    } catch (error) {
      console.error(
        "Shavro restore failed or requires final verification:",
        error,
      );

      // =================================
      // CASE A:
      // FINAL COMMIT MAY HAVE OCCURRED
      // =================================

      if (completionClearAttempted) {
        if (restoredValues === null || summary === null) {
          throw new Error(
            "Restore failed and the storage state could not be safely verified.",
          );
        }

        /**
         * A storage operation can persist
         * successfully and still report
         * an error.
         *
         * Retry verification only.
         *
         * Never delete unresolved evidence
         * merely to satisfy a retry.
         */
        for (let attempt = 1; attempt <= MAX_FINALIZATION_CHECKS; attempt++) {
          try {
            const integrity = await getRestoreIntegrityState();

            if (integrity?.status === "finalizing") {
              /**
               * A completion marker removal
               * may have succeeded despite
               * reporting an error.
               *
               * We can finish the commit
               * only after independently
               * verifying every condition.
               */
              await verifyValue(RECOVERY_KEY, null);

              await assertNoPendingRestoreCompletion();

              await verifyRestoredValues(restoredValues);

              if (
                finalizationState === null ||
                integrity.createdAt !== finalizationState.createdAt ||
                integrity.backupCreatedAt !== finalizationState.backupCreatedAt
              ) {
                throw new Error("Restore finalization identity mismatch.");
              }

              await commitRestoreIntegrityState(finalizationState);
            }

            // Fully verified committed state.
            await verifyCommittedRestore(restoredValues);

            return summary;
          } catch (verificationError) {
            console.error(
              `Restore finalization verification attempt ${attempt} failed:`,
              verificationError,
            );
          }
        }

        /**
         * If both earlier markers vanished,
         * the independent finalizing state
         * remains unless the committed
         * transition actually persisted.
         *
         * Do not claim successful restoration
         * without verifying the result.
         */
        throw new Error(
          "Restore failed and the storage state could not be safely verified. Do not clear app data or continue editing financial records.",
        );
      }

      // =================================
      // CASE B:
      // ROLLBACK WHILE JOURNAL EXISTS
      // =================================

      if (journalWriteAttempted && originalSnapshot) {
        try {
          const rawJournal = await readValue(RECOVERY_KEY);

          if (rawJournal === null) {
            if (replacementStarted) {
              throw new Error(
                "Recovery journal is missing after financial replacement began.",
              );
            }

            /**
             * The restore had not begun
             * changing financial records.
             *
             * Any unexpected finalization
             * state still needs checking.
             */
            if (integrityFinalizationStarted) {
              throw new Error(
                "Recovery journal is missing after restore finalization began.",
              );
            }
          } else {
            if (
              serializedJournal === null ||
              rawJournal !== serializedJournal
            ) {
              throw new Error(
                "Recovery journal does not match the current restore.",
              );
            }

            const journal = parseRecoveryJournal(rawJournal);

            // ---------------------------
            // RESTORE ORIGINAL DATA
            // ---------------------------

            await restoreOriginalSnapshot(journal.snapshot);

            await verifySnapshot(journal.snapshot);

            // ---------------------------
            // CLEANUP VERIFIED ROLLBACK
            // ---------------------------

            await finalizeVerifiedRollback();
          }
        } catch (rollbackError) {
          console.error("Shavro rollback verification failed:", rollbackError);

          throw new Error(
            "Restore failed and the storage state could not be safely verified. Do not clear app data or continue editing transactions.",
          );
        }
      }

      // =================================
      // CASE C:
      // PRESERVE ORIGINAL ERROR
      // =================================

      throw new Error(
        error instanceof Error
          ? error.message
          : "Unable to restore Shavro backup.",
      );
    } finally {
      restoreInProgress = false;
    }
  });
}
