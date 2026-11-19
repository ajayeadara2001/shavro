import AsyncStorage from "@react-native-async-storage/async-storage";

import { SQLITE_V4_MIGRATION_ID } from "./sqliteV4ImportTransaction.native";

import { assertNoPendingRestoreRecovery } from "../services/restoreRecoveryState";

import { Platform } from "react-native";

import { BACKUP_FORMAT, BACKUP_VERSION } from "../types/backup";

import { validateShavroBackup } from "../utils/backupValidation";

import { runExclusiveStorageOperation } from "../services/storageOperationGuard";

import { assertShavroStorageWritable } from "../services/backupRestoreWrite";

import { assertNoPendingSQLiteRestoreRecovery } from "./sqliteRestoreRecovery.native";

import {
  encodeAllCollections,
  type SQLiteV4Collections,
  type ExpenseV4Row,
  type IncomeV4Row,
  type CategoryV4Row,
  type PaymentMethodV4Row,
} from "./sqliteFinancialCodec.native";

// =========================================
// PERSISTENT STORAGE MODE
// =========================================

const STORAGE_MODE_KEY = "shavro_active_storage_mode_v1";

const STORAGE_MODE_VERSION = 1;

export type ShavroStorageMode = "async-storage" | "sqlite";

interface StorageModeRecord {
  version: number;
  mode: ShavroStorageMode;
  activatedAt: string;
}

interface MigrationMarker {
  migration_id: string;
  status: string;
  completed_at: string | null;
}

interface VersionRow {
  user_version: number;
}

// =========================================
// VALIDATE PERSISTED MODE
// =========================================

function parseStorageMode(raw: string): StorageModeRecord {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Shavro storage-mode information is unreadable.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Invalid Shavro storage-mode information.");
  }

  const record = parsed as Record<string, unknown>;

  if (
    record.version !== STORAGE_MODE_VERSION ||
    (record.mode !== "async-storage" && record.mode !== "sqlite") ||
    typeof record.activatedAt !== "string" ||
    !Number.isFinite(Date.parse(record.activatedAt))
  ) {
    throw new Error("Unsupported Shavro storage-mode state.");
  }

  return record as unknown as StorageModeRecord;
}

// =========================================
// VERIFY SQLITE READINESS
// =========================================

/**
 * Validate the schema, completed migration,
 * and SQLite database integrity.
 *
 * SQLite is imported only when necessary.
 *
 * This operation is read-only.
 */
async function assertSQLiteReady(): Promise<void> {
  const { getShavroDatabase } =
    require("./shavroDatabase.native") as typeof import("./shavroDatabase.native");

  const db = await getShavroDatabase();

  const version = await db.getFirstAsync<VersionRow>("PRAGMA user_version");

  if (version?.user_version !== 4) {
    throw new Error("Shavro SQLite schema version 4 is required.");
  }

  const markers = await db.getAllAsync<MigrationMarker>(
    `SELECT migration_id,
              status,
              completed_at
       FROM migration_state`,
  );

  if (
    markers.length !== 1 ||
    markers[0].migration_id !== SQLITE_V4_MIGRATION_ID ||
    markers[0].status !== "completed" ||
    !markers[0].completed_at
  ) {
    throw new Error("Shavro SQLite migration has not been verified.");
  }

  const integrity = await db.getFirstAsync<{
    integrity_check: string;
  }>("PRAGMA integrity_check");

  if (integrity?.integrity_check !== "ok") {
    throw new Error("Shavro SQLite integrity check failed.");
  }
}

// =========================================
// READ PERSISTED STORAGE MODE
// =========================================

/**
 * Inspect the persisted storage-mode marker.
 *
 * This is used at startup BEFORE choosing
 * which restore-recovery implementation
 * may safely run.
 *
 * It does not:
 * - Check recovery state
 * - Open SQLite
 * - Run migration
 * - Modify storage
 *
 * Missing markers default to AsyncStorage.
 * Invalid markers always throw.
 */
export async function getPersistedShavroStorageMode(): Promise<ShavroStorageMode> {
  const raw = await AsyncStorage.getItem(STORAGE_MODE_KEY);

  if (raw === null) {
    return "async-storage";
  }

  return parseStorageMode(raw).mode;
}

// =========================================
// READ ACTIVE STORAGE MODE
// =========================================

/**
 * Read the active provider after checking
 * for unresolved restore recovery.
 *
 * SQLite mode is accepted only when
 * the v4 database is verified.
 *
 * This function never activates SQLite.
 */

export async function getShavroStorageMode(): Promise<ShavroStorageMode> {
  // Preserve the existing legacy restore safety check.
  await assertNoPendingRestoreRecovery();

  // Never guess the provider if its marker is invalid.
  const mode = await getPersistedShavroStorageMode();

  if (mode === "sqlite") {
    // Fail closed if an SQLite restore is unresolved.
    await assertNoPendingSQLiteRestoreRecovery();

    // Preserve existing schema, migration and
    // SQLite database integrity verification.
    await assertSQLiteReady();
  }

  return mode;
}

