import AsyncStorage from "@react-native-async-storage/async-storage";

import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import type * as SQLite from "expo-sqlite";

import {
  beginSQLiteRestoreRecovery,
  getPendingSQLiteRestoreRecovery,
} from "../sqliteRestoreRecovery.native";

import {
  encodeAllCollections,
  type FinancialCollections,
  type SQLiteV4Collections,
} from "../sqliteFinancialCodec.native";

import { getShavroDatabase } from "../shavroDatabase.native";

import { reconcilePendingSQLiteRestore } from "../sqliteRestoreReconciliation.native";

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
      setItem: mockJest.fn(),
      removeItem: mockJest.fn(),
    },
  };
});

jest.mock("../shavroDatabase.native", () => ({
  getShavroDatabase: require("@jest/globals").jest.fn(),
}));

jest.mock("../sqliteV4ImportTransaction.native", () => ({
  SQLITE_V4_MIGRATION_ID: "native_four_collection_copy_v4",
}));

jest.mock("../../services/storageOperationGuard", () => ({
  runExclusiveStorageOperation: async <T>(
    operation: () => Promise<T>,
  ): Promise<T> => operation(),
}));

// =========================================
// CONSTANTS
// =========================================

const RECOVERY_KEY = "shavro_sqlite_restore_recovery_v1";

const TEST_DATE = "2026-11-19T10:00:00.000Z";

const storage = new Map<string, string>();

// =========================================
// VALID FINANCIAL SNAPSHOT
// =========================================
//
// IMPORTANT:
// Custom category IDs must start with
// "category_".
//
// Custom payment method IDs must start
// with "payment_".
//
// These rules come from backupValidation.ts.
// =========================================

const SNAPSHOT: FinancialCollections = {
  expenses: [
    {
      id: "expense-001",
      amount: 500.25,
      categoryId: "food",
      expenseName: null,
      paymentMethodId: "cash",
      otherMethodName: null,
      transactionDate: "2026-11-19",
      notes: "Lunch",
      createdAt: TEST_DATE,
    },
    {
      id: "expense-002",
      amount: 1250,
      categoryId: "shopping",
      expenseName: null,
      paymentMethodId: "upi",
      otherMethodName: null,
      transactionDate: "2026-11-18",
      notes: "Shopping",
      createdAt: TEST_DATE,
    },
  ],

  incomes: [
    {
      id: "income-001",
      amount: 50000,
      categoryId: "salary",
      incomeName: null,
      paymentMethodId: "bank",
      otherMethodName: null,
      transactionDate: "2026-11-19",
      notes: "Salary",
      createdAt: TEST_DATE,
    },
    {
      id: "income-002",
      amount: 2000.5,
      categoryId: "other",
      incomeName: "Freelance",
      transactionDate: "2026-11-18",
      notes: "Extra income",
      createdAt: TEST_DATE,
    },
  ],

  categories: [
    {
      id: "category_001",
      name: "Freelancing",
      scope: "INCOME",
    },
    {
      id: "category_002",
      name: "Old Travel",
      scope: "EXPENSE",
      archived: true,
    },
  ],

  paymentMethods: [
    {
      id: "payment_001",
      name: "Gift Card",
      archived: false,
    },
    {
      id: "payment_002",
      name: "Old Wallet",
    },
  ],
};

// =========================================
// SQLITE COLLECTION CLONING
// =========================================

function cloneCollections(value: SQLiteV4Collections): SQLiteV4Collections {
  return {
    expenses: value.expenses.map((row) => ({
      ...row,
    })),

    incomes: value.incomes.map((row) => ({
      ...row,
    })),

    categories: value.categories.map((row) => ({
      ...row,
    })),

    paymentMethods: value.paymentMethods.map((row) => ({
      ...row,
    })),
  };
}

// =========================================
// FAKE SQLITE DATABASE
// =========================================

