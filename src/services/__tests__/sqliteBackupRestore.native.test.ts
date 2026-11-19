import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import AsyncStorage from "@react-native-async-storage/async-storage";

import type * as SQLite from "expo-sqlite";
import type { ShavroBackup } from "../../types/backup";

import { getShavroDatabase } from "../../database/shavroDatabase.native";

import { getShavroStorageMode } from "../../database/sqliteStorageMode.native";

import { assertShavroStorageWritable } from "../backupRestoreWrite";

import { getPendingSQLiteRestoreRecovery } from "../../database/sqliteRestoreRecovery.native";

import { restoreSQLiteBackupData } from "../sqliteBackupRestore.native";

// =========================================
// MOCKS
// =========================================

jest.mock("@react-native-async-storage/async-storage", () => {
  const j = require("@jest/globals").jest;

  return {
    __esModule: true,
    default: {
      getItem: j.fn(),
      setItem: j.fn(),
      removeItem: j.fn(),
    },
  };
});

jest.mock("../backupRestoreWrite", () => ({
  assertShavroStorageWritable: require("@jest/globals").jest.fn(),
}));

jest.mock("../../database/sqliteStorageMode.native", () => ({
  getShavroStorageMode: require("@jest/globals").jest.fn(),
}));

jest.mock("../../database/shavroDatabase.native", () => ({
  getShavroDatabase: require("@jest/globals").jest.fn(),
}));

jest.mock("../../database/sqliteV4ImportTransaction.native", () => ({
  SQLITE_V4_MIGRATION_ID: "native_four_collection_copy_v4",
}));

jest.mock("../storageOperationGuard", () => ({
  runExclusiveStorageOperation: async <T>(
    operation: () => Promise<T>,
  ): Promise<T> => operation(),
}));

jest.mock("../../utils/backupValidation", () => ({
  validateShavroBackup: (backup: unknown) => backup,
}));

// =========================================
// FIXTURES
// =========================================

const RECOVERY_KEY = "shavro_sqlite_restore_recovery_v1";

const storage = new Map<string, string>();

const BACKUP: ShavroBackup = {
  format: "shavro-backup",
  version: 1,
  createdAt: "2026-11-19T10:00:00.000Z",

  data: {
    expenses: [
      {
        id: "expense-new",
        amount: 500.25,
        categoryId: "food",
        expenseName: null,
        paymentMethodId: "cash",
        otherMethodName: null,
        transactionDate: "2026-11-19",
        notes: "Restored expense",
        createdAt: "2026-11-19T09:00:00.000Z",
      },
    ],

    incomes: [
      {
        id: "income-new",
        amount: 12000,
        categoryId: "salary",
        incomeName: null,
        paymentMethodId: "bank",
        otherMethodName: null,
        transactionDate: "2026-11-19",
        notes: "Restored income",
        createdAt: "2026-11-19T08:00:00.000Z",
      },
    ],

    customCategories: [],
    customPaymentMethods: [],
  },
};

// =========================================
// FAKE TRANSACTIONAL SQLITE DATABASE
// =========================================

type SQLRow = Record<string, unknown>;

type CollectionName =
  | "expenses"
  | "incomes"
  | "custom_categories"
  | "custom_payment_methods";

type DatabaseState = Record<CollectionName, SQLRow[]>;

interface FakeSQLiteDatabase {
  getFirstAsync: (sql: string) => Promise<SQLRow>;

  getAllAsync: (sql: string) => Promise<SQLRow[]>;

  execAsync: (sql: string) => Promise<void>;

  runAsync: (
    sql: string,
    values: readonly (string | number | null)[],
  ) => Promise<void>;

  withExclusiveTransactionAsync: (
    operation: (tx: FakeSQLiteDatabase) => Promise<void>,
  ) => Promise<void>;
}

