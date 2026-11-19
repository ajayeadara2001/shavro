import { jest, describe, it, expect, beforeEach } from "@jest/globals";

import AsyncStorage from "@react-native-async-storage/async-storage";

import { getShavroDatabase } from "../shavroDatabase.native";

import { assertNoPendingSQLiteRestoreRecovery } from "../sqliteRestoreRecovery.native";

import { assertShavroStorageWritable } from "../../services/backupRestoreWrite";

import { assertNoPendingRestoreRecovery } from "../../services/restoreRecoveryState";
import type { ShavroBackup } from "../../types/backup";

import { encodeAllCollections } from "../sqliteFinancialCodec.native";

import {
  activateVerifiedSQLiteStorage,
  getShavroStorageMode,
} from "../sqliteStorageMode.native";

// =========================================
// TEST STORAGE
// =========================================

const MODE_KEY = "shavro_active_storage_mode_v1";

const MIGRATION_ID = "native_four_collection_copy_v4";

const store = new Map<string, string>();

let version = 4;
let dbIntegrity = "ok";
let migrationCompleted = true;
let markerWriteFailsAfterPersistence = false;
let changeSourceDuringVerification = false;
let expenseReadCount = 0;

let sqliteExpenses: Record<string, unknown>[] = [];
let sqliteIncomes: Record<string, unknown>[] = [];
let sqliteCategories: Record<string, unknown>[] = [];
let sqlitePaymentMethods: Record<string, unknown>[] = [];

const emptyCollections = {
  expenses: [],
  incomes: [],
  categories: [],
  paymentMethods: [],
};

// =========================================
// MODULE MOCKS
// =========================================

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

jest.mock("../sqliteRestoreRecovery.native", () => ({
  assertNoPendingSQLiteRestoreRecovery: require("@jest/globals").jest.fn(),
}));

jest.mock("@react-native-async-storage/async-storage", () => {
  const mockJest = require("@jest/globals").jest;

  return {
    __esModule: true,
    default: {
      getItem: mockJest.fn(),
      setItem: mockJest.fn(),
    },
  };
});

jest.mock("../shavroDatabase.native", () => {
  const mockJest = require("@jest/globals").jest;

  return {
    getShavroDatabase: mockJest.fn(),
  };
});

jest.mock("../sqliteV4ImportTransaction.native", () => ({
  SQLITE_V4_MIGRATION_ID: "native_four_collection_copy_v4",
}));

jest.mock("../../services/storageOperationGuard", () => ({
  runExclusiveStorageOperation: async <T>(
    operation: () => Promise<T>,
  ): Promise<T> => operation(),
}));

jest.mock("../../services/backupRestoreWrite", () => {
  const mockJest = require("@jest/globals").jest;

  return {
    assertShavroStorageWritable: mockJest.fn(),
  };
});

jest.mock("../../services/restoreRecoveryState", () => {
  const mockJest = require("@jest/globals").jest;

  return {
    assertNoPendingRestoreRecovery: mockJest.fn(),
  };
});

jest.mock("../sqliteRestoreRecovery.native", () => ({
  assertNoPendingSQLiteRestoreRecovery: require("@jest/globals").jest.fn(),
}));

jest.mock("../../utils/backupValidation", () => ({
  validateShavroBackup: (backup: unknown) => backup,
}));

// =========================================
// FAKE SQLITE
// =========================================

