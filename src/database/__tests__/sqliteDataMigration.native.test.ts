import AsyncStorage from "@react-native-async-storage/async-storage";

import type * as SQLite from "expo-sqlite";

import { jest, describe, it, expect, beforeEach } from "@jest/globals";

import { getShavroDatabase } from "../shavroDatabase.native";

import { runMigrationPreflight } from "../sqliteMigrationPreflight.native";

import { assertNoPendingRestoreRecovery } from "../../services/restoreRecoveryState";

import { copyFinancialDataToSQLite } from "../sqliteDataMigration.native";

// =========================================
// JEST MOCKS
// =========================================

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

jest.mock("@react-native-async-storage/async-storage", () => {
  const mockJest = require("@jest/globals").jest;

  return {
    __esModule: true,
    default: {
      getItem: mockJest.fn(),
    },
  };
});

jest.mock("../shavroDatabase.native", () => {
  const mockJest = require("@jest/globals").jest;

  return {
    getShavroDatabase: mockJest.fn(),
  };
});

jest.mock("../sqliteMigrationPreflight.native", () => {
  const mockJest = require("@jest/globals").jest;

  return {
    runMigrationPreflight: mockJest.fn(),

    rupeesToPaise: mockJest.fn((amount: number): number => {
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Invalid amount");
      }

      const value = amount.toString();

      if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
        throw new Error("Invalid amount precision");
      }

      const [rupees, fraction = ""] = value.split(".");

      const whole = Number(rupees);
      const paise = Number(fraction.padEnd(2, "0"));

      const result = whole * 100 + paise;

      if (!Number.isSafeInteger(result) || result <= 0) {
        throw new Error("Invalid amount range");
      }

      return result;
    }),
  };
});

jest.mock("../../services/storageOperationGuard", () => ({
  runExclusiveStorageOperation: async <T>(
    operation: () => Promise<T>,
  ): Promise<T> => operation(),
}));

jest.mock("../../services/restoreRecoveryState", () => {
  const mockJest = require("@jest/globals").jest;

  return {
    assertNoPendingRestoreRecovery: mockJest.fn(),
  };
});

// =========================================
// TYPES
// =========================================

type Row = Record<string, unknown>;

interface MigrationRow {
  migration_id: string;
  status: string;
  completed_at: string;
}

interface FakeState {
  expenses: Row[];
  incomes: Row[];
  migrations: MigrationRow[];
}

// =========================================
// TEST FINANCIAL RECORDS
// =========================================

const expense = {
  id: "expense-1",
  amount: 500.25,
  categoryId: "food",
  expenseName: null,
  paymentMethodId: "upi",
  otherMethodName: null,
  transactionDate: "2026-11-18",
  notes: "Lunch",
  createdAt: "2026-11-18T10:00:00.000Z",
};

const income = {
  id: "income-1",
  amount: 50000,
  categoryId: "salary",
  incomeName: null,
  paymentMethodId: "bank",
  otherMethodName: null,
  transactionDate: "2026-11-18",
  notes: "Salary",
  createdAt: "2026-11-18T09:00:00.000Z",
};

// =========================================
// FAKE SQLITE DATABASE
// =========================================

/**
 * In-memory database used only by Jest.
 *
 * It supports exactly the SQL operations
 * needed by sqliteDataMigration.native.ts.
 *
 * It also simulates transaction rollback.
 *
 * No real database or financial data is
 * accessed by these tests.
 */
