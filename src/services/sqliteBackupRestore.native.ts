import type * as SQLite from "expo-sqlite";

import type { ShavroBackup } from "../types/backup";

import { validateShavroBackup } from "../utils/backupValidation";

import { runExclusiveStorageOperation } from "./storageOperationGuard";

import { assertShavroStorageWritable } from "./backupRestoreWrite";

import { getShavroStorageMode } from "../database/sqliteStorageMode.native";

import {
  encodeAllCollections,
  decodeAllCollections,
  type FinancialCollections,
  type SQLiteV4Collections,
  type ExpenseV4Row,
  type IncomeV4Row,
  type CategoryV4Row,
  type PaymentMethodV4Row,
} from "../database/sqliteFinancialCodec.native";

import { SQLITE_V4_MIGRATION_ID } from "../database/sqliteV4ImportTransaction.native";

import {
  beginSQLiteRestoreRecovery,
  finishVerifiedSQLiteRestoreRecovery,
} from "../database/sqliteRestoreRecovery.native";

// =========================================
// SQLITE BACKUP & RESTORE
// =========================================

interface VersionRow {
  user_version: number;
}

interface MigrationRow {
  migration_id: string;
  status: string;
  completed_at: string | null;
}

interface IntegrityRow {
  integrity_check: string;
}

type SQLValue = string | number | null;

// =========================================
// ACTIVE PROVIDER SAFETY
// =========================================

/**
 * This adapter may operate only when
 * native SQLite is the active provider.
 *
 * Also checks existing restore safety
 * markers before financial operations.
 *
 * Must be called inside the exclusive
 * storage operation.
 */
async function assertSQLiteStorageActive(): Promise<void> {
  await assertShavroStorageWritable();

  const mode = await getShavroStorageMode();

  if (mode !== "sqlite") {
    throw new Error(
      "SQLite backup/restore is unavailable " +
        "because SQLite is not the active storage provider.",
    );
  }
}

// =========================================
// SQLITE DATABASE READINESS
// =========================================

async function assertSQLiteReady(db: SQLite.SQLiteDatabase): Promise<void> {
  const version = await db.getFirstAsync<VersionRow>("PRAGMA user_version");

  if (version?.user_version !== 4) {
    throw new Error("SQLite backup/restore requires schema version 4.");
  }

  const markers = await db.getAllAsync<MigrationRow>(
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
    throw new Error("SQLite migration is not verified as complete.");
  }
}

// =========================================
// SQLITE INTEGRITY
// =========================================

/**
 * PRAGMA integrity_check must be executed
 * outside the write transaction.
 */
async function assertSQLiteIntegrity(db: SQLite.SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<IntegrityRow>("PRAGMA integrity_check");

  if (result?.integrity_check !== "ok") {
    throw new Error("Shavro SQLite database integrity check failed.");
  }
}

// =========================================
// READ FOUR COLLECTIONS
// =========================================

async function readRows(
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
// STRUCTURAL COMPARISON
// =========================================

/**
 * Preserve:
 * - Array ordering
 * - Missing versus null properties
 * - All expected values
 *
 * Object property insertion order does
 * not affect comparison.
 */
function sameData(left: unknown, right: unknown): boolean {
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
      left.every((item, index) => sameData(item, right[index]))
    );
  }

  const a = left as Record<string, unknown>;

  const b = right as Record<string, unknown>;

  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();

  if (
    aKeys.length !== bKeys.length ||
    aKeys.some((key, index) => key !== bKeys[index])
  ) {
    return false;
  }

  return aKeys.every((key) => sameData(a[key], b[key]));
}

// =========================================
// SQLITE BACKUP READER
// =========================================

/**
 * Read all four collections from the
 * verified active SQLite provider.
 *
 * The storage coordinator prevents
 * guarded writes from interleaving
 * with this operation.
 *
 * Read-only: no financial records change.
 *
 * Do not call while already holding
 * runExclusiveStorageOperation().
 */
export async function readSQLiteBackupData(): Promise<FinancialCollections> {
  return runExclusiveStorageOperation(async () => {
    await assertSQLiteStorageActive();

    const { getShavroDatabase } =
      await import("../database/shavroDatabase.native");

    const db = await getShavroDatabase();

    await assertSQLiteReady(db);
    await assertSQLiteIntegrity(db);

    const rows = await readRows(db);

    return decodeAllCollections(rows);
  });
}

// =========================================
// FIXED-COLUMN INSERT
// =========================================

async function insertRows(
  tx: SQLite.SQLiteDatabase,
  table: string,
  columns: readonly string[],
  rows: readonly SQLValue[][],
): Promise<void> {
  // All SQL identifiers are supplied
  // by fixed internal function calls.
  // User-provided identifiers are never
  // interpolated into SQL.

  const placeholders = columns.map(() => "?").join(", ");

  const sql =
    `INSERT INTO ${table} (` +
    columns.join(", ") +
    `) VALUES (${placeholders})`;

  for (const row of rows) {
    if (row.length !== columns.length) {
      throw new Error(`Invalid SQLite column count: ${table}`);
    }

    await tx.runAsync(sql, row);
  }
}

// =========================================
// DELETE OLD COLLECTIONS
// =========================================

async function clearCollections(tx: SQLite.SQLiteDatabase): Promise<void> {
  await tx.execAsync(`
    DELETE FROM expenses;
    DELETE FROM incomes;
    DELETE FROM custom_categories;
    DELETE FROM custom_payment_methods;
  `);
}

// =========================================
// INSERT ALL COLLECTIONS
// =========================================

