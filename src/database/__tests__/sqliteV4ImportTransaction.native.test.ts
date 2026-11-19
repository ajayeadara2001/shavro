import { describe, expect, it, jest } from "@jest/globals";

import type * as SQLite from "expo-sqlite";

import type { FinancialCollections } from "../sqliteFinancialCodec.native";

import {
  SQLITE_V4_MIGRATION_ID,
  writeV4CollectionsAtomically,
} from "../sqliteV4ImportTransaction.native";

// =========================================
// MOCK ASYNCSTORAGE
// =========================================

jest.mock("@react-native-async-storage/async-storage", () => {
  const mockJest = require("@jest/globals").jest;

  return {
    __esModule: true,
    default: {
      getItem: mockJest.fn(),
      setItem: mockJest.fn(),
      removeItem: mockJest.fn(),
    },
  };
});

// =========================================
// TEST FIXTURES
// =========================================

function createSource(): FinancialCollections {
  return {
    expenses: [
      {
        id: "expense-second",
        amount: 250.75,
        categoryId: "food",
        expenseName: null,
        paymentMethodId: "upi",
        otherMethodName: null,
        transactionDate: "2026-11-18",
        notes: "Dinner",
        createdAt: "2026-11-18T10:00:00.000Z",
      },
      {
        id: "expense-first",
        amount: 100.05,
        categoryId: "travel",
        expenseName: null,
        paymentMethodId: "cash",
        otherMethodName: null,
        transactionDate: "2026-11-18",
        notes: "Bus",
        createdAt: "2026-11-18T10:00:00.000Z",
      },
    ],

    incomes: [
      {
        id: "income-legacy",
        amount: 50000,
        categoryId: "salary",
        incomeName: null,
        transactionDate: "2026-11-18",
        notes: "Salary",
        createdAt: "2026-11-18T09:00:00.000Z",
      },
      {
        id: "income-new",
        amount: 125.5,
        categoryId: "freelance",
        incomeName: null,
        paymentMethodId: null,
        otherMethodName: null,
        transactionDate: "2026-11-18",
        notes: "Freelance",
        createdAt: "2026-11-18T08:00:00.000Z",
      },
    ],

    categories: [
      {
        id: "custom-expense",
        name: "Travel",
        scope: "EXPENSE",
      },
      {
        id: "custom-income",
        name: "Side Income",
        scope: "INCOME",
        archived: true,
      },
    ],

    paymentMethods: [
      {
        id: "custom-wallet",
        name: "Wallet",
      },
      {
        id: "custom-card",
        name: "Card",
        archived: false,
      },
    ],
  };
}

// =========================================
// FAKE TRANSACTIONAL SQLITE ENGINE
// =========================================

type TableName =
  | "expenses"
  | "incomes"
  | "custom_categories"
  | "custom_payment_methods"
  | "migration_state";

type DatabaseRow = Record<string, string | number | null>;

type TableData = Record<TableName, DatabaseRow[]>;

function createEmptyTables(): TableData {
  return {
    expenses: [],
    incomes: [],
    custom_categories: [],
    custom_payment_methods: [],
    migration_state: [],
  };
}

function cloneTables(tables: TableData): TableData {
  return {
    expenses: tables.expenses.map((row) => ({ ...row })),
    incomes: tables.incomes.map((row) => ({ ...row })),
    custom_categories: tables.custom_categories.map((row) => ({ ...row })),
    custom_payment_methods: tables.custom_payment_methods.map((row) => ({
      ...row,
    })),
    migration_state: tables.migration_state.map((row) => ({ ...row })),
  };
}

function isTableName(value: string): value is TableName {
  return (
    value === "expenses" ||
    value === "incomes" ||
    value === "custom_categories" ||
    value === "custom_payment_methods" ||
    value === "migration_state"
  );
}

