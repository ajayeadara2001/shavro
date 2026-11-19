import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import type * as SQLite from "expo-sqlite";

import type { Expense } from "../types/expense";
import type { Income } from "../types/income";

import { runExclusiveStorageOperation } from "../services/storageOperationGuard";

import { assertNoPendingRestoreRecovery } from "../services/restoreRecoveryState";

import { runMigrationPreflight } from "./sqliteMigrationPreflight.native";

import {
  readValidatedCustomOptionsSource,
  readCustomOptionsSnapshot,
  customOptionsSnapshotsMatch,
  type CustomOptionsSourceSnapshot,
} from "./sqliteCustomOptionsPreflight.native";

import { getShavroDatabase } from "./shavroDatabase.native";

import {
  encodeAllCollections,
  decodeAllCollections,
  type FinancialCollections,
  type SQLiteV4Collections,
  type ExpenseV4Row,
  type IncomeV4Row,
  type CategoryV4Row,
  type PaymentMethodV4Row,
} from "./sqliteFinancialCodec.native";

import {
  SQLITE_V4_MIGRATION_ID,
  writeV4CollectionsAtomically,
} from "./sqliteV4ImportTransaction.native";

// =========================================
// CONFIGURATION
// =========================================

const EXPENSE_KEY = "shavro_expenses_v1";
const INCOME_KEY = "shavro_income_v1";

// =========================================
// TYPES
// =========================================

interface FinancialSnapshot {
  expenses: string | null;
  incomes: string | null;
}

interface FullSnapshot {
  financial: FinancialSnapshot;
  custom: CustomOptionsSourceSnapshot;
}

interface MigrationRow {
  migration_id: string;
  status: string;
  completed_at: string | null;
}

interface ValidatedSource {
  snapshot: FullSnapshot;
  collections: FinancialCollections;
}

export interface FullMigrationResult {
  status: "copied" | "already_copied";
  expenseCount: number;
  incomeCount: number;
  categoryCount: number;
  paymentMethodCount: number;
  totalCount: number;
}

// =========================================
// FINANCIAL SOURCE SNAPSHOT
// =========================================

async function readFinancialSnapshot(): Promise<FinancialSnapshot> {
  const [expenses, incomes] = await Promise.all([
    AsyncStorage.getItem(EXPENSE_KEY),
    AsyncStorage.getItem(INCOME_KEY),
  ]);

  return {
    expenses,
    incomes,
  };
}

// =========================================
// FULL SOURCE SNAPSHOT
// =========================================

async function readFullSnapshot(): Promise<FullSnapshot> {
  const financial = await readFinancialSnapshot();

  const custom = await readCustomOptionsSnapshot();

  return {
    financial,
    custom,
  };
}

// =========================================
// SNAPSHOT COMPARISON
// =========================================

function snapshotsMatch(first: FullSnapshot, second: FullSnapshot): boolean {
  return (
    first.financial.expenses === second.financial.expenses &&
    first.financial.incomes === second.financial.incomes &&
    customOptionsSnapshotsMatch(first.custom, second.custom)
  );
}

// =========================================
// VERIFY SOURCE HAS NOT CHANGED
// =========================================

async function assertSourceUnchanged(expected: FullSnapshot): Promise<void> {
  const current = await readFullSnapshot();

  if (!snapshotsMatch(expected, current)) {
    throw new Error("Migration source changed during verification.");
  }
}

// =========================================
// STRUCTURAL DATA COMPARISON
// =========================================

/**
 * Object key order is ignored.
 * Array order is significant.
 * Missing properties differ from
 * explicitly present properties.
 *
 * This is for validated financial data
 * composed of plain objects and arrays.
 */
function dataEquals(left: unknown, right: unknown): boolean {
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
    if (left.length !== right.length) {
      return false;
    }

    for (let index = 0; index < left.length; index += 1) {
      if (!dataEquals(left[index], right[index])) {
        return false;
      }
    }

    return true;
  }

  const leftObject = left as Record<string, unknown>;

  const rightObject = right as Record<string, unknown>;

  const leftKeys = Object.keys(leftObject).sort();

  const rightKeys = Object.keys(rightObject).sort();

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index];

    if (key !== rightKeys[index]) {
      return false;
    }

    if (!dataEquals(leftObject[key], rightObject[key])) {
      return false;
    }
  }

  return true;
}