function createFakeDatabase() {
  const state: FakeState = {
    expenses: [],
    incomes: [],
    migrations: [],
  };

  let failIncomeInsert = false;

  // =======================================
  // SELECT ONE ROW
  // =======================================

  async function getFirstAsync(
    sql: string,
  ): Promise<Row | MigrationRow | null> {
    if (
      sql.includes("FROM migration_state") &&
      sql.includes("WHERE migration_id")
    ) {
      return state.migrations[0] ?? null;
    }

    if (sql.includes("COUNT(*)")) {
      if (sql.includes("FROM expenses")) {
        return {
          count: state.expenses.length,
        };
      }

      if (sql.includes("FROM incomes")) {
        return {
          count: state.incomes.length,
        };
      }

      if (sql.includes("FROM migration_state")) {
        return {
          count: state.migrations.length,
        };
      }
    }

    throw new Error(`Unexpected SELECT statement: ${sql}`);
  }

  // =======================================
  // SELECT MULTIPLE ROWS
  // =======================================

  async function getAllAsync(sql: string): Promise<Row[]> {
    if (sql.includes("FROM expenses")) {
      return state.expenses.map((row) => ({
        ...row,
      }));
    }

    if (sql.includes("FROM incomes")) {
      return state.incomes.map((row) => ({
        ...row,
      }));
    }

    throw new Error(`Unexpected SELECT statement: ${sql}`);
  }

  // =======================================
  // INSERT DATA
  // =======================================

  async function runAsync(sql: string, values: unknown[]): Promise<void> {
    if (sql.includes("INSERT INTO expenses")) {
      state.expenses.push({
        id: values[0],
        amount_paise: values[1],
        category_id: values[2],
        expense_name: values[3],
        payment_method_id: values[4],
        other_method_name: values[5],
        transaction_date: values[6],
        notes: values[7],
        created_at: values[8],
      });

      return;
    }

    if (sql.includes("INSERT INTO incomes")) {
      if (failIncomeInsert) {
        throw new Error("Simulated SQLite insert failure");
      }

      state.incomes.push({
        id: values[0],
        amount_paise: values[1],
        category_id: values[2],
        income_name: values[3],
        payment_method_id: values[4],
        other_method_name: values[5],
        transaction_date: values[6],
        notes: values[7],
        created_at: values[8],
      });

      return;
    }

    if (sql.includes("INSERT INTO migration_state")) {
      state.migrations.push({
        migration_id: String(values[0]),
        status: String(values[1]),
        completed_at: String(values[2]),
      });

      return;
    }

    throw new Error(`Unexpected INSERT statement: ${sql}`);
  }

  // =======================================
  // DATABASE TRANSACTION
  // =======================================

  /**
   * The fake transaction captures the
   * original in-memory state.
   *
   * On failure, it restores all three
   * collections to their original values.
   */
  async function withExclusiveTransactionAsync(
    operation: (tx: typeof db) => Promise<void>,
  ): Promise<void> {
    const snapshot: FakeState = {
      expenses: state.expenses.map((row) => ({
        ...row,
      })),

      incomes: state.incomes.map((row) => ({
        ...row,
      })),

      migrations: state.migrations.map((row) => ({
        ...row,
      })),
    };

    try {
      await operation(db);
    } catch (error) {
      state.expenses = snapshot.expenses;
      state.incomes = snapshot.incomes;
      state.migrations = snapshot.migrations;

      throw error;
    }
  }

  const db = {
    getFirstAsync,
    getAllAsync,
    runAsync,
    withExclusiveTransactionAsync,
  };

  return {
    db,
    state,

    failNextIncomeInsert(): void {
      failIncomeInsert = true;
    },
  };
}

// =========================================
// SQLITE MIGRATION TEST SUITE
// =========================================