// =========================================
// STORAGE MODE SAFETY CHECK
// =========================================

/**
 * Prevent operations from silently using
 * the wrong financial storage provider.
 */
export async function assertShavroStorageMode(
  expected: ShavroStorageMode,
): Promise<void> {
  const actual = await getShavroStorageMode();

  if (actual !== expected) {
    throw new Error(
      `Shavro storage mismatch: ` +
        `expected ${expected}, ` +
        `found ${actual}.`,
    );
  }
}

// =========================================
// SQLITE CUTOVER PRECONDITIONS
// =========================================

/**
 * Read-only pre-activation check.
 *
 * Must be called while holding
 * runExclusiveStorageOperation().
 *
 * Requires:
 * - AsyncStorage remains active
 * - SQLite v4 is initialized
 * - The migration marker is completed
 * - SQLite integrity check passes
 *
 * This alone is NOT sufficient to activate
 * SQLite. All four financial collections
 * must also be compared against the source
 * before switching providers.
 */
export async function assertSQLiteCutoverPreconditions(): Promise<void> {
  const mode = await getShavroStorageMode();

  if (mode !== "async-storage") {
    throw new Error(
      "SQLite cutover cannot start because " +
        "AsyncStorage is not the active provider.",
    );
  }

  await assertSQLiteReady();
}

// =========================================
// CONTROLLED SQLITE ACTIVATION
// =========================================

const FINANCIAL_KEYS = [
  "shavro_expenses_v1",
  "shavro_income_v1",
  "shavro_custom_categories_v1",
  "shavro_custom_payment_methods_v1",
] as const;

type SourceSnapshot = readonly [
  string | null,
  string | null,
  string | null,
  string | null,
];

/**
 * Read the four authoritative AsyncStorage
 * collections without using storage-service
 * routers.
 *
 * Must execute under the exclusive guard.
 */
async function readActivationSource(): Promise<SourceSnapshot> {
  const values = await Promise.all(
    FINANCIAL_KEYS.map((key) => AsyncStorage.getItem(key)),
  );

  return values as unknown as SourceSnapshot;
}

/**
 * Compare nested data structurally.
 * Object key ordering is ignored.
 * Array ordering is preserved.
 */
function activationDataMatches(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }

  if (Array.isArray(left) !== Array.isArray(right)) {
    return false;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => activationDataMatches(value, right[index]))
    );
  }

  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;

  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();

  return (
    aKeys.length === bKeys.length &&
    aKeys.every(
      (key, index) =>
        key === bKeys[index] && activationDataMatches(a[key], b[key]),
    )
  );
}

/**
 * Verify the AsyncStorage raw snapshot
 * has not changed since capture.
 */
async function assertActivationSourceUnchanged(
  expected: SourceSnapshot,
): Promise<void> {
  const current = await readActivationSource();

  for (let index = 0; index < expected.length; index += 1) {
    if (current[index] !== expected[index]) {
      throw new Error(
        "Financial data changed during SQLite activation. " +
          "Storage switch cancelled.",
      );
    }
  }
}

/**
 * Parse a legacy financial collection.
 *
 * Missing keys represent empty collections.
 * Malformed data always blocks activation.
 */
function parseActivationArray(raw: string | null, label: string): unknown[] {
  if (raw === null) {
    return [];
  }

  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid ${label} source data. Activation blocked.`);
  }

  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${label} collection. Activation blocked.`);
  }

  return value;
}

/**
 * Create expected SQLite v4 rows from the
 * current AsyncStorage snapshot.
 *
 * Reuse the same backup validator and
 * financial codec as existing services.
 */
function encodeActivationSource(snapshot: SourceSnapshot): SQLiteV4Collections {
  const validated = validateShavroBackup({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    data: {
      expenses: parseActivationArray(snapshot[0], "expense"),

      incomes: parseActivationArray(snapshot[1], "income"),

      customCategories: parseActivationArray(snapshot[2], "custom category"),

      customPaymentMethods: parseActivationArray(snapshot[3], "payment method"),
    },
  });

  return encodeAllCollections({
    expenses: validated.data.expenses,
    incomes: validated.data.incomes,
    categories: validated.data.customCategories,
    paymentMethods: validated.data.customPaymentMethods,
  });
}

/**
 * Read all four collections directly from
 * SQLite, preserving persisted order.
 */