function assertDataEqual(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  if (!dataEquals(actual, expected)) {
    throw new Error(message);
  }
}

// =========================================
// VALIDATED SOURCE
// =========================================

async function readValidatedSource(): Promise<ValidatedSource> {
  // Read all four raw source collections.
  const before = await readFullSnapshot();

  // Validate financial data using the
  // existing migration preflight.
  const financialPreflight = await runMigrationPreflight();

  if (financialPreflight.ready !== true) {
    throw new Error("Financial migration preflight is not ready.");
  }

  // Validate categories and payment
  // methods using the existing preflight.
  const options = await readValidatedCustomOptionsSource();

  // Make sure neither source changed
  // while validation was running.
  const after = await readFullSnapshot();

  if (!snapshotsMatch(before, after)) {
    throw new Error("Migration source changed during validation.");
  }

  const expenses = JSON.parse(before.financial.expenses ?? "[]") as Expense[];

  const incomes = JSON.parse(before.financial.incomes ?? "[]") as Income[];

  if (
    expenses.length !== financialPreflight.expenseCount ||
    incomes.length !== financialPreflight.incomeCount
  ) {
    throw new Error("Financial source count verification failed.");
  }

  if (!customOptionsSnapshotsMatch(before.custom, options.snapshot)) {
    throw new Error("Custom-options snapshots do not match.");
  }

  const collections: FinancialCollections = {
    expenses,
    incomes,
    categories: options.categories,
    paymentMethods: options.paymentMethods,
  };

  // Validate that the v4 codec can
  // reconstruct the entire source before
  // opening the SQLite database.
  const encoded = encodeAllCollections(collections);

  const decoded = decodeAllCollections(encoded);

  assertDataEqual(
    decoded,
    collections,
    "Pre-import financial round-trip mismatch.",
  );

  return {
    snapshot: before,
    collections,
  };
}

// =========================================
// SQLITE READ-BACK
// =========================================

async function readSQLiteCollections(
  db: SQLite.SQLiteDatabase,
): Promise<SQLiteV4Collections> {
  const expenses = await db.getAllAsync<ExpenseV4Row>(
    `SELECT *
       FROM expenses
       ORDER BY position ASC`,
  );

  const incomes = await db.getAllAsync<IncomeV4Row>(
    `SELECT *
       FROM incomes
       ORDER BY position ASC`,
  );

  const categories = await db.getAllAsync<CategoryV4Row>(
    `SELECT *
       FROM custom_categories
       ORDER BY position ASC`,
  );

  const paymentMethods = await db.getAllAsync<PaymentMethodV4Row>(
    `SELECT *
       FROM custom_payment_methods
       ORDER BY position ASC`,
  );

  return {
    expenses,
    incomes,
    categories,
    paymentMethods,
  };
}

// =========================================
// DATABASE VERIFICATION
// =========================================

async function verifyAllRows(
  db: SQLite.SQLiteDatabase,
  source: FinancialCollections,
): Promise<void> {
  const expected = encodeAllCollections(source);

  const actual = await readSQLiteCollections(db);

  // Compare every SQLite field, including
  // order and optional-property flags.
  assertDataEqual(
    actual,
    expected,
    "SQLite migration stored-row verification failed.",
  );

  // Verify exact reconstruction into
  // Shavro's original data structures.
  const restored = decodeAllCollections(actual);

  assertDataEqual(
    restored,
    source,
    "SQLite migration round-trip verification failed.",
  );
}

// =========================================
// MIGRATION STATE
// =========================================

async function readMigrationState(
  db: SQLite.SQLiteDatabase,
): Promise<MigrationRow[]> {
  return db.getAllAsync<MigrationRow>(
    `SELECT migration_id,
            status,
            completed_at
     FROM migration_state`,
  );
}

