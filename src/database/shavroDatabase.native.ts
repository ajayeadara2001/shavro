import * as SQLite from "expo-sqlite";

// =========================================
// CONFIGURATION
// =========================================

const DATABASE_NAME = "shavro_finance.db";
const DATABASE_VERSION = 4;

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

// =========================================
// TYPES
// =========================================

type TableName =
  | "expenses"
  | "incomes"
  | "migration_state"
  | "custom_categories"
  | "custom_payment_methods";

type DatabaseVersion = 1 | 2 | 3 | 4;

type SchemaReader = Pick<SQLite.SQLiteDatabase, "getAllAsync">;

type SchemaColumns = Partial<Record<TableName, readonly string[]>>;

type SchemaIndexes = Partial<Record<TableName, readonly string[]>>;

interface TableInfo {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

interface IndexInfo {
  name: string;
}

interface CountRow {
  count: number;
}

// =========================================
// EXPECTED COLUMNS
// =========================================

const COLUMNS_V1: SchemaColumns = {
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

  migration_state: ["migration_id", "status", "completed_at"],
};

const COLUMNS_V2: SchemaColumns = {
  ...COLUMNS_V1,

  custom_categories: ["id", "name", "scope", "archived"],

  custom_payment_methods: ["id", "name", "archived"],
};

const COLUMNS_V3: SchemaColumns = {
  ...COLUMNS_V1,

  custom_categories: ["id", "name", "scope", "archived", "position"],

  custom_payment_methods: ["id", "name", "archived", "position"],
};

const COLUMNS_V4: SchemaColumns = {
  ...COLUMNS_V3,

  expenses: [...(COLUMNS_V1.expenses ?? []), "position"],

  incomes: [
    ...(COLUMNS_V1.incomes ?? []),
    "position",
    "has_payment_method_id",
    "has_other_method_name",
  ],
};

// =========================================
// EXPECTED INDEXES
// =========================================

const INDEXES_V1: SchemaIndexes = {
  expenses: ["idx_expenses_date", "idx_expenses_category"],

  incomes: ["idx_incomes_date", "idx_incomes_category"],
};

const INDEXES_V2: SchemaIndexes = {
  ...INDEXES_V1,

  custom_categories: ["idx_custom_categories_scope"],

  custom_payment_methods: ["idx_custom_payment_methods_name"],
};

const INDEXES_V3: SchemaIndexes = {
  ...INDEXES_V2,

  custom_categories: [
    "idx_custom_categories_scope",
    "idx_custom_categories_position",
  ],

  custom_payment_methods: [
    "idx_custom_payment_methods_name",
    "idx_custom_payment_methods_position",
  ],
};

const INDEXES_V4: SchemaIndexes = {
  ...INDEXES_V3,

  expenses: [...(INDEXES_V1.expenses ?? []), "idx_expenses_position"],

  incomes: [...(INDEXES_V1.incomes ?? []), "idx_incomes_position"],
};

// =========================================
// TABLE LISTS
// =========================================

const VERSION_1_TABLES: readonly TableName[] = [
  "expenses",
  "incomes",
  "migration_state",
];

const ALL_TABLES: readonly TableName[] = [
  ...VERSION_1_TABLES,
  "custom_categories",
  "custom_payment_methods",
];

// =========================================
// SCHEMA SELECTION
// =========================================

function expectedSchema(version: DatabaseVersion): {
  tables: readonly TableName[];
  columns: SchemaColumns;
  indexes: SchemaIndexes;
} {
  switch (version) {
    case 1:
      return {
        tables: VERSION_1_TABLES,
        columns: COLUMNS_V1,
        indexes: INDEXES_V1,
      };

    case 2:
      return {
        tables: ALL_TABLES,
        columns: COLUMNS_V2,
        indexes: INDEXES_V2,
      };

    case 3:
      return {
        tables: ALL_TABLES,
        columns: COLUMNS_V3,
        indexes: INDEXES_V3,
      };

    case 4:
      return {
        tables: ALL_TABLES,
        columns: COLUMNS_V4,
        indexes: INDEXES_V4,
      };
  }
}

// =========================================
// SCHEMA VERIFICATION
// =========================================

async function verifyStructure(
  db: SchemaReader,
  version: DatabaseVersion,
): Promise<void> {
  const schema = expectedSchema(version);

  for (const table of schema.tables) {
    const columns = await db.getAllAsync<TableInfo>(
      `PRAGMA table_info("${table}")`,
    );

    const expectedColumns = schema.columns[table];

    if (!expectedColumns) {
      throw new Error(`Missing schema definition: ${table}`);
    }

    const actualNames = columns.map((column) => column.name);

    if (
      actualNames.length !== expectedColumns.length ||
      expectedColumns.some((name, index) => actualNames[index] !== name)
    ) {
      throw new Error(`Unexpected SQLite schema for ${table}.`);
    }

    const primaryKeyName = table === "migration_state" ? "migration_id" : "id";

    const primaryKey = columns.find((column) => column.name === primaryKeyName);

    if (
      !primaryKey ||
      primaryKey.pk !== 1 ||
      primaryKey.type.toUpperCase() !== "TEXT"
    ) {
      throw new Error(`Invalid primary key for ${table}.`);
    }

    // Verify all ordering and presence columns.
    const requiredIntegerColumns: string[] = [];

    if (
      version >= 3 &&
      (table === "custom_categories" || table === "custom_payment_methods")
    ) {
      requiredIntegerColumns.push("position");
    }

    if (version >= 4 && (table === "expenses" || table === "incomes")) {
      requiredIntegerColumns.push("position");
    }

    if (version >= 4 && table === "incomes") {
      requiredIntegerColumns.push(
        "has_payment_method_id",
        "has_other_method_name",
      );
    }

    for (const name of requiredIntegerColumns) {
      const column = columns.find((item) => item.name === name);

      if (
        !column ||
        column.type.toUpperCase() !== "INTEGER" ||
        column.notnull !== 1
      ) {
        throw new Error(`Invalid SQLite column: ${table}.${name}`);
      }
    }

    const indexes = await db.getAllAsync<IndexInfo>(
      `PRAGMA index_list("${table}")`,
    );

    const indexNames = new Set(indexes.map((item) => item.name));

    for (const name of schema.indexes[table] ?? []) {
      if (!indexNames.has(name)) {
        throw new Error(`Missing SQLite index: ${name}`);
      }
    }
  }
}

// =========================================
// VERSION 1 TABLES
// =========================================

async function createVersion1Tables(tx: SQLite.SQLiteDatabase): Promise<void> {
  await tx.execAsync(`
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY NOT NULL,
      amount_paise INTEGER NOT NULL
        CHECK(amount_paise > 0),
      category_id TEXT NOT NULL,
      expense_name TEXT,
      payment_method_id TEXT NOT NULL,
      other_method_name TEXT,
      transaction_date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS incomes (
      id TEXT PRIMARY KEY NOT NULL,
      amount_paise INTEGER NOT NULL
        CHECK(amount_paise > 0),
      category_id TEXT NOT NULL,
      income_name TEXT,
      payment_method_id TEXT,
      other_method_name TEXT,
      transaction_date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS
      idx_expenses_date
      ON expenses(transaction_date);

    CREATE INDEX IF NOT EXISTS
      idx_expenses_category
      ON expenses(category_id);

    CREATE INDEX IF NOT EXISTS
      idx_incomes_date
      ON incomes(transaction_date);

    CREATE INDEX IF NOT EXISTS
      idx_incomes_category
      ON incomes(category_id);

    CREATE TABLE IF NOT EXISTS migration_state (
      migration_id TEXT PRIMARY KEY NOT NULL,
      status TEXT NOT NULL
        CHECK(status IN ('started', 'completed')),
      completed_at TEXT
    );
  `);
}

// =========================================
// VERSION 2 TABLES
// =========================================

async function createVersion2Tables(tx: SQLite.SQLiteDatabase): Promise<void> {
  await tx.execAsync(`
    CREATE TABLE IF NOT EXISTS custom_categories (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL
        CHECK(length(trim(name)) > 0)
        CHECK(length(name) <= 40),
      scope TEXT NOT NULL
        CHECK(scope IN ('INCOME', 'EXPENSE')),
      archived INTEGER
        CHECK(
          archived IS NULL OR
          archived IN (0, 1)
        )
    );

    CREATE TABLE IF NOT EXISTS custom_payment_methods (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL
        CHECK(length(trim(name)) > 0)
        CHECK(length(name) <= 40),
      archived INTEGER
        CHECK(
          archived IS NULL OR
          archived IN (0, 1)
        )
    );

    CREATE INDEX IF NOT EXISTS
      idx_custom_categories_scope
      ON custom_categories(scope);

    CREATE INDEX IF NOT EXISTS
      idx_custom_payment_methods_name
      ON custom_payment_methods(name);
  `);
}

// =========================================
// VERSION 3 UPGRADE
// =========================================

async function upgradeToVersion3(tx: SQLite.SQLiteDatabase): Promise<void> {
  // Do not invent an ordering for existing
  // custom options.
  for (const table of [
    "custom_categories",
    "custom_payment_methods",
  ] as const) {
    const result = await tx.getFirstAsync<CountRow>(
      `SELECT COUNT(*) AS count FROM ${table}`,
    );

    if (!result || result.count !== 0) {
      throw new Error(`Cannot infer historical ordering for ${table}.`);
    }
  }

  await tx.execAsync(`
    ALTER TABLE custom_categories
      ADD COLUMN position INTEGER NOT NULL
      DEFAULT 0 CHECK(position >= 0);

    ALTER TABLE custom_payment_methods
      ADD COLUMN position INTEGER NOT NULL
      DEFAULT 0 CHECK(position >= 0);

    CREATE INDEX idx_custom_categories_position
      ON custom_categories(position);

    CREATE INDEX idx_custom_payment_methods_position
      ON custom_payment_methods(position);
  `);
}

// =========================================
// VERSION 4 UPGRADE
// =========================================

async function upgradeToVersion4(tx: SQLite.SQLiteDatabase): Promise<void> {
  /*
   * The earlier importers are not yet
   * activated in the application.
   *
   * If existing financial rows or migration
   * markers exist, refuse the upgrade.
   *
   * We cannot reconstruct their original
   * order or optional-property presence
   * safely without source validation.
   */
  for (const table of ["expenses", "incomes", "migration_state"] as const) {
    const result = await tx.getFirstAsync<CountRow>(
      `SELECT COUNT(*) AS count FROM ${table}`,
    );

    if (!result || result.count !== 0) {
      throw new Error(
        `SQLite version-4 upgrade blocked: ` +
          `${table} already contains records.`,
      );
    }
  }

  await tx.execAsync(`
    ALTER TABLE expenses
      ADD COLUMN position INTEGER NOT NULL
      DEFAULT 0 CHECK(position >= 0);

    ALTER TABLE incomes
      ADD COLUMN position INTEGER NOT NULL
      DEFAULT 0 CHECK(position >= 0);

    ALTER TABLE incomes
      ADD COLUMN has_payment_method_id
      INTEGER NOT NULL DEFAULT 0
      CHECK(has_payment_method_id IN (0, 1));

    ALTER TABLE incomes
      ADD COLUMN has_other_method_name
      INTEGER NOT NULL DEFAULT 0
      CHECK(has_other_method_name IN (0, 1));

    CREATE INDEX idx_expenses_position
      ON expenses(position);

    CREATE INDEX idx_incomes_position
      ON incomes(position);
  `);
}

// =========================================
// INITIALIZATION
// =========================================

async function initializeSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  const version = await db.getFirstAsync<{
    user_version: number;
  }>("PRAGMA user_version");

