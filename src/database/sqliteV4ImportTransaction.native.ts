import type * as SQLite from "expo-sqlite";

import {
  encodeAllCollections,
  decodeAllCollections,
} from "./sqliteFinancialCodec.native";

import type {
  FinancialCollections,
  SQLiteV4Collections,
  ExpenseV4Row,
  IncomeV4Row,
  CategoryV4Row,
  PaymentMethodV4Row,
} from "./sqliteFinancialCodec.native";

// =========================================
// PHASE 19.6.12
// VERSION-4 TRANSACTION WRITER
// =========================================

/**
 * This module does not:
 *
 * - Open the production database
 * - Read AsyncStorage
 * - Delete legacy records
 * - Run automatically at startup
 * - Activate SQLite as the storage provider
 *
 * The existing migration coordinator
 * remains responsible for:
 *
 * - Source preflight validation
 * - Restore recovery checks
 * - Exclusive financial storage locking
 * - Source snapshot verification
 */

export const SQLITE_V4_MIGRATION_ID = "native_four_collection_copy_v4";

// =========================================
// TYPES
// =========================================

interface CountRow {
  count: number;
}

interface VersionRow {
  user_version: number;
}

interface MarkerRow {
  migration_id: string;
  status: string;
}

export interface V4MigrationCounts {
  expenses: number;
  incomes: number;
  categories: number;
  paymentMethods: number;
}

type Transaction = SQLite.SQLiteDatabase;

const TABLES = [
  "expenses",
  "incomes",
  "custom_categories",
  "custom_payment_methods",
  "migration_state",
] as const;

// =========================================
// STRUCTURAL COMPARISON
// =========================================

/**
 * Compares data structurally.
 *
 * Object property order is ignored.
 *
 * Array item order is preserved.
 *
 * Missing object properties and properties
 * explicitly set to undefined are treated
 * as different.
 *
 * This avoids false failures caused by
 * JSON.stringify object key ordering.
 */
function structurallyEqual(left: unknown, right: unknown): boolean {
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

  const leftIsArray = Array.isArray(left);
  const rightIsArray = Array.isArray(right);

  if (leftIsArray !== rightIsArray) {
    return false;
  }

  if (leftIsArray && rightIsArray) {
    if (left.length !== right.length) {
      return false;
    }

    for (let index = 0; index < left.length; index += 1) {
      if (!structurallyEqual(left[index], right[index])) {
        return false;
      }
    }

    return true;
  }

  const leftRecord = left as Record<string, unknown>;

  const rightRecord = right as Record<string, unknown>;

  const leftKeys = Object.keys(leftRecord).sort();

  const rightKeys = Object.keys(rightRecord).sort();

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (let index = 0; index < leftKeys.length; index += 1) {
    const leftKey = leftKeys[index];
    const rightKey = rightKeys[index];

    if (leftKey !== rightKey) {
      return false;
    }

    if (!structurallyEqual(leftRecord[leftKey], rightRecord[rightKey])) {
      return false;
    }
  }

  return true;
}

function assertEqual(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  function normalize(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map(normalize);
    }

    if (value !== null && typeof value === "object") {
      const record = value as Record<string, unknown>;

      const sorted: Record<string, unknown> = {};

      for (const key of Object.keys(record).sort()) {
        sorted[key] = normalize(record[key]);
      }

      return sorted;
    }

    return value;
  }

  // These migration records must contain only
  // JSON-compatible values. Reject undefined
  // rather than silently losing it in JSON.
  function assertSerializable(value: unknown): void {
    if (
      value === undefined ||
      typeof value === "function" ||
      typeof value === "symbol" ||
      typeof value === "bigint" ||
      (typeof value === "number" && !Number.isFinite(value))
    ) {
      throw new Error("[Shavro V4 Migration] Unsupported comparison value.");
    }

    if (Array.isArray(value)) {
      value.forEach(assertSerializable);
    } else if (value !== null && typeof value === "object") {
      Object.values(value).forEach(assertSerializable);
    }
  }

  assertSerializable(actual);
  assertSerializable(expected);

  if (
    JSON.stringify(normalize(actual)) !== JSON.stringify(normalize(expected))
  ) {
    throw new Error(`[Shavro V4 Migration] ${message}`);
  }
}

