import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type * as SQLite from "expo-sqlite";

import type { Expense } from "../types/expense";
import type { Income } from "../types/income";

import { getShavroDatabase } from "./shavroDatabase.native";

import {
  runMigrationPreflight,
  rupeesToPaise,
} from "./sqliteMigrationPreflight.native";

import { runExclusiveStorageOperation } from "../services/storageOperationGuard";

import { assertNoPendingRestoreRecovery } from "../services/restoreRecoveryState";

// =========================================
// CONSTANTS
// =========================================

const EXPENSE_KEY = "shavro_expenses_v1";
const INCOME_KEY = "shavro_income_v1";

const MIGRATION_ID = "native_income_expense_copy_v1";

// =========================================
// TYPES
// =========================================

interface MigrationStateRow {
  migration_id: string;
  status: string;
  completed_at: string | null;
}

interface FinancialRow {
  id: string;
  amount_paise: number;
  category_id: string;
  payment_method_id: string | null;
  other_method_name: string | null;
  transaction_date: string;
  notes: string;
  created_at: string;
}

interface ExpenseRow extends FinancialRow {
  expense_name: string | null;
}

interface IncomeRow extends FinancialRow {
  income_name: string | null;
}

export interface SQLiteCopyResult {
  status: "copied" | "already_copied";
  expenseCount: number;
  incomeCount: number;
  totalCount: number;
}

// =========================================
// SOURCE SNAPSHOT
// =========================================

interface SourceSnapshot {
  rawExpenses: string | null;
  rawIncomes: string | null;
}

async function readSource(): Promise<SourceSnapshot> {
  const [rawExpenses, rawIncomes] = await Promise.all([
    AsyncStorage.getItem(EXPENSE_KEY),
    AsyncStorage.getItem(INCOME_KEY),
  ]);

  return { rawExpenses, rawIncomes };
}

function sameSource(first: SourceSnapshot, second: SourceSnapshot): boolean {
  return (
    first.rawExpenses === second.rawExpenses &&
    first.rawIncomes === second.rawIncomes
  );
}

/**
 * Preflight has already validated both
 * JSON arrays and all their records.
 *
 * The raw snapshot is checked before and
 * after preflight to prevent using a
 * different source from the validated one.
 */
async function getValidatedSource(): Promise<{
  snapshot: SourceSnapshot;
  expenses: Expense[];
  incomes: Income[];
}> {
  const snapshot = await readSource();

  const preflight = await runMigrationPreflight();

  const afterValidation = await readSource();

  if (!sameSource(snapshot, afterValidation)) {
    throw new Error("Financial records changed during migration validation.");
  }

  const expenses = JSON.parse(snapshot.rawExpenses ?? "[]") as Expense[];

  const incomes = JSON.parse(snapshot.rawIncomes ?? "[]") as Income[];

  if (
    expenses.length !== preflight.expenseCount ||
    incomes.length !== preflight.incomeCount
  ) {
    throw new Error("Migration source counts changed unexpectedly.");
  }

  return { snapshot, expenses, incomes };
}

// =========================================
// DESTINATION VERIFICATION
// =========================================