function createFakeDatabase() {
  let state: DatabaseState = {
    expenses: [{ id: "old-expense", position: 0 }],
    incomes: [{ id: "old-income", position: 0 }],
    custom_categories: [],
    custom_payment_methods: [],
  };

  let committed = false;
  let failInsert = false;
  let failAfterCommit = false;
  let transactionCalls = 0;

  const clone = (data: DatabaseState): DatabaseState => ({
    expenses: data.expenses.map((r) => ({ ...r })),
    incomes: data.incomes.map((r) => ({ ...r })),
    custom_categories: data.custom_categories.map((r) => ({ ...r })),
    custom_payment_methods: data.custom_payment_methods.map((r) => ({ ...r })),
  });

  const db: FakeSQLiteDatabase = {
    async getFirstAsync(sql: string) {
      if (sql.includes("PRAGMA user_version")) {
        return { user_version: 4 };
      }

      if (sql.includes("PRAGMA integrity_check")) {
        return { integrity_check: "ok" };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    },

    async getAllAsync(sql: string) {
      if (sql.includes("FROM migration_state")) {
        return [
          {
            migration_id: "native_four_collection_copy_v4",
            status: "completed",
            completed_at: "2026-11-19T10:00:00.000Z",
          },
        ];
      }

      if (committed && failAfterCommit) {
        throw new Error("Simulated post-commit read failure");
      }

      const tables: CollectionName[] = [
        "expenses",
        "incomes",
        "custom_categories",
        "custom_payment_methods",
      ];

      for (const table of tables) {
        if (sql.includes(`FROM ${table}`)) {
          return state[table].map((r) => ({ ...r }));
        }
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    },

    async execAsync(sql: string) {
      if (!sql.includes("DELETE FROM expenses")) {
        throw new Error(`Unexpected SQL: ${sql}`);
      }

      state = {
        expenses: [],
        incomes: [],
        custom_categories: [],
        custom_payment_methods: [],
      };
    },

    async runAsync(sql: string, values: readonly (string | number | null)[]) {
      if (failInsert) {
        throw new Error("Simulated SQLite insert failure");
      }

      const match = sql.match(/INSERT INTO (\w+)\s*\(([\s\S]*?)\)\s*VALUES/i);

      if (!match) {
        throw new Error(`Unexpected INSERT: ${sql}`);
      }

      const table = match[1] as CollectionName;

      const columns = match[2].split(",").map((c) => c.trim());

      const row: SQLRow = {};

      columns.forEach((column, index) => {
        row[column] = values[index];
      });

      state[table].push(row);
    },

    async withExclusiveTransactionAsync(
      operation: (tx: FakeSQLiteDatabase) => Promise<void>,
    ) {
      transactionCalls += 1;

      const previous = clone(state);

      try {
        await operation(db);
        committed = true;
      } catch (error) {
        state = previous;
        throw error;
      }
    },
  };

  return {
    db,

    get state() {
      return state;
    },

    get transactionCalls() {
      return transactionCalls;
    },

    get committed() {
      return committed;
    },

    failOnInsert() {
      failInsert = true;
    },

    failOnPostCommitRead() {
      failAfterCommit = true;
    },
  };
}

// =========================================
// TESTS
// =========================================

describe("SQLite backup restore transaction safety", () => {
  let fake: ReturnType<typeof createFakeDatabase>;

  beforeEach(() => {
    jest.resetAllMocks();
    storage.clear();

    fake = createFakeDatabase();

    jest
      .mocked(AsyncStorage.getItem)
      .mockImplementation(async (key) => storage.get(key) ?? null);

    jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => {
      storage.set(key, value);
    });

    jest.mocked(AsyncStorage.removeItem).mockImplementation(async (key) => {
      storage.delete(key);
    });

    jest.mocked(assertShavroStorageWritable).mockResolvedValue(undefined);

    jest.mocked(getShavroStorageMode).mockResolvedValue("sqlite");

    jest
      .mocked(getShavroDatabase)
      .mockResolvedValue(fake.db as unknown as SQLite.SQLiteDatabase);
  });

  // =======================================
  // TEST 1 — SUCCESS
  // =======================================

  it("restores all collections and clears recovery after verification", async () => {
    await restoreSQLiteBackupData(BACKUP);

    expect(fake.committed).toBe(true);
    expect(fake.transactionCalls).toBe(1);

    expect(fake.state.expenses.map((r) => r.id)).toEqual(["expense-new"]);

    expect(fake.state.incomes.map((r) => r.id)).toEqual(["income-new"]);

    expect(fake.state.expenses[0].amount_paise).toBe(50025);

    expect(fake.state.incomes[0].amount_paise).toBe(1200000);

    expect(fake.state.custom_categories).toEqual([]);

    expect(fake.state.custom_payment_methods).toEqual([]);

    expect(await getPendingSQLiteRestoreRecovery()).toBeNull();
  });

  // =======================================
  // TEST 2 — MARKER WRITE FAILURE
  // =======================================

  it("never starts SQL mutation when recovery intent cannot be persisted", async () => {
    jest
      .mocked(AsyncStorage.setItem)
      .mockRejectedValueOnce(new Error("Marker write failed"));

    await expect(restoreSQLiteBackupData(BACKUP)).rejects.toThrow(
      "Marker write failed",
    );

    expect(fake.transactionCalls).toBe(0);
    expect(fake.committed).toBe(false);

    expect(fake.state.expenses[0].id).toBe("old-expense");
  });

  // =======================================
  // TEST 3 — SQL ROLLBACK
  // =======================================

  it("preserves previous records and recovery marker when SQL fails", async () => {
    fake.failOnInsert();

    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(restoreSQLiteBackupData(BACKUP)).rejects.toThrow(
        "Recovery verification is required",
      );
    } finally {
      errorSpy.mockRestore();
    }

    expect(fake.committed).toBe(false);

    expect(fake.state.expenses[0].id).toBe("old-expense");

    expect(fake.state.incomes[0].id).toBe("old-income");

    expect(await getPendingSQLiteRestoreRecovery()).not.toBeNull();
  });

  // =======================================
  // TEST 4 — POST-COMMIT FAILURE
  // =======================================

  it("retains recovery protection when post-commit verification fails", async () => {
    fake.failOnPostCommitRead();

    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(restoreSQLiteBackupData(BACKUP)).rejects.toThrow(
        "post-commit verification or finalization failed",
      );
    } finally {
      errorSpy.mockRestore();
    }

    expect(fake.committed).toBe(true);

    expect(fake.state.expenses[0].id).toBe("expense-new");

    expect(await getPendingSQLiteRestoreRecovery()).not.toBeNull();
  });

  // =======================================
  // TEST 5 — RECOVERY CLEANUP FAILURE
  // =======================================

  it("retains recovery when marker removal fails before deletion", async () => {
    jest
      .mocked(AsyncStorage.removeItem)
      .mockRejectedValueOnce(new Error("Marker cleanup failed"));

    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(restoreSQLiteBackupData(BACKUP)).rejects.toThrow(
        "post-commit verification or finalization failed",
      );
    } finally {
      errorSpy.mockRestore();
    }

    expect(fake.committed).toBe(true);

    expect(await getPendingSQLiteRestoreRecovery()).not.toBeNull();

    expect(storage.has(RECOVERY_KEY)).toBe(true);
  });

  it("completes a verified restore when marker deletion persists but reports failure", async () => {
    jest.mocked(AsyncStorage.removeItem).mockImplementationOnce(async (key) => {
      storage.delete(key);

      throw new Error("Simulated failure after deletion");
    });

    await expect(restoreSQLiteBackupData(BACKUP)).resolves.toBeUndefined();

    expect(fake.committed).toBe(true);

    expect(fake.transactionCalls).toBe(1);

    expect(fake.state.expenses[0].id).toBe("expense-new");

    expect(fake.state.incomes[0].id).toBe("income-new");

    expect(await getPendingSQLiteRestoreRecovery()).toBeNull();

    expect(storage.has(RECOVERY_KEY)).toBe(false);
  });
});
