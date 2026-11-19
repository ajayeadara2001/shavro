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
// REAL FINANCIAL SNAPSHOT
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
// SQLITE DATABASE FIXTURE
// =========================================

function cloneCollections(value: SQLiteV4Collections): SQLiteV4Collections {
  return {
    expenses: value.expenses.map((row) => ({ ...row })),
    incomes: value.incomes.map((row) => ({ ...row })),
    categories: value.categories.map((row) => ({ ...row })),
    paymentMethods: value.paymentMethods.map((row) => ({ ...row })),
  };
}

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
      return rows.expenses.map((row) => ({ ...row }));
    }

    if (sql.includes("FROM incomes")) {
      return rows.incomes.map((row) => ({ ...row }));
    }

    if (sql.includes("FROM custom_categories")) {
      return rows.categories.map((row) => ({ ...row }));
    }

    if (sql.includes("FROM custom_payment_methods")) {
      return rows.paymentMethods.map((row) => ({ ...row }));
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

    jest
      .mocked(AsyncStorage.getItem)
      .mockImplementation(async (key) => storage.get(key) ?? null);

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
  // TEST 1 â€” NO PENDING RESTORE
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
  // TEST 2 â€” VERIFIED COMMIT
  // =====================================

  it("verifies a matching four-collection restore without clearing recovery", async () => {
    await beginSQLiteRestoreRecovery("restore-reconcile-001", SNAPSHOT);

    const originalJournal = storage.get(RECOVERY_KEY);

    const originalRows = cloneCollections(fake.rows);

    const result = await reconcilePendingSQLiteRestore();

    expect(result.status).toBe("verified_committed");

    expect(result.operationId).toBe("restore-reconcile-001");

    // Read-only reconciliation must
    // preserve all SQL rows.
    expect(fake.rows).toEqual(originalRows);

    // The recovery journal must remain.
    expect(storage.get(RECOVERY_KEY)).toBe(originalJournal);

    expect(await getPendingSQLiteRestoreRecovery()).not.toBeNull();

    expect(fake.runAsync).not.toHaveBeenCalled();

    expect(fake.execAsync).not.toHaveBeenCalled();
  });

  // =====================================
  // TEST 3 â€” EXPENSE MISMATCH
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
  });

  // =====================================
  // TEST 4 â€” INCOME MISMATCH
  // =====================================

  it("returns unresolved when an income amount differs", async () => {
    await beginSQLiteRestoreRecovery("restore-reconcile-003", SNAPSHOT);

    fake.modifyIncomeAmount();

    const result = await reconcilePendingSQLiteRestore();

    expect(result.status).toBe("unresolved");

    expect(result.operationId).toBe("restore-reconcile-003");

    expect(storage.has(RECOVERY_KEY)).toBe(true);
  });

  // =====================================
  // TEST 5 â€” LEGACY JOURNAL
  // =====================================

  it("keeps an old recovery journal without a snapshot unresolved", async () => {
    await beginSQLiteRestoreRecovery("restore-legacy-001");

    const original = storage.get(RECOVERY_KEY);

    const result = await reconcilePendingSQLiteRestore();

    expect(result.status).toBe("unresolved");

    expect(result.reason).toContain("no expected restore snapshot");

    expect(storage.get(RECOVERY_KEY)).toBe(original);

    expect(getShavroDatabase).not.toHaveBeenCalled();
  });

  // =====================================
  // TEST 6 â€” DATABASE INTEGRITY FAILURE
  // =====================================

  it("returns unresolved when SQLite integrity fails", async () => {
    await beginSQLiteRestoreRecovery("restore-reconcile-004", SNAPSHOT);

    fake.failIntegrity();

    const result = await reconcilePendingSQLiteRestore();

    expect(result.status).toBe("unresolved");

    expect(result.reason).toContain("database integrity verification failed");

    expect(storage.has(RECOVERY_KEY)).toBe(true);
  });

  // =====================================
  // TEST 7 â€” DATABASE READ FAILURE
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

  it("rejects a recovery snapshot containing invalid financial records", async () => {
    await beginSQLiteRestoreRecovery(
      "restore-invalid-financial-data",
      SNAPSHOT,
    );

    const raw = storage.get(RECOVERY_KEY);
    const journal = JSON.parse(raw ?? "{}");

    // Structurally an array, but invalid financial data.
    journal.expectedSnapshot.expenses[0].amount = -500;

    storage.set(RECOVERY_KEY, JSON.stringify(journal));

    const result = await reconcilePendingSQLiteRestore();

    expect(result.status).toBe("unresolved");

    expect(storage.has(RECOVERY_KEY)).toBe(true);

    expect(getShavroDatabase).not.toHaveBeenCalled();
  });

  it("rejects a journal changed during database verification", async () => {
    await beginSQLiteRestoreRecovery("restore-journal-change", SNAPSHOT);

    const database = fake.db;

    // Preserve the existing Jest mock implementation.
    const originalImplementation = database.getAllAsync.getMockImplementation();

    if (!originalImplementation) {
      throw new Error("SQLite test database mock implementation is missing.");
    }

    // Override the existing mock rather than
    // assigning a normal async function.
    database.getAllAsync.mockImplementation(
      async (sql: string): Promise<unknown[]> => {
        if (sql.includes("FROM expenses")) {
          const raw = storage.get(RECOVERY_KEY);

          const journal = JSON.parse(raw ?? "{}");

          // Simulate recovery journal modification
          // while the SQLite records are being read.
          journal.expectedSnapshot.expenses[0].amount = 999;

          storage.set(RECOVERY_KEY, JSON.stringify(journal));
        }

        // Preserve normal fake SQLite behavior.
        return originalImplementation(sql);
      },
    );

    const result = await reconcilePendingSQLiteRestore();

    expect(result.status).toBe("unresolved");

    expect(result.reason).toContain("journal changed during verification");

    // A failed reconciliation must never
    // remove the recovery marker.
    expect(storage.has(RECOVERY_KEY)).toBe(true);

    // Reconciliation must remain read-only.
    expect(fake.runAsync).not.toHaveBeenCalled();
    expect(fake.execAsync).not.toHaveBeenCalled();
  });
});