async function verifyCopiedRecords(
  db: SQLite.SQLiteDatabase,
  expenses: Expense[],
  incomes: Income[],
): Promise<void> {
  const savedExpenses = await db.getAllAsync<ExpenseRow>(
    `SELECT *
     FROM expenses`,
  );

  const savedIncomes = await db.getAllAsync<IncomeRow>(
    `SELECT *
     FROM incomes`,
  );

  if (
    savedExpenses.length !== expenses.length ||
    savedIncomes.length !== incomes.length
  ) {
    throw new Error("SQLite migration record-count verification failed.");
  }

  const expenseMap = new Map(savedExpenses.map((item) => [item.id, item]));

  const incomeMap = new Map(savedIncomes.map((item) => [item.id, item]));

  // =======================================
  // VERIFY EVERY EXPENSE
  // =======================================

  for (const expense of expenses) {
    const saved = expenseMap.get(expense.id);

    if (!saved) {
      throw new Error(`SQLite expense is missing: ${expense.id}`);
    }

    if (
      saved.amount_paise !== rupeesToPaise(expense.amount) ||
      saved.category_id !== expense.categoryId ||
      saved.expense_name !== expense.expenseName ||
      saved.payment_method_id !== expense.paymentMethodId ||
      saved.other_method_name !== expense.otherMethodName ||
      saved.transaction_date !== expense.transactionDate ||
      saved.notes !== expense.notes ||
      saved.created_at !== expense.createdAt
    ) {
      throw new Error(`SQLite expense data mismatch: ${expense.id}`);
    }
  }

  // =======================================
  // VERIFY EVERY INCOME
  // =======================================

  for (const income of incomes) {
    const saved = incomeMap.get(income.id);

    if (!saved) {
      throw new Error(`SQLite income is missing: ${income.id}`);
    }

    if (
      saved.amount_paise !== rupeesToPaise(income.amount) ||
      saved.category_id !== income.categoryId ||
      saved.income_name !== income.incomeName ||
      saved.payment_method_id !== (income.paymentMethodId ?? null) ||
      saved.other_method_name !== (income.otherMethodName ?? null) ||
      saved.transaction_date !== income.transactionDate ||
      saved.notes !== income.notes ||
      saved.created_at !== income.createdAt
    ) {
      throw new Error(`SQLite income data mismatch: ${income.id}`);
    }
  }
}

// =========================================
// COPY RECORDS
// =========================================

async function insertExpenses(
  tx: SQLite.SQLiteDatabase,
  expenses: Expense[],
): Promise<void> {
  for (const expense of expenses) {
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
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        expense.id,
        rupeesToPaise(expense.amount),
        expense.categoryId,
        expense.expenseName,
        expense.paymentMethodId,
        expense.otherMethodName,
        expense.transactionDate,
        expense.notes,
        expense.createdAt,
      ],
    );
  }
}

async function insertIncomes(
  tx: SQLite.SQLiteDatabase,
  incomes: Income[],
): Promise<void> {
  for (const income of incomes) {
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
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        income.id,
        rupeesToPaise(income.amount),
        income.categoryId,
        income.incomeName,
        income.paymentMethodId ?? null,
        income.otherMethodName ?? null,
        income.transactionDate,
        income.notes,
        income.createdAt,
      ],
    );
  }
}

// =========================================
// MAIN NON-DESTRUCTIVE IMPORTER
// =========================================

/**
 * Copies validated native financial data
 * from AsyncStorage into SQLite.
 *
 * Important:
 * - Not connected to App.tsx startup
 * - Does not activate SQLite storage
 * - Does not delete source records
 * - Does not overwrite existing SQL rows
 * - Uses the existing exclusive guard
 *
 * A repeat execution verifies the existing
 * copy instead of inserting duplicates.
 */
