import AsyncStorage from "@react-native-async-storage/async-storage";

import { jest, describe, it, expect, beforeEach } from "@jest/globals";

import type * as SQLite from "expo-sqlite";

import { getShavroDatabase } from "../shavroDatabase.native";

import { runMigrationPreflight } from "../sqliteMigrationPreflight.native";

import {
  readCustomOptionsSnapshot,
  readValidatedCustomOptionsSource,
} from "../sqliteCustomOptionsPreflight.native";

import { assertNoPendingRestoreRecovery } from "../../services/restoreRecoveryState";

import { copyAllDataToSQLite } from "../sqliteFullDataMigration.native";

// =========================================
// MODULE MOCKS
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

    rupeesToPaise: (amount: number): number => {
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Invalid amount");
      }

      const value = amount.toString();

      if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
        throw new Error("Invalid amount precision");
      }

      const [rupees, decimal = ""] = value.split(".");

      const result = Number(rupees) * 100 + Number(decimal.padEnd(2, "0"));

      if (!Number.isSafeInteger(result) || result <= 0) {
        throw new Error("Invalid amount range");
      }

      return result;
    },
  };
});

jest.mock("../sqliteCustomOptionsPreflight.native", () => {
  const mockJest = require("@jest/globals").jest;

  return {
    readCustomOptionsSnapshot: mockJest.fn(),

    readValidatedCustomOptionsSource: mockJest.fn(),

    customOptionsSnapshotsMatch: (
      first: {
        rawCategories: string | null;
        rawPaymentMethods: string | null;
      },
      second: {
        rawCategories: string | null;
        rawPaymentMethods: string | null;
      },
    ): boolean =>
      first.rawCategories === second.rawCategories &&
      first.rawPaymentMethods === second.rawPaymentMethods,
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
// TEST DATA
// =========================================

const MIGRATION_ID = "native_four_collection_copy_v4";

const EXPENSE_KEY = "shavro_expenses_v1";

const INCOME_KEY = "shavro_income_v1";

const expense = {
  id: "expense-001",
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
  id: "income-001",
  amount: 50000,
  categoryId: "salary",
  incomeName: null,
  paymentMethodId: "bank",
  otherMethodName: null,
  transactionDate: "2026-11-18",
  notes: "Salary",
  createdAt: "2026-11-18T09:00:00.000Z",
};

const categories = [
  {
    id: "category-001",
    name: "Freelancing",
    scope: "INCOME" as const,
    // Legacy: archived is absent.
  },
  {
    id: "category-002",
    name: "Old Travel",
    scope: "EXPENSE" as const,
    archived: true,
  },
];

const paymentMethods = [
  {
    id: "payment-001",
    name: "Gift Card",
    archived: false,
  },
  {
    id: "payment-002",
    name: "Old Wallet",
    // Legacy: archived is absent.
  },
];

const customSnapshot = {
  rawCategories: JSON.stringify(categories),
  rawPaymentMethods: JSON.stringify(paymentMethods),
};

// =========================================
// FAKE SQLITE TYPES
// =========================================

type SqlRow = Record<string, unknown>;

type TableName =
  | "expenses"
  | "incomes"
  | "custom_categories"
  | "custom_payment_methods";

interface MigrationRow {
  migration_id: string;
  status: string;
  completed_at: string | null;
}

interface FakeState {
  expenses: SqlRow[];
  incomes: SqlRow[];
  custom_categories: SqlRow[];
  custom_payment_methods: SqlRow[];
  migrations: MigrationRow[];
}

const TABLES: TableName[] = [
  "expenses",
  "incomes",
  "custom_categories",
  "custom_payment_methods",
];

// =========================================
// FAKE SQLITE DATABASE — VERSION 4
// =========================================

function createFakeDatabase() {
  const state: FakeState = {
    expenses: [],
    incomes: [],
    custom_categories: [],
    custom_payment_methods: [],
    migrations: [],
  };

  let failingTable: TableName | null = null;

  let schemaVersion = 4;

  // ---------------------------------------
  // FIND TABLE FROM SELECT
  // ---------------------------------------

  function getTable(sql: string): TableName | null {
    for (const table of TABLES) {
      if (sql.includes(`FROM ${table}`) || sql.includes(`INTO ${table}`)) {
        return table;
      }
    }

    return null;
  }

  // ---------------------------------------
  // SELECT FIRST
  // ---------------------------------------

  async function getFirstAsync(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<SqlRow | null> {
    // Version-4 importer requires this.
    if (sql.includes("PRAGMA user_version")) {
      return {
        user_version: schemaVersion,
      };
    }

    // Counts for four collections
    // and migration_state.
    if (/COUNT\(\*\)/i.test(sql)) {
      if (sql.includes("FROM migration_state")) {
        return {
          count: state.migrations.length,
        };
      }

      const table = getTable(sql);

      if (table) {
        return {
          count: state[table].length,
        };
      }
    }

    // The v4 writer verifies its own
    // completion marker inside the
    // same SQLite transaction.
    if (
      sql.includes("FROM migration_state") &&
      sql.includes("SELECT migration_id")
    ) {
      const migrationId = values[0];

      const row = state.migrations.find(
        (item) => item.migration_id === migrationId,
      );

      return row ? { ...row } : null;
    }

    throw new Error(`Unexpected getFirstAsync: ${sql}`);
  }

  // ---------------------------------------
  // SELECT ALL
  // ---------------------------------------

  async function getAllAsync(sql: string): Promise<SqlRow[]> {
    if (sql.includes("FROM migration_state")) {
      return state.migrations.map((row) => ({ ...row }));
    }

    const table = getTable(sql);

    if (!table) {
      throw new Error(`Unexpected getAllAsync: ${sql}`);
    }

    const rows = state[table].map((row) => ({ ...row }));

    if (sql.includes("ORDER BY position ASC")) {
      rows.sort((a, b) => Number(a.position) - Number(b.position));
    }

    return rows;
  }

  // ---------------------------------------
  // INSERT RECORDS
  // ---------------------------------------

  async function runAsync(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<void> {
    // Migration marker insertion.
    if (sql.includes("INSERT INTO migration_state")) {
      if (values.length !== 3) {
        throw new Error("Invalid migration marker values.");
      }

      const migrationId = String(values[0]);

      if (state.migrations.some((item) => item.migration_id === migrationId)) {
        throw new Error("Duplicate SQLite migration marker.");
      }

      state.migrations.push({
        migration_id: migrationId,
        status: String(values[1]),
        completed_at: values[2] === null ? null : String(values[2]),
      });

      return;
    }

    // Parse actual INSERT column names
    // instead of assuming v3 columns.
    //
    // This supports the v4 position
    // and optional income flags.
    const match = sql.match(
      /INSERT\s+INTO\s+([a-z_]+)\s*\(([^)]+)\)\s*VALUES/i,
    );

    if (!match) {
      throw new Error(`Unexpected runAsync: ${sql}`);
    }

    const tableName = match[1];

    if (!TABLES.includes(tableName as TableName)) {
      throw new Error(`Unknown SQL table: ${tableName}`);
    }

    const table = tableName as TableName;

    if (failingTable === table) {
      throw new Error(`Simulated SQL failure: ${table}`);
    }

    const columns = match[2].split(",").map((column) => column.trim());

    if (values.length !== columns.length) {
      throw new Error(`Invalid SQL values for ${table}`);
    }

    const row: SqlRow = {};

    columns.forEach((column, index) => {
      row[column] = values[index];
    });

    if (state[table].some((existing) => existing.id === row.id)) {
      throw new Error(`Duplicate SQL ID: ${String(row.id)}`);
    }

    state[table].push(row);
  }

  // ---------------------------------------
  // TYPED FAKE DATABASE
  // ---------------------------------------

  interface FakeDatabase {
    getFirstAsync: typeof getFirstAsync;

    getAllAsync: typeof getAllAsync;

    runAsync: typeof runAsync;

    withExclusiveTransactionAsync: (
      operation: (transaction: FakeDatabase) => Promise<void>,
    ) => Promise<void>;
  }

  const db: FakeDatabase = {
    getFirstAsync,
    getAllAsync,
    runAsync,

    withExclusiveTransactionAsync: async (operation): Promise<void> => {
      const snapshot: FakeState = {
        expenses: state.expenses.map((row) => ({ ...row })),

        incomes: state.incomes.map((row) => ({ ...row })),

        custom_categories: state.custom_categories.map((row) => ({ ...row })),

        custom_payment_methods: state.custom_payment_methods.map((row) => ({
          ...row,
        })),

        migrations: state.migrations.map((row) => ({ ...row })),
      };

      try {
        await operation(db);
      } catch (error) {
        // Simulate a complete SQLite
        // transaction rollback.
        state.expenses = snapshot.expenses;

        state.incomes = snapshot.incomes;

        state.custom_categories = snapshot.custom_categories;

        state.custom_payment_methods = snapshot.custom_payment_methods;

        state.migrations = snapshot.migrations;

        throw error;
      }
    },
  };

  return {
    db,
    state,

    failInserting(table: TableName): void {
      failingTable = table;
    },

    setSchemaVersion(version: number): void {
      schemaVersion = version;
    },
  };
}

// =========================================
// TEST SUITE
// =========================================

describe("SQLite four-collection migration", () => {
  let fake: ReturnType<typeof createFakeDatabase>;

  beforeEach(() => {
    jest.resetAllMocks();

    fake = createFakeDatabase();

    jest
      .mocked(getShavroDatabase)
      .mockResolvedValue(fake.db as unknown as SQLite.SQLiteDatabase);

    jest.mocked(assertNoPendingRestoreRecovery).mockResolvedValue(undefined);

    jest.mocked(runMigrationPreflight).mockResolvedValue({
      ready: true,
      expenseCount: 1,
      incomeCount: 1,
      totalCount: 2,
    });

    jest
      .mocked(AsyncStorage.getItem)
      .mockImplementation(async (key: string) => {
        if (key === EXPENSE_KEY) {
          return JSON.stringify([expense]);
        }

        if (key === INCOME_KEY) {
          return JSON.stringify([income]);
        }

        return null;
      });

    jest.mocked(readCustomOptionsSnapshot).mockResolvedValue(customSnapshot);

    jest.mocked(readValidatedCustomOptionsSource).mockResolvedValue({
      snapshot: customSnapshot,
      categories,
      paymentMethods,
    });
  });

  // =====================================
  // TEST 1 — SUCCESSFUL FULL COPY
  // =====================================

  it("copies all four collections and preserves order", async () => {
    const result = await copyAllDataToSQLite();

    expect(result).toEqual({
      status: "copied",
      expenseCount: 1,
      incomeCount: 1,
      categoryCount: 2,
      paymentMethodCount: 2,
      totalCount: 6,
    });

    expect(fake.state.expenses).toHaveLength(1);

    expect(fake.state.incomes).toHaveLength(1);

    expect(fake.state.custom_categories).toHaveLength(2);

    expect(fake.state.custom_payment_methods).toHaveLength(2);

    expect(fake.state.expenses[0].amount_paise).toBe(50025);

    expect(fake.state.incomes[0].amount_paise).toBe(5000000);

    // Version-4 transaction ordering.
    expect(fake.state.expenses[0].position).toBe(0);

    expect(fake.state.incomes[0].position).toBe(0);

    // Version-4 optional income flags.
    expect(fake.state.incomes[0].has_payment_method_id).toBe(1);

    expect(fake.state.incomes[0].has_other_method_name).toBe(1);

    expect(fake.state.custom_categories.map((row) => row.id)).toEqual([
      "category-001",
      "category-002",
    ]);

    expect(fake.state.custom_categories.map((row) => row.position)).toEqual([
      0, 1,
    ]);

    expect(fake.state.custom_categories.map((row) => row.archived)).toEqual([
      null,
      1,
    ]);

    expect(
      fake.state.custom_payment_methods.map((row) => row.archived),
    ).toEqual([0, null]);

    expect(fake.state.migrations).toHaveLength(1);

    expect(fake.state.migrations[0].migration_id).toBe(MIGRATION_ID);

    expect(fake.state.migrations[0].status).toBe("completed");
  });

  // =====================================
  // TEST 2 — REPEAT EXECUTION
  // =====================================

  it("does not duplicate records after a completed copy", async () => {
    await copyAllDataToSQLite();

    const result = await copyAllDataToSQLite();

    expect(result.status).toBe("already_copied");

    expect(fake.state.expenses).toHaveLength(1);

    expect(fake.state.incomes).toHaveLength(1);

    expect(fake.state.custom_categories).toHaveLength(2);

    expect(fake.state.custom_payment_methods).toHaveLength(2);

    expect(fake.state.migrations).toHaveLength(1);
  });

  // =====================================
  // TEST 3 — NONEMPTY DESTINATION
  // =====================================

  it("rejects preexisting SQLite records", async () => {
    fake.state.custom_categories.push({
      id: "unknown-category",
    });

    await expect(copyAllDataToSQLite()).rejects.toThrow(
      "custom_categories is not empty",
    );

    expect(fake.state.custom_categories).toHaveLength(1);

    expect(fake.state.expenses).toHaveLength(0);

    expect(fake.state.migrations).toHaveLength(0);
  });

  // =====================================
  // TEST 4 — COMPLETE ROLLBACK
  // =====================================

  it("rolls back all collections when a payment method insert fails", async () => {
    fake.failInserting("custom_payment_methods");

    await expect(copyAllDataToSQLite()).rejects.toThrow(
      "Simulated SQL failure",
    );

    expect(fake.state.expenses).toHaveLength(0);

    expect(fake.state.incomes).toHaveLength(0);

    expect(fake.state.custom_categories).toHaveLength(0);

    expect(fake.state.custom_payment_methods).toHaveLength(0);

    expect(fake.state.migrations).toHaveLength(0);
  });

  // =====================================
  // TEST 5 — INCOMPATIBLE MIGRATION
  // =====================================

  it("rejects an older two-collection migration marker", async () => {
    fake.state.migrations.push({
      migration_id: "native_income_expense_copy_v1",
      status: "completed",
      completed_at: "2026-11-18T10:00:00.000Z",
    });

    await expect(copyAllDataToSQLite()).rejects.toThrow(
      "SQLite contains an incompatible or incomplete migration",
    );

    expect(fake.state.migrations).toHaveLength(1);
  });

  // =====================================
  // TEST 6 — STALE FINANCIAL COPY
  // =====================================

  it("detects financial changes after the initial copy", async () => {
    await copyAllDataToSQLite();

    const updatedExpense = {
      ...expense,
      amount: 900,
    };

    jest
      .mocked(AsyncStorage.getItem)
      .mockImplementation(async (key: string) => {
        if (key === EXPENSE_KEY) {
          return JSON.stringify([updatedExpense]);
        }

        if (key === INCOME_KEY) {
          return JSON.stringify([income]);
        }

        return null;
      });

    await expect(copyAllDataToSQLite()).rejects.toThrow(
      "SQLite migration stored-row verification failed",
    );

    expect(fake.state.expenses[0].amount_paise).toBe(50025);

    expect(fake.state.migrations).toHaveLength(1);
  });

  // =====================================
  // TEST 7 — SOURCE CHANGED MID-IMPORT
  // =====================================

  it("rolls back if AsyncStorage changes during import", async () => {
    let expenseReads = 0;

    jest
      .mocked(AsyncStorage.getItem)
      .mockImplementation(async (key: string) => {
        if (key === EXPENSE_KEY) {
          expenseReads += 1;

          return JSON.stringify([
            expenseReads >= 3
              ? {
                  ...expense,
                  amount: 1000,
                }
              : expense,
          ]);
        }

        if (key === INCOME_KEY) {
          return JSON.stringify([income]);
        }

        return null;
      });

    await expect(copyAllDataToSQLite()).rejects.toThrow(
      "Migration source changed during verification",
    );

    for (const table of TABLES) {
      expect(fake.state[table]).toHaveLength(0);
    }

    expect(fake.state.migrations).toHaveLength(0);
  });

  // =====================================
  // TEST 8 — RESTORE RECOVERY
  // =====================================

  it("blocks migration while restore recovery is pending", async () => {
    jest
      .mocked(assertNoPendingRestoreRecovery)
      .mockRejectedValue(new Error("Pending restore recovery"));

    await expect(copyAllDataToSQLite()).rejects.toThrow(
      "Pending restore recovery",
    );

    expect(getShavroDatabase).not.toHaveBeenCalled();

    expect(fake.state.migrations).toHaveLength(0);
  });

  // =====================================
  // TEST 9 — SQLITE TAMPERING
  // =====================================

  it("detects modified archived values in SQLite", async () => {
    await copyAllDataToSQLite();

    fake.state.custom_categories[0].archived = 0;

    await expect(copyAllDataToSQLite()).rejects.toThrow(
      "SQLite migration stored-row verification failed",
    );

    expect(fake.state.custom_categories[0].archived).toBe(0);
  });
});