describe("SQLite financial data migration", () => {
  let fake: ReturnType<typeof createFakeDatabase>;

  // =======================================
  // TEST SETUP
  // =======================================

  beforeEach(() => {
    jest.clearAllMocks();

    fake = createFakeDatabase();

    /**
     * The real SQLite connection is replaced
     * with our in-memory fake database.
     */
    jest
      .mocked(getShavroDatabase)
      .mockResolvedValue(fake.db as unknown as SQLite.SQLiteDatabase);

    /**
     * Default condition:
     * No pending restore recovery.
     */
    jest.mocked(assertNoPendingRestoreRecovery).mockResolvedValue(undefined);

    /**
     * Preflight validation is mocked
     * to represent two valid records.
     */
    jest.mocked(runMigrationPreflight).mockResolvedValue({
      ready: true,
      expenseCount: 1,
      incomeCount: 1,
      totalCount: 2,
    });

    /**
     * Mock AsyncStorage financial records.
     *
     * This uses disposable test data only.
     */
    jest
      .mocked(AsyncStorage.getItem)
      .mockImplementation(async (key: string) => {
        if (key === "shavro_expenses_v1") {
          return JSON.stringify([expense]);
        }

        if (key === "shavro_income_v1") {
          return JSON.stringify([income]);
        }

        return null;
      });
  });

  // =======================================
  // TEST 1 — SUCCESSFUL DATA COPY
  // =======================================

  it("copies all financial records and commits migration state", async () => {
    const result = await copyFinancialDataToSQLite();

    expect(result).toEqual({
      status: "copied",
      expenseCount: 1,
      incomeCount: 1,
      totalCount: 2,
    });

    expect(fake.state.expenses).toHaveLength(1);
    expect(fake.state.incomes).toHaveLength(1);

    expect(fake.state.expenses[0].amount_paise).toBe(50025);

    expect(fake.state.incomes[0].amount_paise).toBe(5000000);

    expect(fake.state.migrations).toHaveLength(1);

    expect(fake.state.migrations[0].status).toBe("completed");

    expect(fake.state.expenses[0].id).toBe(expense.id);

    expect(fake.state.incomes[0].id).toBe(income.id);
  });

  // =======================================
  // TEST 2 — REPEATED MIGRATION
  // =======================================

  it("does not duplicate records on repeat execution", async () => {
    await copyFinancialDataToSQLite();

    const result = await copyFinancialDataToSQLite();

    expect(result.status).toBe("already_copied");

    expect(fake.state.expenses).toHaveLength(1);
    expect(fake.state.incomes).toHaveLength(1);
    expect(fake.state.migrations).toHaveLength(1);
  });

  // =======================================
  // TEST 3 — EXISTING DESTINATION
  // =======================================

  it("rejects a destination that already has financial records", async () => {
    fake.state.expenses.push({
      id: "existing-expense",
    });

    await expect(copyFinancialDataToSQLite()).rejects.toThrow(
      "Destination database is not empty",
    );

    expect(fake.state.expenses).toHaveLength(1);
    expect(fake.state.incomes).toHaveLength(0);
    expect(fake.state.migrations).toHaveLength(0);
  });

  // =======================================
  // TEST 4 — TRANSACTION ROLLBACK
  // =======================================

  it("rolls back all inserted records when an SQL insert fails", async () => {
    fake.failNextIncomeInsert();

    await expect(copyFinancialDataToSQLite()).rejects.toThrow(
      "Simulated SQLite insert failure",
    );

    expect(fake.state.expenses).toHaveLength(0);
    expect(fake.state.incomes).toHaveLength(0);
    expect(fake.state.migrations).toHaveLength(0);
  });

  // =======================================
  // TEST 5 — PENDING RESTORE
  // =======================================

  it("blocks migration when restore recovery is unresolved", async () => {
    jest
      .mocked(assertNoPendingRestoreRecovery)
      .mockRejectedValue(new Error("Pending restore recovery"));

    await expect(copyFinancialDataToSQLite()).rejects.toThrow(
      "Pending restore recovery",
    );

    expect(getShavroDatabase).not.toHaveBeenCalled();

    expect(fake.state.expenses).toHaveLength(0);
    expect(fake.state.incomes).toHaveLength(0);
  });

  // =======================================
  // TEST 6 — INVALID SOURCE DATA
  // =======================================

  it("stops before SQL writes if source validation fails", async () => {
    jest
      .mocked(runMigrationPreflight)
      .mockRejectedValue(new Error("Expenses: duplicate record ID"));

    await expect(copyFinancialDataToSQLite()).rejects.toThrow(
      "duplicate record ID",
    );

    expect(getShavroDatabase).not.toHaveBeenCalled();

    expect(fake.state.migrations).toHaveLength(0);
  });

  // =======================================
  // TEST 7 — STALE SQLITE COPY
  // =======================================

  it("rejects an outdated SQLite copy when source records change", async () => {
    // Initial successful migration.
    await copyFinancialDataToSQLite();

    expect(fake.state.expenses).toHaveLength(1);

    const newExpense = {
      ...expense,
      id: "expense-2",
      amount: 750,
      notes: "New expense after initial copy",
    };

    // Simulate AsyncStorage changing after
    // SQLite has already been populated.
    jest
      .mocked(AsyncStorage.getItem)
      .mockImplementation(async (key: string) => {
        if (key === "shavro_expenses_v1") {
          return JSON.stringify([expense, newExpense]);
        }

        if (key === "shavro_income_v1") {
          return JSON.stringify([income]);
        }

        return null;
      });

    jest.mocked(runMigrationPreflight).mockResolvedValue({
      ready: true,
      expenseCount: 2,
      incomeCount: 1,
      totalCount: 3,
    });

    await expect(copyFinancialDataToSQLite()).rejects.toThrow(
      "SQLite migration record-count verification failed",
    );

    // No duplicate or partial records inserted.
    expect(fake.state.expenses).toHaveLength(1);
    expect(fake.state.incomes).toHaveLength(1);
    expect(fake.state.migrations).toHaveLength(1);
  });

  // =======================================
  // TEST 8 — UNRESOLVED MIGRATION STATE
  // =======================================

  it("blocks migration when an incomplete migration marker exists", async () => {
    fake.state.migrations.push({
      migration_id: "native_income_expense_copy_v1",
      status: "started",
      completed_at: "",
    });

    await expect(copyFinancialDataToSQLite()).rejects.toThrow(
      "SQLite migration has an unresolved state",
    );

    expect(fake.state.expenses).toHaveLength(0);
    expect(fake.state.incomes).toHaveLength(0);

    // Preserve the marker for investigation.
    expect(fake.state.migrations).toHaveLength(1);
    expect(fake.state.migrations[0].status).toBe("started");
  });

  // =======================================
  // TEST 9 — ALTERED SQLITE COPY
  // =======================================

  it("rejects a previously copied record with mismatched financial data", async () => {
    await copyFinancialDataToSQLite();

    // Simulate an unexpected change to
    // an existing SQLite expense row.
    fake.state.expenses[0].amount_paise = 100;

    await expect(copyFinancialDataToSQLite()).rejects.toThrow(
      "SQLite expense data mismatch",
    );

    // The importer must not silently
    // overwrite mismatched information.
    expect(fake.state.expenses[0].amount_paise).toBe(100);

    expect(fake.state.migrations).toHaveLength(1);
  });

  // =========================================
  // TEST 10 — SAME COUNT, CHANGED DATA
  // =========================================

  it("detects changed source data even when record counts match", async () => {
    // Create the first verified SQLite copy.
    await copyFinancialDataToSQLite();

    expect(fake.state.expenses).toHaveLength(1);

    // Same ID and record count, but a
    // different financial amount.
    const changedExpense = {
      ...expense,
      amount: 850.75,
    };

    jest
      .mocked(AsyncStorage.getItem)
      .mockImplementation(async (key: string) => {
        if (key === "shavro_expenses_v1") {
          return JSON.stringify([changedExpense]);
        }

        if (key === "shavro_income_v1") {
          return JSON.stringify([income]);
        }

        return null;
      });

    await expect(copyFinancialDataToSQLite()).rejects.toThrow(
      "SQLite expense data mismatch",
    );

    // The existing SQLite copy must remain
    // unchanged after the failed check.
    expect(fake.state.expenses[0].amount_paise).toBe(50025);

    expect(fake.state.expenses).toHaveLength(1);
    expect(fake.state.incomes).toHaveLength(1);
    expect(fake.state.migrations).toHaveLength(1);
  });

  // =========================================
  // TEST 11 — SOURCE CHANGED DURING IMPORT
  // =========================================

  it("rolls back when source data changes during import", async () => {
    let expenseReadCount = 0;

    const changedExpense = {
      ...expense,
      amount: 900,
    };

    jest
      .mocked(AsyncStorage.getItem)
      .mockImplementation(async (key: string) => {
        if (key === "shavro_expenses_v1") {
          expenseReadCount += 1;

          // First two reads are the same:
          // initial snapshot and preflight
          // snapshot comparison.
          //
          // Third read happens during the
          // database transaction.
          return JSON.stringify(
            expenseReadCount >= 3 ? [changedExpense] : [expense],
          );
        }

        if (key === "shavro_income_v1") {
          return JSON.stringify([income]);
        }

        return null;
      });

    await expect(copyFinancialDataToSQLite()).rejects.toThrow(
      "Source records changed during import",
    );

    // No partial SQLite copy may survive.
    expect(fake.state.expenses).toHaveLength(0);
    expect(fake.state.incomes).toHaveLength(0);
    expect(fake.state.migrations).toHaveLength(0);
  });
});
