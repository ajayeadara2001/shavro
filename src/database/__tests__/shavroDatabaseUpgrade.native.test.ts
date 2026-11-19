import { jest, describe, it, expect, beforeEach } from "@jest/globals";

import type * as SQLite from "expo-sqlite";

jest.mock("expo-sqlite", () => {
  const mockJest = require("@jest/globals").jest;

  return {
    openDatabaseAsync: mockJest.fn(),
  };
});

type Version = 2 | 3 | 4;

type TableName =
  | "expenses"
  | "incomes"
  | "migration_state"
  | "custom_categories"
  | "custom_payment_methods";

interface Column {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

interface State {
  version: number;
  tables: Record<TableName, Column[]>;
  indexes: Record<TableName, string[]>;
  counts: Record<TableName, number>;
}

const TABLE_NAMES: TableName[] = [
  "expenses",
  "incomes",
  "migration_state",
  "custom_categories",
  "custom_payment_methods",
];

const FINANCIAL_COLUMNS = {
  expenses: [
    "id",
    "amount_paise",
    "category_id",
    "expense_name",
    "payment_method_id",
    "other_method_name",
    "transaction_date",
    "notes",
    "created_at",
  ],

  incomes: [
    "id",
    "amount_paise",
    "category_id",
    "income_name",
    "payment_method_id",
    "other_method_name",
    "transaction_date",
    "notes",
    "created_at",
  ],
};

function createColumns(names: string[], primaryKey: string = "id"): Column[] {
  return names.map((name) => ({
    name,

    type:
      name === "amount_paise" ||
      name === "archived" ||
      name === "position" ||
      name.startsWith("has_")
        ? "INTEGER"
        : "TEXT",

    pk: name === primaryKey ? 1 : 0,

    notnull: name === primaryKey ? 1 : 0,
  }));
}

function appendColumn(columns: Column[], name: string): void {
  columns.push({
    name,
    type: "INTEGER",
    notnull: 1,
    pk: 0,
  });
}

function createState(version: Version): State {
  const tables: State["tables"] = {
    expenses: createColumns(FINANCIAL_COLUMNS.expenses),

    incomes: createColumns(FINANCIAL_COLUMNS.incomes),

    migration_state: createColumns(
      ["migration_id", "status", "completed_at"],
      "migration_id",
    ),

    custom_categories: createColumns(["id", "name", "scope", "archived"]),

    custom_payment_methods: createColumns(["id", "name", "archived"]),
  };

  const indexes: State["indexes"] = {
    expenses: ["idx_expenses_date", "idx_expenses_category"],

    incomes: ["idx_incomes_date", "idx_incomes_category"],

    migration_state: [],

    custom_categories: ["idx_custom_categories_scope"],

    custom_payment_methods: ["idx_custom_payment_methods_name"],
  };

  if (version >= 3) {
    appendColumn(tables.custom_categories, "position");

    appendColumn(tables.custom_payment_methods, "position");

    indexes.custom_categories.push("idx_custom_categories_position");

    indexes.custom_payment_methods.push("idx_custom_payment_methods_position");
  }

  if (version >= 4) {
    appendColumn(tables.expenses, "position");

    appendColumn(tables.incomes, "position");

    appendColumn(tables.incomes, "has_payment_method_id");

    appendColumn(tables.incomes, "has_other_method_name");

    indexes.expenses.push("idx_expenses_position");

    indexes.incomes.push("idx_incomes_position");
  }

  return {
    version,
    tables,
    indexes,

    // Empty by default.
    // Version-4 upgrade requires empty
    // financial tables and migration state.
    counts: {
      expenses: 0,
      incomes: 0,
      migration_state: 0,
      custom_categories: 0,
      custom_payment_methods: 0,
    },
  };
}

function createFakeDatabase(version: Version) {
  const state = createState(version);

  let failOnAlterNumber = 0;
  let alterCount = 0;

  function capture(): State {
    return {
      version: state.version,

      tables: {
        expenses: state.tables.expenses.map((c) => ({ ...c })),

        incomes: state.tables.incomes.map((c) => ({ ...c })),

        migration_state: state.tables.migration_state.map((c) => ({ ...c })),

        custom_categories: state.tables.custom_categories.map((c) => ({
          ...c,
        })),

        custom_payment_methods: state.tables.custom_payment_methods.map(
          (c) => ({ ...c }),
        ),
      },

      indexes: {
        expenses: [...state.indexes.expenses],
        incomes: [...state.indexes.incomes],
        migration_state: [...state.indexes.migration_state],
        custom_categories: [...state.indexes.custom_categories],
        custom_payment_methods: [...state.indexes.custom_payment_methods],
      },

      counts: { ...state.counts },
    };
  }

  function restore(saved: State): void {
    state.version = saved.version;
    state.tables = saved.tables;
    state.indexes = saved.indexes;
    state.counts = saved.counts;
  }

  async function getFirstAsync(
    sql: string,
  ): Promise<Record<string, unknown> | null> {
    if (sql.includes("PRAGMA user_version")) {
      return {
        user_version: state.version,
      };
    }

    if (sql.includes("PRAGMA integrity_check")) {
      return {
        integrity_check: "ok",
      };
    }

    const countMatch = sql.match(/SELECT COUNT\(\*\) AS count FROM (\w+)/i);

    if (countMatch) {
      const table = countMatch[1] as TableName;

      if (!TABLE_NAMES.includes(table)) {
        throw new Error(`Unknown table: ${table}`);
      }

      return {
        count: state.counts[table],
      };
    }

    throw new Error(`Unsupported fake SELECT: ${sql}`);
  }

  async function getAllAsync(
    sql: string,
  ): Promise<Array<Record<string, unknown>>> {
    const tableMatch = sql.match(/PRAGMA table_info\("([^"]+)"\)/);

    if (tableMatch) {
      const table = tableMatch[1] as TableName;

      return (state.tables[table] ?? []).map((column) => ({ ...column }));
    }

    const indexMatch = sql.match(/PRAGMA index_list\("([^"]+)"\)/);

    if (indexMatch) {
      const table = indexMatch[1] as TableName;

      return (state.indexes[table] ?? []).map((name) => ({ name }));
    }

    throw new Error(`Unsupported fake query: ${sql}`);
  }

  async function execAsync(sql: string): Promise<void> {
    const statements = sql
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      if (/^PRAGMA (journal_mode|foreign_keys)/i.test(statement)) {
        continue;
      }

      const versionMatch = statement.match(
        /^PRAGMA user_version\s*=\s*(\d+)$/i,
      );

      if (versionMatch) {
        state.version = Number(versionMatch[1]);
        continue;
      }

      const alterMatch = statement.match(
        /^ALTER TABLE (\w+)\s+ADD COLUMN (\w+)/i,
      );

      if (alterMatch) {
        alterCount += 1;

        if (failOnAlterNumber !== 0 && alterCount === failOnAlterNumber) {
          throw new Error("Simulated schema upgrade failure");
        }

        const table = alterMatch[1] as TableName;
        const column = alterMatch[2];

        if (!TABLE_NAMES.includes(table)) {
          throw new Error(`Unknown ALTER TABLE target: ${table}`);
        }

        if (state.tables[table].some((existing) => existing.name === column)) {
          throw new Error(`Duplicate column: ${table}.${column}`);
        }

        appendColumn(state.tables[table], column);

        continue;
      }

      const indexMatch = statement.match(/^CREATE INDEX (\w+)\s+ON (\w+)/i);

      if (indexMatch) {
        const index = indexMatch[1];
        const table = indexMatch[2] as TableName;

        if (!TABLE_NAMES.includes(table)) {
          throw new Error(`Unknown index target: ${table}`);
        }

        state.indexes[table].push(index);
        continue;
      }

      throw new Error(`Unsupported fake SQL: ${statement}`);
    }
  }