  if (!version || !Number.isInteger(version.user_version)) {
    throw new Error("Unable to determine SQLite schema version.");
  }

  const currentVersion = version.user_version;

  if (currentVersion < 0 || currentVersion > DATABASE_VERSION) {
    throw new Error("Unsupported Shavro database version.");
  }

  if (currentVersion === 4) {
    await verifyStructure(db, 4);
  } else {
    if (currentVersion >= 1) {
      await verifyStructure(db, currentVersion as 1 | 2 | 3);
    }

    await db.withExclusiveTransactionAsync(async (tx) => {
      if (currentVersion === 0) {
        await createVersion1Tables(tx);
        await verifyStructure(tx, 1);
      }

      if (currentVersion <= 1) {
        await createVersion2Tables(tx);
        await verifyStructure(tx, 2);
      }

      if (currentVersion <= 2) {
        await upgradeToVersion3(tx);
        await verifyStructure(tx, 3);
      }

      await upgradeToVersion4(tx);
      await verifyStructure(tx, 4);

      // Commit the version change with
      // all schema changes atomically.
      await tx.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
    });
  }

  const finalVersion = await db.getFirstAsync<{
    user_version: number;
  }>("PRAGMA user_version");

  if (finalVersion?.user_version !== 4) {
    throw new Error("SQLite version-4 verification failed.");
  }

  await verifyStructure(db, 4);

  const integrity = await db.getFirstAsync<{
    integrity_check: string;
  }>("PRAGMA integrity_check");

  if (integrity?.integrity_check !== "ok") {
    throw new Error("Shavro SQLite integrity verification failed.");
  }
}

// =========================================
// DATABASE ACCESS
// =========================================

/**
 * Supports:
 *
 * Version 0 -> 4
 * Version 1 -> 4
 * Version 2 -> 4
 * Version 3 -> 4
 * Version 4 -> 4
 *
 * No financial data copying occurs here.
 */
export async function getShavroDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

      try {
        await initializeSchema(db);
        return db;
      } catch (error) {
        await db.closeAsync();
        throw error;
      }
    })().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }

  return databasePromise;
}