function createFakeDatabase() {
  let rows = cloneCollections(encodeAllCollections(SNAPSHOT));

  let integrity = "ok";
  let schemaVersion = 4;
  let failDatabaseRead = false;

  const getFirstAsync = jest.fn(async (sql: string): Promise<unknown> => {
    if (sql.includes("PRAGMA user_version")) {
      return { user_version: schemaVersion };
    }

    if (sql.includes("PRAGMA integrity_check")) {
      return { integrity_check: integrity };
    }

    throw new Error(`Unexpected SQLite query: ${sql}`);
  });

  const getAllAsync = jest.fn(async (sql: string): Promise<unknown[]> => {
    if (sql.includes("FROM migration_state")) {
      return [
        {
          migration_id: "native_four_collection_copy_v4",
          status: "completed",
          completed_at: TEST_DATE,
        },
      ];
    }

    if (failDatabaseRead) {
      throw new Error("Simulated SQLite database read failure");
    }

    if (sql.includes("FROM expenses")) {
      return rows.expenses.map((row) => ({
        ...row,
      }));
    }

    if (sql.includes("FROM incomes")) {
      return rows.incomes.map((row) => ({
        ...row,
      }));
    }

    if (sql.includes("FROM custom_categories")) {
      return rows.categories.map((row) => ({
        ...row,
      }));
    }

    if (sql.includes("FROM custom_payment_methods")) {
      return rows.paymentMethods.map((row) => ({
        ...row,
      }));
    }

    throw new Error(`Unexpected SQLite query: ${sql}`);
  });

  const runAsync = jest.fn(async (): Promise<void> => {
    throw new Error("Reconciliation must never write SQLite data.");
  });

  const execAsync = jest.fn(async (): Promise<void> => {
    throw new Error("Reconciliation must never execute SQL mutations.");
  });

  const db = {
    getFirstAsync,
    getAllAsync,
    runAsync,
    execAsync,
  };

  return {
    db,

    get rows() {
      return rows;
    },

    get runAsync() {
      return runAsync;
    },

    get execAsync() {
      return execAsync;
    },

    modifyExpenseAmount(): void {
      rows.expenses[0].amount_paise = 999999;
    },

    modifyIncomeAmount(): void {
      rows.incomes[0].amount_paise = 12345;
    },

    failIntegrity(): void {
      integrity = "corrupt";
    },

    failReads(): void {
      failDatabaseRead = true;
    },

    setSchemaVersion(value: number): void {
      schemaVersion = value;
    },
  };
}

// =========================================
// TEST SUITE
// =========================================