function assertCompletedMigration(rows: MigrationRow[]): void {
  if (
    rows.length !== 1 ||
    rows[0].migration_id !== SQLITE_V4_MIGRATION_ID ||
    rows[0].status !== "completed" ||
    !rows[0].completed_at
  ) {
    throw new Error("SQLite contains an incompatible or incomplete migration.");
  }
}

// =========================================
// RESULT BUILDER
// =========================================

function buildResult(
  status: FullMigrationResult["status"],
  data: FinancialCollections,
): FullMigrationResult {
  const expenseCount = data.expenses.length;

  const incomeCount = data.incomes.length;

  const categoryCount = data.categories.length;

  const paymentMethodCount = data.paymentMethods.length;

  return {
    status,
    expenseCount,
    incomeCount,
    categoryCount,
    paymentMethodCount,

    totalCount: expenseCount + incomeCount + categoryCount + paymentMethodCount,
  };
}

// =========================================
// MAIN FOUR-COLLECTION MIGRATION
// =========================================

/**
 * Non-destructive, version-4 migration.
 *
 * AsyncStorage remains Shavro's active
 * financial store.
 *
 * IMPORTANT:
 *
 * Do not invoke this during app startup
 * until SQLite-aware Backup & Restore
 * and the storage cutover are ready.
 *
 * Never delete source data here.
 */
export async function copyAllDataToSQLite(): Promise<FullMigrationResult> {
  if (Platform.OS === "web") {
    throw new Error("SQLite migration is native-only.");
  }

  return runExclusiveStorageOperation(async () => {
    // ===================================
    // 1. RESTORE RECOVERY SAFETY
    // ===================================

    await assertNoPendingRestoreRecovery();

    // ===================================
    // 2. VALIDATE LEGACY SOURCE
    // ===================================

    const { snapshot, collections } = await readValidatedSource();

    // ===================================
    // 3. OPEN VERSIONED SQLITE DB
    // ===================================

    const db = await getShavroDatabase();

    const migrationRows = await readMigrationState(db);

    // ===================================
    // 4. EXISTING MIGRATION
    // ===================================

    if (migrationRows.length > 0) {
      // Reject older migration markers,
      // incomplete imports and unknown
      // migration states.
      assertCompletedMigration(migrationRows);

      // Verify the existing SQLite copy
      // against the current source.
      // This includes array positions and
      // legacy optional-field presence.
      await verifyAllRows(db, collections);

      await assertSourceUnchanged(snapshot);

      return buildResult("already_copied", collections);
    }

    // ===================================
    // 5. IMPORT USING TESTED V4 WRITER
    // ===================================

    /*
     * The writer:
     *
     * - Requires schema version 4
     * - Checks destination emptiness
     * - Inserts all four collections
     * - Verifies all stored fields
     * - Checks source before commit
     * - Writes the completed marker
     * - Uses one exclusive SQL transaction
     *
     * We are already holding the exclusive
     * financial storage operation lock.
     */
    await writeV4CollectionsAtomically(db, collections, () =>
      assertSourceUnchanged(snapshot),
    );

    // ===================================
    // 6. POST-COMMIT MARKER CHECK
    // ===================================

    const committed = await readMigrationState(db);

    assertCompletedMigration(committed);

    // ===================================
    // 7. POST-COMMIT DATA CHECK
    // ===================================

    await verifyAllRows(db, collections);

    // ===================================
    // 8. POST-COMMIT SOURCE CHECK
    // ===================================

    await assertSourceUnchanged(snapshot);

    // ===================================
    // 9. RESULT
    // ===================================

    const result = buildResult("copied", collections);

    console.log(
      "[Shavro Migration] " + "Version-4 four-collection copy verified:",
      {
        expenses: result.expenseCount,

        incomes: result.incomeCount,

        categories: result.categoryCount,

        paymentMethods: result.paymentMethodCount,
      },
    );

    return result;
  });
}
