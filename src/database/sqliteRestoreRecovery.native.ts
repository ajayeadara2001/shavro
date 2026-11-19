import AsyncStorage from "@react-native-async-storage/async-storage";

import type { FinancialCollections } from "./sqliteFinancialCodec.native";

const SQLITE_RESTORE_RECOVERY_KEY = "shavro_sqlite_restore_recovery_v1";

interface SQLiteRestoreRecoveryRecord {
  version: 1;
  operationId: string;
  startedAt: string;
  status: "pending";
  expectedSnapshot?: FinancialCollections;
}

function parseRecoveryRecord(raw: string): SQLiteRestoreRecoveryRecord {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(
      "SQLite restore recovery marker is corrupted. Financial operations are blocked.",
    );
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("SQLite restore recovery marker has an invalid structure.");
  }

  const record = value as Record<string, unknown>;

  if (
    record.version !== 1 ||
    record.status !== "pending" ||
    typeof record.operationId !== "string" ||
    record.operationId.length === 0 ||
    typeof record.startedAt !== "string" ||
    !Number.isFinite(Date.parse(record.startedAt))
  ) {
    throw new Error("SQLite restore recovery marker is invalid.");
  }

  if ("expectedSnapshot" in record) {
    const snapshot = record.expectedSnapshot;

    if (
      typeof snapshot !== "object" ||
      snapshot === null ||
      Array.isArray(snapshot)
    ) {
      throw new Error("SQLite restore recovery snapshot is invalid.");
    }

    const data = snapshot as Record<string, unknown>;

    if (
      !Array.isArray(data.expenses) ||
      !Array.isArray(data.incomes) ||
      !Array.isArray(data.categories) ||
      !Array.isArray(data.paymentMethods)
    ) {
      throw new Error("SQLite restore recovery snapshot is incomplete.");
    }
  }

  return record as unknown as SQLiteRestoreRecoveryRecord;
}

export async function getPendingSQLiteRestoreRecovery(): Promise<SQLiteRestoreRecoveryRecord | null> {
  const raw = await AsyncStorage.getItem(SQLITE_RESTORE_RECOVERY_KEY);

  return raw === null ? null : parseRecoveryRecord(raw);
}

export async function assertNoPendingSQLiteRestoreRecovery(): Promise<void> {
  const record = await getPendingSQLiteRestoreRecovery();

  if (record !== null) {
    throw new Error(
      "An SQLite restore is unresolved. Financial operations are blocked until recovery is verified.",
    );
  }
}

/**
 * Call only while holding the existing exclusive
 * financial-storage operation lock.
 *
 * The marker must be durably readable before
 * starting any SQLite financial mutation.
 */

export async function beginSQLiteRestoreRecovery(
  operationId: string,
  expectedSnapshot?: FinancialCollections,
): Promise<void> {
  if (!operationId.trim()) {
    throw new Error("SQLite restore operation ID is required.");
  }

  await assertNoPendingSQLiteRestoreRecovery();

  const record: SQLiteRestoreRecoveryRecord = {
    version: 1,
    operationId,
    startedAt: new Date().toISOString(),
    status: "pending",

    ...(expectedSnapshot !== undefined ? { expectedSnapshot } : {}),
  };

  // Build the entire journal before
  // performing any SQLite mutation.
  const serialized = JSON.stringify(record);

  await AsyncStorage.setItem(SQLITE_RESTORE_RECOVERY_KEY, serialized);

  // Verify the exact persisted representation.
  // Do not merely compare operation IDs.
  const saved = await AsyncStorage.getItem(SQLITE_RESTORE_RECOVERY_KEY);

  if (saved !== serialized) {
    throw new Error("SQLite restore recovery intent could not be verified.");
  }

  // Also validate the saved journal structure.
  parseRecoveryRecord(saved);
}

/**
 * Call ONLY after transaction completion,
 * full four-collection verification,
 * and database integrity verification.
 *
 * This function does not perform recovery.
 */

export async function finishVerifiedSQLiteRestoreRecovery(
  operationId: string,
): Promise<void> {
  const pending = await getPendingSQLiteRestoreRecovery();

  if (pending === null || pending.operationId !== operationId) {
    throw new Error(
      "SQLite restore recovery marker does not match the operation.",
    );
  }

  // The caller must have already verified:
  // 1. The SQL transaction completed.
  // 2. All four collections match the backup.
  // 3. The database integrity check passed.
  //
  // This function must run while the caller
  // holds the exclusive storage-operation lock.

  let removalError: unknown = null;

  try {
    await AsyncStorage.removeItem(SQLITE_RESTORE_RECOVERY_KEY);
  } catch (error) {
    removalError = error;
  }

  // Read back the actual marker state.
  //
  // A removal may persist successfully
  // even when removeItem() reports failure.
  //
  // If this read fails, its error propagates
  // and the restore remains unresolved.

  const remaining = await getPendingSQLiteRestoreRecovery();

  if (remaining === null) {
    // The caller already verified the
    // committed SQLite financial records.
    // Removing the marker is therefore safe.
    return;
  }

  if (remaining.operationId !== operationId) {
    throw new Error(
      "SQLite restore recovery marker changed during finalization.",
    );
  }

  if (removalError !== null) {
    throw new Error(
      "SQLite restore recovery marker removal failed. " +
        "Recovery remains pending.",
    );
  }

  throw new Error("SQLite restore recovery marker could not be cleared.");
}