async function insertCollections(
  tx: SQLite.SQLiteDatabase,
  data: SQLiteV4Collections,
): Promise<void> {
  // -------------------------------------
  // EXPENSES
  // -------------------------------------

  await insertRows(
    tx,
    "expenses",
    [
      "id",
      "amount_paise",
      "category_id",
      "expense_name",
      "payment_method_id",
      "other_method_name",
      "transaction_date",
      "notes",
      "created_at",
      "position",
    ],
    data.expenses.map((row) => [
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
    ]),
  );

  // -------------------------------------
  // INCOMES
  // -------------------------------------

  await insertRows(
    tx,
    "incomes",
    [
      "id",
      "amount_paise",
      "category_id",
      "income_name",
      "payment_method_id",
      "other_method_name",
      "transaction_date",
      "notes",
      "created_at",
      "position",
      "has_payment_method_id",
      "has_other_method_name",
    ],
    data.incomes.map((row) => [
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
    ]),
  );

  // -------------------------------------
  // CUSTOM CATEGORIES
  // -------------------------------------

  await insertRows(
    tx,
    "custom_categories",
    ["id", "name", "scope", "archived", "position"],
    data.categories.map((row) => [
      row.id,
      row.name,
      row.scope,
      row.archived,
      row.position,
    ]),
  );

  // -------------------------------------
  // CUSTOM PAYMENT METHODS
  // -------------------------------------

  await insertRows(
    tx,
    "custom_payment_methods",
    ["id", "name", "archived", "position"],
    data.paymentMethods.map((row) => [
      row.id,
      row.name,
      row.archived,
      row.position,
    ]),
  );
}

// =========================================
// SQLITE ATOMIC RESTORE
// =========================================

/**
 * Replace four financial collections
 * in one SQLite write transaction.
 *
 * If any operation inside the transaction
 * throws, SQLite rolls back the replacement.
 *
 * If a post-commit verification fails,
 * the transaction may ALREADY have
 * committed. Never report that as a
 * confirmed rollback.
 *
 * This remains an internal-only adapter.
 * Do not enable the public Restore Now
 * action until post-commit recovery and
 * activation tests are complete.
 *
 * Do not invoke inside an existing
 * runExclusiveStorageOperation().
 */

export async function restoreSQLiteBackupData(
  backup: ShavroBackup,
): Promise<void> {
  return runExclusiveStorageOperation(async () => {
    // =====================================
    // 1. ACTIVE PROVIDER & RESTORE SAFETY
    // =====================================

    await assertSQLiteStorageActive();

    // =====================================
    // 2. VALIDATE THE BACKUP
    // =====================================

    const validated = validateShavroBackup(backup);

    const source: FinancialCollections = {
      expenses: validated.data.expenses,
      incomes: validated.data.incomes,
      categories: validated.data.customCategories,
      paymentMethods: validated.data.customPaymentMethods,
    };

    // =====================================
    // 3. LOSSLESS ENCODING
    // =====================================

    const encoded = encodeAllCollections(source);

    if (!sameData(decodeAllCollections(encoded), source)) {
      throw new Error("SQLite restore conversion failed.");
    }

    // =====================================
    // 4. VERIFY SQLITE READINESS
    // =====================================

    const { getShavroDatabase } =
      require("../database/shavroDatabase.native") as typeof import("../database/shavroDatabase.native");

    const db = await getShavroDatabase();

    await assertSQLiteReady(db);
    await assertSQLiteIntegrity(db);

    // =====================================
    // 5. DURABLE RECOVERY INTENT
    // =====================================

    const operationId =
      `sqlite-restore-${Date.now()}-` + Math.random().toString(36).slice(2);

    // This must succeed, including read-back
    // verification, BEFORE any SQL mutation.
    //
    // If it throws after persisting the marker,
    // no transaction begins. The marker
    // remains available to block future access.

    await beginSQLiteRestoreRecovery(operationId, source);
    let transactionCompleted = false;

    try {
      // ===================================
      // 6. ATOMIC FOUR-COLLECTION RESTORE
      // ===================================

      await db.withExclusiveTransactionAsync(async (tx) => {
        await assertSQLiteReady(tx);

        await clearCollections(tx);

        await insertCollections(tx, encoded);

        // Verify all records before commit.
        const actual = await readRows(tx);

        if (!sameData(actual, encoded)) {
          throw new Error("SQLite restore row verification failed.");
        }

        if (!sameData(decodeAllCollections(actual), source)) {
          throw new Error("SQLite restore round-trip mismatch.");
        }
      });

      transactionCompleted = true;

      // ===================================
      // 7. POST-COMMIT VERIFICATION
      // ===================================

      const saved = await readRows(db);

      if (!sameData(saved, encoded)) {
        throw new Error("Committed records do not match the backup.");
      }

      if (!sameData(decodeAllCollections(saved), source)) {
        throw new Error("Committed restore round-trip mismatch.");
      }

      await assertSQLiteIntegrity(db);

      // ===================================
      // 8. FINALIZE VERIFIED RECOVERY
      // ===================================

      // No more database validation or
      // mutation should follow this call.
      //
      // The marker is cleared only after
      // every required verification succeeds.

      await finishVerifiedSQLiteRestoreRecovery(operationId);
    } catch (error) {
      console.error("[Shavro SQLite] Restore failed:", {
        operationId,
        transactionCompleted,
        error,
      });

      // The recovery marker is deliberately
      // not removed in this catch block.
      //
      // Even if SQLite rolled back, recovery
      // must establish a trustworthy state.

      if (transactionCompleted) {
        throw new Error(
          "SQLite restore transaction completed, " +
            "but post-commit verification or finalization " +
            "failed. The restore outcome requires " +
            "reconciliation. Do not modify financial " +
            "records or repeat the restore.",
        );
      }

      throw new Error(
        "SQLite restore could not complete safely. " +
          "Recovery verification is required before " +
          "further financial operations.",
      );
    }
  });
}