function createDatabase() {
  return {
    getFirstAsync: jest.fn(async (sql: string) => {
      if (sql.includes("PRAGMA user_version")) {
        return { user_version: version };
      }

      if (sql.includes("PRAGMA integrity_check")) {
        return { integrity_check: dbIntegrity };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    }),

    getAllAsync: jest.fn(async (sql: string) => {
      if (sql.includes("FROM migration_state")) {
        return migrationCompleted
          ? [
              {
                migration_id: MIGRATION_ID,
                status: "completed",
                completed_at: "2026-11-18T10:00:00.000Z",
              },
            ]
          : [];
      }

      if (sql.includes("FROM expenses")) {
        return sqliteExpenses;
      }

      if (sql.includes("FROM incomes")) {
        return sqliteIncomes;
      }

      if (sql.includes("FROM custom_categories")) {
        return sqliteCategories;
      }

      if (sql.includes("FROM custom_payment_methods")) {
        return sqlitePaymentMethods;
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    }),
  };
}

// =========================================
// NONEMPTY FINANCIAL TEST DATA
// =========================================

const NONEMPTY_BACKUP: ShavroBackup = {
  format: "shavro-backup",
  version: 1,
  createdAt: "2026-11-19T10:00:00.000Z",

  data: {
    expenses: [
      {
        id: "expense-001",
        amount: 500.25,
        categoryId: "food",
        expenseName: null,
        paymentMethodId: "upi",
        otherMethodName: null,
        transactionDate: "2026-11-18",
        notes: "Lunch",
        createdAt: "2026-11-18T10:00:00.000Z",
      },
      {
        id: "expense-002",
        amount: 1299.99,
        categoryId: "shopping",
        expenseName: null,
        paymentMethodId: "cash",
        otherMethodName: null,
        transactionDate: "2026-11-17",
        notes: "Groceries",
        createdAt: "2026-11-17T10:00:00.000Z",
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
        transactionDate: "2026-11-18",
        notes: "November salary",
        createdAt: "2026-11-18T09:00:00.000Z",
      },
      {
        id: "income-002",
        amount: 1500.5,
        categoryId: "other",
        incomeName: "Freelance",
        transactionDate: "2026-11-17",
        notes: "Additional income",
        createdAt: "2026-11-17T09:00:00.000Z",
      },
    ],

    customCategories: [
      {
        id: "category-001",
        name: "Freelancing",
        scope: "INCOME",
      },
      {
        id: "category-002",
        name: "Old Travel",
        scope: "EXPENSE",
        archived: true,
      },
    ],

    customPaymentMethods: [
      {
        id: "payment-001",
        name: "Gift Card",
        archived: false,
      },
      {
        id: "payment-002",
        name: "Old Wallet",
      },
    ],
  },
};

// =========================================
// TEST DATA SETUP
// =========================================

function populateNonemptySource(): void {
  store.set(
    "shavro_expenses_v1",
    JSON.stringify(NONEMPTY_BACKUP.data.expenses),
  );

  store.set("shavro_income_v1", JSON.stringify(NONEMPTY_BACKUP.data.incomes));

  store.set(
    "shavro_custom_categories_v1",
    JSON.stringify(NONEMPTY_BACKUP.data.customCategories),
  );

  store.set(
    "shavro_custom_payment_methods_v1",
    JSON.stringify(NONEMPTY_BACKUP.data.customPaymentMethods),
  );
}

// =========================================
// POPULATE EXPECTED SQLITE ROWS
// =========================================

function populateMatchingSQLite(): void {
  const encoded = encodeAllCollections({
    expenses: NONEMPTY_BACKUP.data.expenses,
    incomes: NONEMPTY_BACKUP.data.incomes,
    categories: NONEMPTY_BACKUP.data.customCategories,
    paymentMethods: NONEMPTY_BACKUP.data.customPaymentMethods,
  });

  sqliteExpenses = encoded.expenses.map((row) => ({ ...row }));

  sqliteIncomes = encoded.incomes.map((row) => ({ ...row }));

  sqliteCategories = encoded.categories.map((row) => ({ ...row }));

  sqlitePaymentMethods = encoded.paymentMethods.map((row) => ({ ...row }));
}

// =========================================
// TEST SUITE
// =========================================

describe("SQLite storage activation safety", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .mocked(assertNoPendingSQLiteRestoreRecovery)
      .mockResolvedValue(undefined);
    store.clear();

    version = 4;
    dbIntegrity = "ok";
    migrationCompleted = true;

    markerWriteFailsAfterPersistence = false;
    changeSourceDuringVerification = false;
    expenseReadCount = 0;

    sqliteExpenses = [];
    sqliteIncomes = [];
    sqliteCategories = [];
    sqlitePaymentMethods = [];

    jest.mocked(assertShavroStorageWritable).mockResolvedValue(undefined);

    jest.mocked(assertNoPendingRestoreRecovery).mockResolvedValue(undefined);

    jest
      .mocked(getShavroDatabase)
      .mockResolvedValue(
        createDatabase() as unknown as Awaited<
          ReturnType<typeof getShavroDatabase>
        >,
      );

    jest
      .mocked(AsyncStorage.getItem)
      .mockImplementation(async (key: string) => {
        if (key === "shavro_expenses_v1" && changeSourceDuringVerification) {
          expenseReadCount += 1;

          if (expenseReadCount >= 2) {
            return '[{"id":"changed"}]';
          }

          return "[]";
        }

        return store.get(key) ?? null;
      });

    jest
      .mocked(AsyncStorage.setItem)
      .mockImplementation(async (key: string, value: string) => {
        store.set(key, value);

        if (key === MODE_KEY && markerWriteFailsAfterPersistence) {
          throw new Error("Simulated failure after marker persistence");
        }
      });
  });

  // =====================================
  // TEST 1 — SUCCESS
  // =====================================

  it("activates verified SQLite without deleting source data", async () => {
    store.set("shavro_expenses_v1", "[]");
    store.set("shavro_income_v1", "[]");

    await activateVerifiedSQLiteStorage();

    expect(await getShavroStorageMode()).toBe("sqlite");

    expect(store.get("shavro_expenses_v1")).toBe("[]");
    expect(store.get("shavro_income_v1")).toBe("[]");

    expect(JSON.parse(store.get(MODE_KEY) ?? "{}").mode).toBe("sqlite");
  });

  // =====================================
  // TEST 2 — SQLITE MISMATCH
  // =====================================

  it("blocks activation when destination has unexpected records", async () => {
    sqliteExpenses = [{ id: "unexpected-expense" }];

    await expect(activateVerifiedSQLiteStorage()).rejects.toThrow(
      "SQLite records do not match",
    );

    expect(store.has(MODE_KEY)).toBe(false);
  });

  // =====================================
  // TEST 3 — SOURCE CHANGE
  // =====================================

  it("blocks activation when source changes during verification", async () => {
    changeSourceDuringVerification = true;

    await expect(activateVerifiedSQLiteStorage()).rejects.toThrow(
      "Financial data changed during SQLite activation",
    );

    expect(store.has(MODE_KEY)).toBe(false);
  });

  // =====================================
  // TEST 4 — INVALID SCHEMA
  // =====================================

  it("rejects an unsupported SQLite schema", async () => {
    version = 3;

    await expect(activateVerifiedSQLiteStorage()).rejects.toThrow(
      "schema version 4 is required",
    );

    expect(store.has(MODE_KEY)).toBe(false);
  });

  // =====================================
  // TEST 5 — MISSING MIGRATION
  // =====================================

  it("rejects an incomplete migration", async () => {
    migrationCompleted = false;

    await expect(activateVerifiedSQLiteStorage()).rejects.toThrow(
      "migration has not been verified",
    );

    expect(store.has(MODE_KEY)).toBe(false);
  });

  // =====================================
  // TEST 6 — RESTORE SAFETY
  // =====================================

  it("blocks activation while restore safety is unresolved", async () => {
    jest
      .mocked(assertShavroStorageWritable)
      .mockRejectedValue(new Error("Restore recovery pending"));

    await expect(activateVerifiedSQLiteStorage()).rejects.toThrow(
      "Restore recovery pending",
    );

    expect(store.has(MODE_KEY)).toBe(false);
  });

  // =====================================
  // TEST 7 — AMBIGUOUS MARKER WRITE
  // =====================================

  it("never silently falls back after marker persists but write reports failure", async () => {
    markerWriteFailsAfterPersistence = true;

    await expect(activateVerifiedSQLiteStorage()).rejects.toThrow(
      "Simulated failure after marker persistence",
    );

    // The marker actually persisted.
    // A reported write failure does not
    // prove the old provider is active.
    expect(JSON.parse(store.get(MODE_KEY) ?? "{}").mode).toBe("sqlite");

    expect(await getShavroStorageMode()).toBe("sqlite");
  });

  // =====================================
  // TEST 8 — INTEGRITY FAILURE
  // =====================================

  it("rejects SQLite database integrity failure", async () => {
    dbIntegrity = "corrupt";

    await expect(activateVerifiedSQLiteStorage()).rejects.toThrow(
      "integrity check failed",
    );

    expect(store.has(MODE_KEY)).toBe(false);
  });

  // =========================================
  // TEST 9 — NONEMPTY FOUR-COLLECTION COPY
  // =========================================

  it("activates SQLite when all four nonempty collections match", async () => {
    populateNonemptySource();
    populateMatchingSQLite();

    await activateVerifiedSQLiteStorage();

    expect(await getShavroStorageMode()).toBe("sqlite");

    // Original financial records remain.
    expect(JSON.parse(store.get("shavro_expenses_v1") ?? "[]")).toEqual(
      NONEMPTY_BACKUP.data.expenses,
    );

    expect(JSON.parse(store.get("shavro_income_v1") ?? "[]")).toEqual(
      NONEMPTY_BACKUP.data.incomes,
    );

    // Amount conversion uses integer paise.
    expect(sqliteExpenses.map((row) => row.amount_paise)).toEqual([
      50025, 129999,
    ]);

    expect(sqliteIncomes.map((row) => row.amount_paise)).toEqual([
      5000000, 150050,
    ]);

    // Position and ordering are preserved.
    expect(sqliteExpenses.map((row) => row.position)).toEqual([0, 1]);

    expect(sqliteIncomes.map((row) => row.position)).toEqual([0, 1]);

    expect(sqliteCategories.map((row) => row.position)).toEqual([0, 1]);

    expect(sqlitePaymentMethods.map((row) => row.position)).toEqual([0, 1]);

    // Archived values preserve absence
    // separately from true and false.
    expect(sqliteCategories.map((row) => row.archived)).toEqual([null, 1]);

    expect(sqlitePaymentMethods.map((row) => row.archived)).toEqual([0, null]);

    // Income optional-property presence
    // must be represented explicitly.
    expect(sqliteIncomes.map((row) => row.has_payment_method_id)).toEqual([
      1, 0,
    ]);

    expect(sqliteIncomes.map((row) => row.has_other_method_name)).toEqual([
      1, 0,
    ]);

    expect(JSON.parse(store.get(MODE_KEY) ?? "{}").mode).toBe("sqlite");
  });

  // =========================================
  // TEST 10 — NONEMPTY FINANCIAL MISMATCH
  // =========================================

  it("rejects activation if a SQLite amount differs from the source", async () => {
    populateNonemptySource();
    populateMatchingSQLite();

    // Simulate a stale or altered SQL row.
    sqliteExpenses[0].amount_paise = 90000;

    await expect(activateVerifiedSQLiteStorage()).rejects.toThrow(
      "SQLite records do not match",
    );

    // Provider must remain AsyncStorage.
    expect(store.has(MODE_KEY)).toBe(false);

    expect(await getShavroStorageMode()).toBe("async-storage");

    // Source data must be unchanged.
    expect(JSON.parse(store.get("shavro_expenses_v1") ?? "[]")).toEqual(
      NONEMPTY_BACKUP.data.expenses,
    );
  });

  // =========================================
  // TEST 11 — PERSISTED SQLITE MODE
  // =========================================

  it("recognizes a completed SQLite activation on the next startup", async () => {
    populateNonemptySource();
    populateMatchingSQLite();

    await activateVerifiedSQLiteStorage();

    const savedMarker = store.get(MODE_KEY);

    expect(savedMarker).toBeDefined();

    // Simulate another startup reading the
    // same persisted storage state.
    expect(await getShavroStorageMode()).toBe("sqlite");

    expect(store.get(MODE_KEY)).toBe(savedMarker);

    // A completed cutover must not silently
    // perform a second activation.
    await expect(activateVerifiedSQLiteStorage()).rejects.toThrow(
      "SQLite activation requires AsyncStorage",
    );

    // The original provider marker remains.
    expect(store.get(MODE_KEY)).toBe(savedMarker);
  });

  // =========================================
  // TEST 12 — INVALID MODE MARKER
  // =========================================

  it("blocks startup when the storage-mode marker is corrupted", async () => {
    store.set(MODE_KEY, "{invalid-json");

    await expect(getShavroStorageMode()).rejects.toThrow(
      "storage-mode information is unreadable",
    );

    // Never silently choose AsyncStorage
    // when the marker cannot be parsed.
    expect(store.get(MODE_KEY)).toBe("{invalid-json");
  });

  // =========================================
  // TEST 13 — WRITE FAILED BEFORE PERSISTENCE
  // =========================================

  it("keeps AsyncStorage active if the activation marker was never written", async () => {
    populateNonemptySource();
    populateMatchingSQLite();

    jest
      .mocked(AsyncStorage.setItem)
      .mockImplementationOnce(async (key: string) => {
        if (key === MODE_KEY) {
          throw new Error("Simulated failure before marker persistence");
        }
      });

    await expect(activateVerifiedSQLiteStorage()).rejects.toThrow(
      "Simulated failure before marker persistence",
    );

    expect(store.has(MODE_KEY)).toBe(false);

    expect(await getShavroStorageMode()).toBe("async-storage");

    // Failed activation must preserve
    // all original financial records.
    expect(JSON.parse(store.get("shavro_expenses_v1") ?? "[]")).toEqual(
      NONEMPTY_BACKUP.data.expenses,
    );
  });

  // =========================================
  // TEST 14 — PERSISTED SQLITE MARKER,
  // DATABASE BECOMES INVALID
  // =========================================

  it("blocks startup if activated SQLite fails integrity verification", async () => {
    populateNonemptySource();
    populateMatchingSQLite();

    await activateVerifiedSQLiteStorage();

    const savedMarker = store.get(MODE_KEY);

    // Simulate corruption being detected
    // when the app next checks the database.
    dbIntegrity = "corrupt";

    await expect(getShavroStorageMode()).rejects.toThrow(
      "integrity check failed",
    );

    // Never erase the marker or silently
    // fall back to potentially stale data.
    expect(store.get(MODE_KEY)).toBe(savedMarker);

    expect(JSON.parse(savedMarker ?? "{}").mode).toBe("sqlite");
  });

  it("blocks activated SQLite when restore recovery is pending", async () => {
    populateNonemptySource();
    populateMatchingSQLite();

    await activateVerifiedSQLiteStorage();

    const savedMarker = store.get(MODE_KEY);

    jest
      .mocked(assertNoPendingSQLiteRestoreRecovery)
      .mockRejectedValueOnce(new Error("SQLite restore recovery pending"));

    await expect(getShavroStorageMode()).rejects.toThrow(
      "SQLite restore recovery pending",
    );

    // Never discard the active SQLite marker.
    expect(store.get(MODE_KEY)).toBe(savedMarker);
  });

  it("keeps legacy AsyncStorage available when only SQLite recovery is pending", async () => {
    jest
      .mocked(assertNoPendingSQLiteRestoreRecovery)
      .mockRejectedValue(new Error("SQLite restore recovery pending"));

    // No activation marker: legacy provider remains active.
    await expect(getShavroStorageMode()).resolves.toBe("async-storage");

    expect(assertNoPendingSQLiteRestoreRecovery).not.toHaveBeenCalled();
  });

  it("blocks SQLite startup while recovery is pending", async () => {
    populateNonemptySource();
    populateMatchingSQLite();

    await activateVerifiedSQLiteStorage();

    const originalMarker = store.get(MODE_KEY);

    jest
      .mocked(assertNoPendingSQLiteRestoreRecovery)
      .mockRejectedValue(new Error("SQLite restore recovery pending"));

    await expect(getShavroStorageMode()).rejects.toThrow(
      "SQLite restore recovery pending",
    );

    expect(store.get(MODE_KEY)).toBe(originalMarker);
  });

  it("blocks activation if SQLite restore recovery is unresolved", async () => {
    populateNonemptySource();
    populateMatchingSQLite();

    jest
      .mocked(assertNoPendingSQLiteRestoreRecovery)
      .mockRejectedValue(new Error("SQLite restore recovery pending"));

    await expect(activateVerifiedSQLiteStorage()).rejects.toThrow(
      "SQLite restore recovery pending",
    );

    expect(store.has(MODE_KEY)).toBe(false);

    expect(JSON.parse(store.get("shavro_expenses_v1") ?? "[]")).toEqual(
      NONEMPTY_BACKUP.data.expenses,
    );
  });
});