export async function copyFinancialDataToSQLite(): Promise<SQLiteCopyResult> {
  if (Platform.OS === "web") {
    throw new Error("Native SQLite migration is unavailable on web.");
  }

  return runExclusiveStorageOperation(async () => {
    // -------------------------------------
    // STEP 1: RESTORE SAFETY
    // -------------------------------------

    await assertNoPendingRestoreRecovery();

    // -------------------------------------
    // STEP 2: VALIDATE SOURCE DATA
    // -------------------------------------

    const { snapshot, expenses, incomes } = await getValidatedSource();

    // -------------------------------------
    // STEP 3: OPEN DATABASE
    // -------------------------------------

    const db = await getShavroDatabase();

    const existingState = await db.getFirstAsync<MigrationStateRow>(
      `SELECT migration_id, status, completed_at
         FROM migration_state
         WHERE migration_id = ?`,
      [MIGRATION_ID],
    );

    const anyMigrationState = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count
         FROM migration_state`,
    );

    if (!anyMigrationState) {
      throw new Error("Cannot inspect SQLite migration state.");
    }

    // -------------------------------------
    // STEP 4: REPEAT EXECUTION
    // -------------------------------------

    if (existingState) {
      if (
        existingState.status !== "completed" ||
        !existingState.completed_at ||
        anyMigrationState.count !== 1
      ) {
        throw new Error("SQLite migration has an unresolved state.");
      }

      await verifyCopiedRecords(db, expenses, incomes);

      const sourceAfter = await readSource();

      if (!sameSource(snapshot, sourceAfter)) {
        throw new Error("Source records changed during verification.");
      }

      return {
        status: "already_copied",
        expenseCount: expenses.length,
        incomeCount: incomes.length,
        totalCount: expenses.length + incomes.length,
      };
    }

    if (anyMigrationState.count !== 0) {
      throw new Error("Unknown SQLite migration state exists.");
    }

    // -------------------------------------
    // STEP 5: VERIFY EMPTY DESTINATION
    // -------------------------------------

    const expenseCount = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM expenses",
    );

    const incomeCount = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM incomes",
    );

    if (
      !expenseCount ||
      !incomeCount ||
      expenseCount.count !== 0 ||
      incomeCount.count !== 0
    ) {
      throw new Error("Destination database is not empty. Migration stopped.");
    }

    // -------------------------------------
    // STEP 6: ATOMIC DATABASE TRANSACTION
    // -------------------------------------

    await db.withExclusiveTransactionAsync(async (tx) => {
      // Recheck destination inside transaction.
      const expenseRows = await tx.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM expenses",
      );

      const incomeRows = await tx.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM incomes",
      );

      const migrationRows = await tx.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM migration_state",
      );

      if (
        !expenseRows ||
        !incomeRows ||
        !migrationRows ||
        expenseRows.count !== 0 ||
        incomeRows.count !== 0 ||
        migrationRows.count !== 0
      ) {
        throw new Error("SQLite destination changed before import.");
      }

      // Insert financial rows.
      await insertExpenses(tx, expenses);
      await insertIncomes(tx, incomes);

      // Verify all rows before commit.
      await verifyCopiedRecords(tx, expenses, incomes);

      // Recheck that AsyncStorage source
      // still matches the validated snapshot.
      const sourceAfter = await readSource();

      if (!sameSource(snapshot, sourceAfter)) {
        throw new Error("Source records changed during import.");
      }

      // The completion marker and records
      // commit in the same SQL transaction.
      await tx.runAsync(
        `INSERT INTO migration_state (
            migration_id,
            status,
            completed_at
          ) VALUES (?, ?, ?)`,
        [MIGRATION_ID, "completed", new Date().toISOString()],
      );
    });

    // -------------------------------------
    // STEP 7: VERIFY COMMITTED STATE
    // -------------------------------------

    const committed = await db.getFirstAsync<MigrationStateRow>(
      `SELECT migration_id, status, completed_at
         FROM migration_state
         WHERE migration_id = ?`,
      [MIGRATION_ID],
    );

    if (committed?.status !== "completed" || !committed.completed_at) {
      throw new Error("SQLite migration completion was not verified.");
    }

    await verifyCopiedRecords(db, expenses, incomes);

    const sourceAfterCommit = await readSource();

    if (!sameSource(snapshot, sourceAfterCommit)) {
      throw new Error("Source records changed after SQLite import.");
    }

    console.log("[Shavro Migration] SQLite copy verified.", {
      expenses: expenses.length,
      incomes: incomes.length,
      total: expenses.length + incomes.length,
    });

    return {
      status: "copied",
      expenseCount: expenses.length,
      incomeCount: incomes.length,
      totalCount: expenses.length + incomes.length,
    };
  });
}