function createFakeDatabase(schemaVersion = 4) {
  const state = {
    version: schemaVersion,
    tables: createEmptyTables(),
    insertCount: 0,
    failAtInsert: 0,
    corruptReadTable: null as TableName | null,
  };

  async function getFirstAsync(
    sql: string,
    params?: readonly unknown[],
  ): Promise<Record<string, unknown> | null> {
    if (/PRAGMA user_version/i.test(sql)) {
      return {
        user_version: state.version,
      };
    }

    const countMatch = sql.match(/SELECT COUNT\(\*\) AS count FROM (\w+)/i);

    if (countMatch) {
      const table = countMatch[1];

      if (!isTableName(table)) {
        throw new Error(`Unknown count table: ${table}`);
      }

      return {
        count: state.tables[table].length,
      };
    }

    if (/FROM migration_state/i.test(sql) && /SELECT migration_id/i.test(sql)) {
      const id = params?.[0];

      const row = state.tables.migration_state.find(
        (item) => item.migration_id === id,
      );

      return row ? { ...row } : null;
    }

    throw new Error(`Unsupported fake SELECT: ${sql}`);
  }

  async function getAllAsync(sql: string): Promise<DatabaseRow[]> {
    const match = sql.match(
      /FROM (expenses|incomes|custom_categories|custom_payment_methods)/i,
    );

    if (!match) {
      throw new Error(`Unsupported fake query: ${sql}`);
    }

    const table = match[1] as TableName;

    const rows = state.tables[table]
      .map((row) => ({ ...row }))
      .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));

    if (state.corruptReadTable === table && rows.length > 0) {
      rows[0].position = 999;
    }

    return rows;
  }

  async function runAsync(
    sql: string,
    params: readonly unknown[],
  ): Promise<void> {
    const match = sql.match(/INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES/i);

    if (!match) {
      throw new Error(`Unsupported fake INSERT: ${sql}`);
    }

    const table = match[1];

    if (!isTableName(table)) {
      throw new Error(`Unknown INSERT table: ${table}`);
    }

    state.insertCount += 1;

    if (state.failAtInsert > 0 && state.insertCount === state.failAtInsert) {
      throw new Error("Simulated SQLite insert failure");
    }

    const columns = match[2].split(",").map((name) => name.trim());

    if (columns.length !== params.length) {
      throw new Error("SQL parameter count mismatch");
    }

    const row: DatabaseRow = {};

    columns.forEach((column, index) => {
      const value = params[index];

      if (
        value !== null &&
        typeof value !== "string" &&
        typeof value !== "number"
      ) {
        throw new Error(`Invalid SQL parameter: ${column}`);
      }

      row[column] = value;
    });

    const primaryKey = table === "migration_state" ? "migration_id" : "id";

    if (
      state.tables[table].some(
        (existing) => existing[primaryKey] === row[primaryKey],
      )
    ) {
      throw new Error("Simulated SQLite duplicate primary key");
    }

    state.tables[table].push(row);
  }

  interface FakeDatabase {
    getFirstAsync: typeof getFirstAsync;
    getAllAsync: typeof getAllAsync;
    runAsync: typeof runAsync;
    withExclusiveTransactionAsync: (
      callback: (tx: FakeDatabase) => Promise<void>,
    ) => Promise<void>;
  }

  const db: FakeDatabase = {
    getFirstAsync,
    getAllAsync,
    runAsync,

    async withExclusiveTransactionAsync(callback): Promise<void> {
      const before = cloneTables(state.tables);

      try {
        await callback(db);
      } catch (error) {
        state.tables = before;
        throw error;
      }
    },
  };

  return {
    db: db as unknown as SQLite.SQLiteDatabase,
    state,
  };
}

// =========================================
// TRANSACTION TESTS
// =========================================