async function readActivationDestination(): Promise<SQLiteV4Collections> {
  const { getShavroDatabase } =
    require("./shavroDatabase.native") as typeof import("./shavroDatabase.native");

  const db = await getShavroDatabase();

  const [expenses, incomes, categories, paymentMethods] = await Promise.all([
    db.getAllAsync<ExpenseV4Row>(
      `SELECT *
       FROM expenses
       ORDER BY position ASC`,
    ),

    db.getAllAsync<IncomeV4Row>(
      `SELECT *
       FROM incomes
       ORDER BY position ASC`,
    ),

    db.getAllAsync<CategoryV4Row>(
      `SELECT *
       FROM custom_categories
       ORDER BY position ASC`,
    ),

    db.getAllAsync<PaymentMethodV4Row>(
      `SELECT *
       FROM custom_payment_methods
       ORDER BY position ASC`,
    ),
  ]);

  return {
    expenses,
    incomes,
    categories,
    paymentMethods,
  };
}

/**
 * Activate SQLite only after verifying
 * every financial collection.
 *
 * PRECONDITIONS:
 * - Native platform
 * - AsyncStorage is active
 * - No unresolved restoration
 * - Completed SQLite v4 migration
 * - All destination rows match source
 * - Source remained unchanged
 *
 * No existing AsyncStorage financial
 * data is deleted.
 *
 * IMPORTANT:
 * This function must NOT be called from
 * inside another exclusive operation.
 *
 * It does NOT run the migration itself.
 */

export async function activateVerifiedSQLiteStorage(): Promise<void> {
  if (Platform.OS === "web") {
    throw new Error("SQLite activation is native-only.");
  }

  return runExclusiveStorageOperation(async () => {
    // Check after acquiring the exclusive lock.
    // Never rely solely on a check performed
    // before acquiring the lock.
    await assertNoPendingSQLiteRestoreRecovery();
    // -----------------------------------
    // 1. RESTORE SAFETY
    // -----------------------------------

    await assertShavroStorageWritable();

    const mode = await getShavroStorageMode();

    if (mode !== "async-storage") {
      throw new Error(
        "SQLite activation requires AsyncStorage " +
          "to be the current storage provider.",
      );
    }

    // -----------------------------------
    // 2. VERIFY DATABASE READINESS
    // -----------------------------------

    await assertSQLiteReady();

    // -----------------------------------
    // 3. CAPTURE CURRENT SOURCE
    // -----------------------------------

    const snapshot = await readActivationSource();

    const expected = encodeActivationSource(snapshot);

    // -----------------------------------
    // 4. COMPARE EVERY SQLITE ROW
    // -----------------------------------

    const actual = await readActivationDestination();

    if (!activationDataMatches(actual, expected)) {
      throw new Error(
        "SQLite records do not match the " +
          "current AsyncStorage records. " +
          "Activation cancelled.",
      );
    }

    // -----------------------------------
    // 5. VERIFY SOURCE STABILITY
    // -----------------------------------

    await assertActivationSourceUnchanged(snapshot);

    // -----------------------------------
    // 6. VERIFY PERSISTED MODE AGAIN
    // -----------------------------------

    const currentMode = await getPersistedShavroStorageMode();

    if (currentMode !== "async-storage") {
      throw new Error("Storage mode changed before activation.");
    }

    // =====================================
    // FINAL RESTORE SAFETY CHECK
    // =====================================

    // Detect a restore journal introduced
    // after the initial safety verification.
    await assertNoPendingSQLiteRestoreRecovery();

    // Recheck existing legacy restore safety.
    await assertShavroStorageWritable();

    // Verify the provider has not changed.
    const modeBeforeCommit = await getPersistedShavroStorageMode();

    if (modeBeforeCommit !== "async-storage") {
      throw new Error("Storage provider changed before SQLite activation.");
    }

    await assertActivationSourceUnchanged(snapshot);
    // -----------------------------------
    // 7. WRITE ACTIVATION MARKER
    // -----------------------------------

    const activated: StorageModeRecord = {
      version: STORAGE_MODE_VERSION,
      mode: "sqlite",
      activatedAt: new Date().toISOString(),
    };

    // Do not delete or overwrite the
    // four AsyncStorage collections.
    await AsyncStorage.setItem(STORAGE_MODE_KEY, JSON.stringify(activated));

    // -----------------------------------
    // 8. VERIFY MARKER PERSISTENCE
    // -----------------------------------

    const persisted = await AsyncStorage.getItem(STORAGE_MODE_KEY);

    if (
      persisted === null ||
      !activationDataMatches(parseStorageMode(persisted), activated)
    ) {
      throw new Error(
        "SQLite activation marker could not " +
          "be verified. Do not continue editing " +
          "financial records until storage " +
          "mode is checked.",
      );
    }

    // -----------------------------------
    // 9. VERIFY ACTIVE PROVIDER
    // -----------------------------------

    const verifiedMode = await getShavroStorageMode();

    if (verifiedMode !== "sqlite") {
      throw new Error("SQLite activation verification failed.");
    }
  });
}