describe("SQLite restore read-only reconciliation", () => {
  let fake: ReturnType<typeof createFakeDatabase>;

  beforeEach(() => {
    jest.resetAllMocks();

    storage.clear();

    fake = createFakeDatabase();

    jest.mocked(AsyncStorage.getItem).mockImplementation(async (key) => {
      return storage.get(key) ?? null;
    });

    jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => {
      storage.set(key, value);
    });

    jest.mocked(AsyncStorage.removeItem).mockImplementation(async (key) => {
      storage.delete(key);
    });

    jest
      .mocked(getShavroDatabase)
      .mockResolvedValue(fake.db as unknown as SQLite.SQLiteDatabase);
  });

  // =====================================
  // TEST 1 — NO PENDING RESTORE
  // =====================================

  it("returns no_pending_restore when no journal exists", async () => {
    const result = await reconcilePendingSQLiteRestore();

    expect(result).toEqual({
      status: "no_pending_restore",
      operationId: null,
      reason: "No pending SQLite restore journal.",
    });

    expect(getShavroDatabase).not.toHaveBeenCalled();

    expect(fake.runAsync).not.toHaveBeenCalled();

    expect(fake.execAsync).not.toHaveBeenCalled();
  });

  // =====================================
  // TEST 2 — VERIFIED COMMIT
  // =====================================

  it("verifies a matching four-collection restore without clearing recovery", async () => {
    await beginSQLiteRestoreRecovery("restore-reconcile-001", SNAPSHOT);

    const originalJournal = storage.get(RECOVERY_KEY);

    const originalRows = cloneCollections(fake.rows);

    const result = await reconcilePendingSQLiteRestore();

    expect(result.status).toBe("verified_committed");

    expect(result.operationId).toBe("restore-reconcile-001");

    expect(fake.rows).toEqual(originalRows);

    // Journal must remain present.
    expect(storage.get(RECOVERY_KEY)).toBe(originalJournal);

    expect(await getPendingSQLiteRestoreRecovery()).not.toBeNull();

    // No SQL mutation is allowed.
    expect(fake.runAsync).not.toHaveBeenCalled();

    expect(fake.execAsync).not.toHaveBeenCalled();
  });

  // =====================================
  // TEST 3 — EXPENSE AMOUNT MISMATCH
  // =====================================

  it("returns unresolved when an expense amount differs", async () => {
    await beginSQLiteRestoreRecovery("restore-reconcile-002", SNAPSHOT);

    fake.modifyExpenseAmount();

    const result = await reconcilePendingSQLiteRestore();

    expect(result.status).toBe("unresolved");

    expect(result.operationId).toBe("restore-reconcile-002");

    expect(result.reason).toContain("SQLite records do not match");

    expect(storage.has(RECOVERY_KEY)).toBe(true);

    expect(fake.runAsync).not.toHaveBeenCalled();

    expect(fake.execAsync).not.toHaveBeenCalled();
  });

  // =====================================
  // TEST 4 — INCOME AMOUNT MISMATCH
  // =====================================

  it("returns unresolved when an income amount differs", async () => {
    await beginSQLiteRestoreRecovery("restore-reconcile-003", SNAPSHOT);

    fake.modifyIncomeAmount();

    const result = await reconcilePendingSQLiteRestore();

    expect(result.status).toBe("unresolved");

    expect(result.operationId).toBe("restore-reconcile-003");

    expect(result.reason).toContain("SQLite records do not match");

    expect(storage.has(RECOVERY_KEY)).toBe(true);

    expect(fake.runAsync).not.toHaveBeenCalled();
  });

  // =====================================
  // TEST 5 — LEGACY JOURNAL
  // =====================================

  it("keeps an old recovery journal without a snapshot unresolved", async () => {
    await beginSQLiteRestoreRecovery("restore-legacy-001");

    const original = storage.get(RECOVERY_KEY);

    const result = await reconcilePendingSQLiteRestore();

    expect(result.status).toBe("unresolved");

    expect(result.reason).toContain("no expected restore snapshot");

    expect(storage.get(RECOVERY_KEY)).toBe(original);

    expect(getShavroDatabase).not.toHaveBeenCalled();

    expect(fake.runAsync).not.toHaveBeenCalled();
  });

  // =====================================
  // TEST 6 — DATABASE INTEGRITY FAILURE
  // =====================================

  it("returns unresolved when SQLite integrity fails", async () => {
    await beginSQLiteRestoreRecovery("restore-reconcile-004", SNAPSHOT);

    fake.failIntegrity();

    const result = await reconcilePendingSQLiteRestore();

    expect(result.status).toBe("unresolved");

    expect(result.reason).toContain("database integrity verification failed");

    expect(storage.has(RECOVERY_KEY)).toBe(true);

    expect(fake.runAsync).not.toHaveBeenCalled();
  });

  // =====================================
  // TEST 7 — DATABASE READ FAILURE
  // =====================================

  it("returns unresolved when SQLite records cannot be read", async () => {
    await beginSQLiteRestoreRecovery("restore-reconcile-005", SNAPSHOT);

    fake.failReads();

    const result = await reconcilePendingSQLiteRestore();

    expect(result.status).toBe("unresolved");

    expect(result.reason).toContain("Simulated SQLite database read failure");

    expect(storage.has(RECOVERY_KEY)).toBe(true);

    expect(fake.runAsync).not.toHaveBeenCalled();

    expect(fake.execAsync).not.toHaveBeenCalled();
  });

  // =====================================
  // TEST 8 — INVALID FINANCIAL SNAPSHOT
  // =====================================

  it("rejects a recovery snapshot containing invalid financial records", async () => {
    await beginSQLiteRestoreRecovery(
      "restore-invalid-financial-data",
      SNAPSHOT,
    );

    const raw = storage.get(RECOVERY_KEY);

    const journal = JSON.parse(raw ?? "{}");

    // Structurally valid JSON,
    // but invalid financial amount.
    journal.expectedSnapshot.expenses[0].amount = -500;

    storage.set(RECOVERY_KEY, JSON.stringify(journal));

    const result = await reconcilePendingSQLiteRestore();

    expect(result.status).toBe("unresolved");

    expect(result.reason).toContain("Backup contains invalid expense records");

    expect(storage.has(RECOVERY_KEY)).toBe(true);

    // Financial validation must reject
    // the snapshot before opening SQLite.
    expect(getShavroDatabase).not.toHaveBeenCalled();

    expect(fake.runAsync).not.toHaveBeenCalled();
  });

  // =====================================
  // TEST 9 — JOURNAL MODIFIED MID-CHECK
  // =====================================

  it("rejects a journal changed during database verification", async () => {
    await beginSQLiteRestoreRecovery("restore-journal-change", SNAPSHOT);

    const database = fake.db;

    const originalImplementation = database.getAllAsync.getMockImplementation();

    if (!originalImplementation) {
      throw new Error("SQLite database mock implementation is missing.");
    }

    // Change the persisted journal while
    // SQLite is being read.
    database.getAllAsync.mockImplementation(
      async (sql: string): Promise<unknown[]> => {
        if (sql.includes("FROM expenses")) {
          const raw = storage.get(RECOVERY_KEY);

          const journal = JSON.parse(raw ?? "{}");

          journal.expectedSnapshot.expenses[0].amount = 999;

          storage.set(RECOVERY_KEY, JSON.stringify(journal));
        }

        return originalImplementation(sql);
      },
    );

    const result = await reconcilePendingSQLiteRestore();

    expect(result.status).toBe("unresolved");

    expect(result.reason).toContain("journal changed during verification");

    // Recovery must remain pending.
    expect(storage.has(RECOVERY_KEY)).toBe(true);

    // No financial data is modified.
    expect(fake.runAsync).not.toHaveBeenCalled();

    expect(fake.execAsync).not.toHaveBeenCalled();
  });
});