describe("Shavro SQLite version-4 import transaction", () => {
  it("imports all four collections and writes completion marker", async () => {
    const fake = createFakeDatabase();

    const source = createSource();

    let sourceChecks = 0;

    const result = await writeV4CollectionsAtomically(
      fake.db,
      source,
      async () => {
        sourceChecks += 1;
      },
    );

    expect(result).toEqual({
      expenses: 2,
      incomes: 2,
      categories: 2,
      paymentMethods: 2,
    });

    expect(sourceChecks).toBe(2);

    expect(fake.state.tables.expenses).toHaveLength(2);

    expect(fake.state.tables.incomes).toHaveLength(2);

    expect(fake.state.tables.custom_categories).toHaveLength(2);

    expect(fake.state.tables.custom_payment_methods).toHaveLength(2);

    expect(fake.state.tables.migration_state).toHaveLength(1);

    expect(fake.state.tables.migration_state[0].migration_id).toBe(
      SQLITE_V4_MIGRATION_ID,
    );

    expect(fake.state.tables.migration_state[0].status).toBe("completed");
  });

  it("preserves transaction order and legacy income flags", async () => {
    const fake = createFakeDatabase();

    await writeV4CollectionsAtomically(fake.db, createSource(), async () => {});

    expect(
      fake.state.tables.expenses.map((row) => [row.id, row.position]),
    ).toEqual([
      ["expense-second", 0],
      ["expense-first", 1],
    ]);

    expect(fake.state.tables.incomes[0].has_payment_method_id).toBe(0);

    expect(fake.state.tables.incomes[0].has_other_method_name).toBe(0);

    expect(fake.state.tables.incomes[1].has_payment_method_id).toBe(1);

    expect(fake.state.tables.incomes[1].has_other_method_name).toBe(1);

    expect(fake.state.tables.expenses[0].amount_paise).toBe(25075);
  });

  it("rolls back every table if a later insert fails", async () => {
    const fake = createFakeDatabase();

    // Failure after some rows
    // have already been inserted.
    fake.state.failAtInsert = 5;

    await expect(
      writeV4CollectionsAtomically(fake.db, createSource(), async () => {}),
    ).rejects.toThrow("Simulated SQLite insert failure");

    for (const rows of Object.values(fake.state.tables)) {
      expect(rows).toHaveLength(0);
    }
  });

  it("blocks importing into a populated destination", async () => {
    const fake = createFakeDatabase();

    fake.state.tables.expenses.push({
      id: "existing-record",
      amount_paise: 500,
      position: 0,
    });

    await expect(
      writeV4CollectionsAtomically(fake.db, createSource(), async () => {}),
    ).rejects.toThrow("expenses is not empty");

    expect(fake.state.tables.expenses).toHaveLength(1);

    expect(fake.state.tables.migration_state).toHaveLength(0);
  });

  it("rejects an unsupported SQLite schema version", async () => {
    const fake = createFakeDatabase(3);

    await expect(
      writeV4CollectionsAtomically(fake.db, createSource(), async () => {}),
    ).rejects.toThrow("SQLite schema version 4 is required");

    expect(fake.state.tables.migration_state).toHaveLength(0);
  });

  it("rolls back when the legacy source changes before commit", async () => {
    const fake = createFakeDatabase();

    let checkCount = 0;

    await expect(
      writeV4CollectionsAtomically(fake.db, createSource(), async () => {
        checkCount += 1;

        if (checkCount === 2) {
          throw new Error("Legacy source changed");
        }
      }),
    ).rejects.toThrow("Legacy source changed");

    expect(checkCount).toBe(2);

    for (const rows of Object.values(fake.state.tables)) {
      expect(rows).toHaveLength(0);
    }
  });

  it("rolls back when read-back verification detects corruption", async () => {
    const fake = createFakeDatabase();

    fake.state.corruptReadTable = "expenses";

    await expect(
      writeV4CollectionsAtomically(fake.db, createSource(), async () => {}),
    ).rejects.toThrow("SQLite stored-row mismatch");

    for (const rows of Object.values(fake.state.tables)) {
      expect(rows).toHaveLength(0);
    }
  });
});