// =========================================
// SQLITE ROW COUNT
// =========================================

async function countRows(
  tx: Transaction,
  table: (typeof TABLES)[number],
): Promise<number> {
  const row = await tx.getFirstAsync<CountRow>(
    `SELECT COUNT(*) AS count FROM ${table}`,
  );

  if (!row || !Number.isSafeInteger(row.count) || row.count < 0) {
    throw new Error(`[Shavro V4 Migration] ` + `Invalid row count: ${table}`);
  }

  return row.count;
}

// =========================================
// DESTINATION SAFETY CHECK
// =========================================

async function assertEmptyDestination(tx: Transaction): Promise<void> {
  for (const table of TABLES) {
    const count = await countRows(tx, table);

    if (count !== 0) {
      throw new Error(
        `[Shavro V4 Migration] ` +
          `${table} is not empty. ` +
          `Import was blocked.`,
      );
    }
  }
}

// =========================================
// READ SQLITE COLLECTIONS
// =========================================

async function readAllRows(tx: Transaction): Promise<SQLiteV4Collections> {
  const expenses = await tx.getAllAsync<ExpenseV4Row>(
    `SELECT *
       FROM expenses
       ORDER BY position ASC`,
  );

  const incomes = await tx.getAllAsync<IncomeV4Row>(
    `SELECT *
       FROM incomes
       ORDER BY position ASC`,
  );

  const categories = await tx.getAllAsync<CategoryV4Row>(
    `SELECT *
       FROM custom_categories
       ORDER BY position ASC`,
  );

  const paymentMethods = await tx.getAllAsync<PaymentMethodV4Row>(
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
// INSERT EXPENSES
// =========================================

async function insertExpenses(
  tx: Transaction,
  rows: readonly ExpenseV4Row[],
): Promise<void> {
  for (const row of rows) {
    await tx.runAsync(
      `INSERT INTO expenses (
        id,
        amount_paise,
        category_id,
        expense_name,
        payment_method_id,
        other_method_name,
        transaction_date,
        notes,
        created_at,
        position
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.amount_paise,
        row.category_id,
        row.expense_name,
        row.payment_method_id,
        row.other_method_name,
        row.transaction_date,
        row.notes,
        row.created_at,
        row.position,
      ],
    );
  }
}

// =========================================
// INSERT INCOMES
// =========================================

async function insertIncomes(
  tx: Transaction,
  rows: readonly IncomeV4Row[],
): Promise<void> {
  for (const row of rows) {
    await tx.runAsync(
      `INSERT INTO incomes (
        id,
        amount_paise,
        category_id,
        income_name,
        payment_method_id,
        other_method_name,
        transaction_date,
        notes,
        created_at,
        position,
        has_payment_method_id,
        has_other_method_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.amount_paise,
        row.category_id,
        row.income_name,
        row.payment_method_id,
        row.other_method_name,
        row.transaction_date,
        row.notes,
        row.created_at,
        row.position,
        row.has_payment_method_id,
        row.has_other_method_name,
      ],
    );
  }
}

// =========================================
// INSERT CUSTOM CATEGORIES
// =========================================

async function insertCategories(
  tx: Transaction,
  rows: readonly CategoryV4Row[],
): Promise<void> {
  for (const row of rows) {
    await tx.runAsync(
      `INSERT INTO custom_categories (
        id,
        name,
        scope,
        archived,
        position
      ) VALUES (?, ?, ?, ?, ?)`,
      [row.id, row.name, row.scope, row.archived, row.position],
    );
  }
}

// =========================================
// INSERT CUSTOM PAYMENT METHODS
// =========================================

async function insertPaymentMethods(
  tx: Transaction,
  rows: readonly PaymentMethodV4Row[],
): Promise<void> {
  for (const row of rows) {
    await tx.runAsync(
      `INSERT INTO custom_payment_methods (
        id,
        name,
        archived,
        position
      ) VALUES (?, ?, ?, ?)`,
      [row.id, row.name, row.archived, row.position],
    );
  }
}

// =========================================
// COLLECTION COUNTS
// =========================================

function getCounts(rows: SQLiteV4Collections): V4MigrationCounts {
  return {
    expenses: rows.expenses.length,
    incomes: rows.incomes.length,
    categories: rows.categories.length,
    paymentMethods: rows.paymentMethods.length,
  };
}

// =========================================
// ATOMIC VERSION-4 IMPORT
// =========================================

/**
 * Imports all four collections atomically.
 *
 * IMPORTANT:
 *
 * Caller must:
 *
 * 1. Hold the exclusive financial lock.
 * 2. Complete restore recovery checks.
 * 3. Validate the legacy source records.
 * 4. Capture source snapshots.
 * 5. Recheck source snapshots using
 *    assertSourceUnchanged.
 *
 * This writer never overwrites existing
 * SQLite records.
 */
export async function writeV4CollectionsAtomically(
  db: SQLite.SQLiteDatabase,
  source: FinancialCollections,
  assertSourceUnchanged: () => Promise<void>,
): Promise<V4MigrationCounts> {
  if (typeof assertSourceUnchanged !== "function") {
    throw new Error(
      "[Shavro V4 Migration] " + "Source integrity callback is required.",
    );
  }

  // =======================================
  // 1. ENCODE LEGACY SOURCE
  // =======================================

  const encoded = encodeAllCollections(source);

  // =======================================
  // 2. VERIFY PRE-IMPORT ROUND-TRIP
  // =======================================

  const decoded = decodeAllCollections(encoded);

  assertEqual(decoded, source, "Pre-import round-trip mismatch.");

  const expectedCounts = getCounts(encoded);

  // =======================================
  // 3. SQLITE EXCLUSIVE TRANSACTION
  // =======================================

  await db.withExclusiveTransactionAsync(async (tx) => {
    // ===================================
    // VERIFY SCHEMA VERSION
    // ===================================

    const version = await tx.getFirstAsync<VersionRow>("PRAGMA user_version");

    if (version?.user_version !== 4) {
      throw new Error(
        "[Shavro V4 Migration] " + "SQLite schema version 4 is required.",
      );
    }

    // ===================================
    // PREVENT OVERWRITING RECORDS
    // ===================================

    await assertEmptyDestination(tx);

    // ===================================
    // VERIFY SOURCE BEFORE INSERT
    // ===================================

    await assertSourceUnchanged();

    // ===================================
    // INSERT ALL FOUR COLLECTIONS
    // ===================================

    await insertExpenses(tx, encoded.expenses);

    await insertIncomes(tx, encoded.incomes);

    await insertCategories(tx, encoded.categories);

    await insertPaymentMethods(tx, encoded.paymentMethods);

    // ===================================
    // VERIFY DATABASE RECORDS
    // ===================================

    const saved = await readAllRows(tx);

    const actualCounts = getCounts(saved);

    assertEqual(
      actualCounts,
      expectedCounts,
      "Imported collection counts differ.",
    );

    assertEqual(saved, encoded, "SQLite stored-row mismatch.");

    // ===================================
    // VERIFY LOSSLESS RECONSTRUCTION
    // ===================================

    const reconstructed = decodeAllCollections(saved);

    assertEqual(reconstructed, source, "Post-import round-trip mismatch.");

    // ===================================
    // RECHECK LEGACY SOURCE
    // ===================================

    await assertSourceUnchanged();

    // ===================================
    // SAVE MIGRATION MARKER
    // ===================================

    await tx.runAsync(
      `INSERT INTO migration_state (
          migration_id,
          status,
          completed_at
        ) VALUES (?, ?, ?)`,
      [SQLITE_V4_MIGRATION_ID, "completed", new Date().toISOString()],
    );

    // ===================================
    // VERIFY MIGRATION MARKER
    // ===================================

    const marker = await tx.getFirstAsync<MarkerRow>(
      `SELECT migration_id, status
           FROM migration_state
           WHERE migration_id = ?`,
      [SQLITE_V4_MIGRATION_ID],
    );

    if (
      marker?.migration_id !== SQLITE_V4_MIGRATION_ID ||
      marker.status !== "completed"
    ) {
      throw new Error(
        "[Shavro V4 Migration] " + "Migration marker verification failed.",
      );
    }
  });

  return expectedCounts;
}