  interface FakeDatabase {
    getFirstAsync: typeof getFirstAsync;
    getAllAsync: typeof getAllAsync;
    execAsync: typeof execAsync;
    closeAsync: ReturnType<typeof jest.fn>;
    withExclusiveTransactionAsync: (
      operation: (tx: FakeDatabase) => Promise<void>,
    ) => Promise<void>;
  }

  const db: FakeDatabase = {
    getFirstAsync,
    getAllAsync,
    execAsync,

    closeAsync: jest.fn(),

    withExclusiveTransactionAsync: async (
      operation: (tx: FakeDatabase) => Promise<void>,
    ): Promise<void> => {
      const before = capture();

      try {
        await operation(db);
      } catch (error) {
        restore(before);
        throw error;
      }
    },
  };

  return {
    db,
    state,

    failOnAlter(number: number): void {
      failOnAlterNumber = number;
    },
  };
}

describe("Shavro SQLite version-4 upgrade", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  async function openShavro(fake: ReturnType<typeof createFakeDatabase>) {
    const sqliteModule = require("expo-sqlite") as typeof SQLite;

    jest
      .mocked(sqliteModule.openDatabaseAsync)
      .mockResolvedValue(fake.db as unknown as SQLite.SQLiteDatabase);

    const module =
      require("../shavroDatabase.native") as typeof import("../shavroDatabase.native");

    return module.getShavroDatabase();
  }

  it("upgrades an empty version-2 database to version 4", async () => {
    const fake = createFakeDatabase(2);

    await openShavro(fake);

    expect(fake.state.version).toBe(4);

    expect(fake.state.tables.expenses.map((column) => column.name)).toContain(
      "position",
    );

    expect(fake.state.tables.incomes.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "position",
        "has_payment_method_id",
        "has_other_method_name",
      ]),
    );

    expect(fake.state.indexes.expenses).toContain("idx_expenses_position");
  });

  it("upgrades an empty version-3 database to version 4", async () => {
    const fake = createFakeDatabase(3);

    await openShavro(fake);

    expect(fake.state.version).toBe(4);

    expect(fake.state.indexes.incomes).toContain("idx_incomes_position");
  });

  it("blocks upgrading populated financial tables", async () => {
    const fake = createFakeDatabase(3);

    fake.state.counts.expenses = 1;

    await expect(openShavro(fake)).rejects.toThrow(
      "expenses already contains records",
    );

    expect(fake.state.version).toBe(3);

    expect(
      fake.state.tables.expenses.some((column) => column.name === "position"),
    ).toBe(false);
  });

  it("blocks upgrading with existing migration markers", async () => {
    const fake = createFakeDatabase(3);

    fake.state.counts.migration_state = 1;

    await expect(openShavro(fake)).rejects.toThrow(
      "migration_state already contains records",
    );

    expect(fake.state.version).toBe(3);
  });

  it("blocks version-2 upgrade when custom options are populated", async () => {
    const fake = createFakeDatabase(2);

    fake.state.counts.custom_categories = 2;

    await expect(openShavro(fake)).rejects.toThrow(
      "Cannot infer historical ordering for custom_categories",
    );

    expect(fake.state.version).toBe(2);

    expect(
      fake.state.tables.custom_categories.some(
        (column) => column.name === "position",
      ),
    ).toBe(false);
  });

  it("rolls back partially applied version-4 schema changes", async () => {
    const fake = createFakeDatabase(3);

    fake.failOnAlter(2);

    await expect(openShavro(fake)).rejects.toThrow(
      "Simulated schema upgrade failure",
    );

    expect(fake.state.version).toBe(3);

    expect(
      fake.state.tables.expenses.some((column) => column.name === "position"),
    ).toBe(false);

    expect(
      fake.state.tables.incomes.some((column) => column.name === "position"),
    ).toBe(false);
  });

  it("reopens version 4 without changing its schema", async () => {
    const fake = createFakeDatabase(4);

    await openShavro(fake);

    expect(fake.state.version).toBe(4);

    expect(
      fake.state.tables.incomes.some(
        (column) => column.name === "has_payment_method_id",
      ),
    ).toBe(true);
  });
});
