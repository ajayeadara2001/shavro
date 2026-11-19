import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";

// A disposable test database.
// NEVER use "shavro_finance.db" here.
const TEST_DATABASE = "shavro_sqlite_integration_test.db";

interface CountRow {
  count: number;
}

interface ExpenseRow {
  id: string;
  amount_paise: number;
}

interface OptionRow {
  id: string;
  name: string;
  archived: number | null;
  position: number;
}

export interface SQLiteIntegrationResult {
  commitVerified: boolean;
  rollbackVerified: boolean;
  constraintsVerified: boolean;
  orderingVerified: boolean;
  persistenceVerified: boolean;
}

let runningCheck: Promise<SQLiteIntegrationResult> | null = null;

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[SQLite Integration] ${message}`);
  }
}

async function countRows(
  db: SQLite.SQLiteDatabase,
  table: "test_expenses" | "test_options",
): Promise<number> {
  const result = await db.getFirstAsync<CountRow>(
    `SELECT COUNT(*) AS count FROM ${table}`,
  );

  if (!result) {
    throw new Error(`Cannot count rows in ${table}.`);
  }

  return result.count;
}

async function expectSqlFailure(
  operation: () => Promise<unknown>,
  message: string,
): Promise<void> {
  let failed = false;

  try {
    await operation();
  } catch {
    failed = true;
  }

  assertCondition(failed, message);
}

async function performIntegrationCheck(): Promise<SQLiteIntegrationResult> {
  if (Platform.OS === "web") {
    throw new Error("Native SQLite integration test is unavailable on web.");
  }

  if (!__DEV__) {
    throw new Error("SQLite integration check is development-only.");
  }

  let db: SQLite.SQLiteDatabase | null = null;

  try {
    // =====================================
    // 1. OPEN DISPOSABLE DATABASE
    // =====================================

    db = await SQLite.openDatabaseAsync(TEST_DATABASE);

    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS test_expenses (
        id TEXT PRIMARY KEY NOT NULL,
        amount_paise INTEGER NOT NULL
          CHECK(amount_paise > 0)
      );

      CREATE TABLE IF NOT EXISTS test_options (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        archived INTEGER
          CHECK(
            archived IS NULL OR
            archived IN (0, 1)
          ),
        position INTEGER NOT NULL
          CHECK(position >= 0)
      );
    `);

    // Reset only the disposable test tables.
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(`
          DELETE FROM test_expenses;
          DELETE FROM test_options;
        `);
    });

    // =====================================
    // 2. VERIFY COMMITTED TRANSACTION
    // =====================================

    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        `INSERT INTO test_expenses
           (id, amount_paise)
           VALUES (?, ?)`,
        ["expense-1", 50025],
      );

      // Insert deliberately out of order.
      await tx.runAsync(
        `INSERT INTO test_options
           (id, name, archived, position)
           VALUES (?, ?, ?, ?)`,
        ["option-second", "Second", 1, 1],
      );

      await tx.runAsync(
        `INSERT INTO test_options
           (id, name, archived, position)
           VALUES (?, ?, ?, ?)`,
        ["option-first", "First", null, 0],
      );
    });

    const committedExpense = await db.getFirstAsync<ExpenseRow>(
      `SELECT id, amount_paise
         FROM test_expenses
         WHERE id = ?`,
      ["expense-1"],
    );

    assertCondition(
      committedExpense?.amount_paise === 50025,
      "Committed expense was not preserved.",
    );

    const commitVerified = true;

    // =====================================
    // 3. VERIFY EXPLICIT ORDERING
    // =====================================

    const options = await db.getAllAsync<OptionRow>(
      `SELECT id, name, archived, position
         FROM test_options
         ORDER BY position ASC`,
    );

    assertCondition(
      options.length === 2 &&
        options[0].id === "option-first" &&
        options[0].archived === null &&
        options[0].position === 0 &&
        options[1].id === "option-second" &&
        options[1].archived === 1 &&
        options[1].position === 1,
      "Custom-option order or archived values changed.",
    );

    const orderingVerified = true;

    // =====================================
    // 4. VERIFY TRANSACTION ROLLBACK
    // =====================================

    const rollbackMarker = "intentional-rollback-test";

    let rollbackErrorObserved = false;

    try {
      await db.withExclusiveTransactionAsync(async (tx) => {
        await tx.runAsync(
          `INSERT INTO test_expenses
             (id, amount_paise)
             VALUES (?, ?)`,
          ["should-rollback", 99999],
        );

        await tx.runAsync(
          `INSERT INTO test_options
             (id, name, archived, position)
             VALUES (?, ?, ?, ?)`,
          ["should-rollback-option", "Rollback", 0, 2],
        );

        // Deliberately abort the transaction.
        throw new Error(rollbackMarker);
      });
    } catch (error) {
      if (error instanceof Error && error.message === rollbackMarker) {
        rollbackErrorObserved = true;
      } else {
        throw error;
      }
    }

    assertCondition(
      rollbackErrorObserved,
      "Expected transaction abort was not observed.",
    );

    const expensesAfterRollback = await countRows(db, "test_expenses");

    const optionsAfterRollback = await countRows(db, "test_options");

    assertCondition(
      expensesAfterRollback === 1 && optionsAfterRollback === 2,
      "Transaction rollback left partial records.",
    );

    const rollbackVerified = true;

    // =====================================
    // 5. VERIFY SQLITE CONSTRAINTS
    // =====================================

    await expectSqlFailure(
      () =>
        db!.runAsync(
          `INSERT INTO test_expenses
           (id, amount_paise)
           VALUES (?, ?)`,
          ["invalid-amount", -100],
        ),
      "Negative amount was accepted.",
    );

    await expectSqlFailure(
      () =>
        db!.runAsync(
          `INSERT INTO test_expenses
           (id, amount_paise)
           VALUES (?, ?)`,
          ["expense-1", 100],
        ),
      "Duplicate expense ID was accepted.",
    );

    await expectSqlFailure(
      () =>
        db!.runAsync(
          `INSERT INTO test_options
           (id, name, archived, position)
           VALUES (?, ?, ?, ?)`,
          ["invalid-archived", "Invalid", 5, 3],
        ),
      "Invalid archived value was accepted.",
    );

    assertCondition(
      (await countRows(db, "test_expenses")) === 1 &&
        (await countRows(db, "test_options")) === 2,
      "Constraint tests unexpectedly modified records.",
    );

    const constraintsVerified = true;

    // =====================================
    // 6. VERIFY DURABILITY AFTER REOPEN
    // =====================================

    await db.closeAsync();
    db = null;

    db = await SQLite.openDatabaseAsync(TEST_DATABASE);

    const persistedExpense = await db.getFirstAsync<ExpenseRow>(
      `SELECT id, amount_paise
         FROM test_expenses
         WHERE id = ?`,
      ["expense-1"],
    );

    const persistedOptions = await db.getAllAsync<OptionRow>(
      `SELECT id, name, archived, position
         FROM test_options
         ORDER BY position ASC`,
    );

    assertCondition(
      persistedExpense?.amount_paise === 50025 &&
        persistedOptions.length === 2 &&
        persistedOptions[0].id === "option-first" &&
        persistedOptions[0].archived === null &&
        persistedOptions[1].id === "option-second",
      "Saved data did not survive database reopen.",
    );

    const persistenceVerified = true;

    const result: SQLiteIntegrationResult = {
      commitVerified,
      rollbackVerified,
      constraintsVerified,
      orderingVerified,
      persistenceVerified,
    };

    console.log(
      "[Shavro SQLite Integration] All native checks passed.",
      result,
    );

    return result;
  } finally {
    if (db) {
      await db.closeAsync();
    }
  }
}

/**
 * Prevent overlapping executions of the
 * same disposable database test.
 */
export function runShavroSQLiteIntegrationCheck(): Promise<SQLiteIntegrationResult> {
  if (!runningCheck) {
    runningCheck = performIntegrationCheck().finally(() => {
      runningCheck = null;
    });
  }

  return runningCheck;
}
