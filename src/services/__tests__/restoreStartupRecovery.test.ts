import {
  beforeEach,
  afterEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";

// =========================================
// STORAGE KEYS
// =========================================

const KEYS = {
  expenses: "shavro_expenses_v1",
  incomes: "shavro_income_v1",
  customCategories: "shavro_custom_categories_v1",
  customPaymentMethods: "shavro_custom_payment_methods_v1",
} as const;

const RECOVERY_KEY = "shavro_restore_recovery_v1";
const COMPLETION_KEY = "shavro_restore_completion_v1";
const INTEGRITY_KEY = "shavro_restore_integrity_v1";

const TEST_DATE = "2026-11-17T06:00:00.000Z";

// =========================================
// SIMULATED NATIVE STORAGE
// =========================================

const mockStore = new Map<string, string>();

let mockFailReadKey: string | null = null;
let mockFailRemoveKey: string | null = null;

jest.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => {
      if (key === mockFailReadKey) {
        throw new Error("Simulated startup storage read failure");
      }

      return mockStore.get(key) ?? null;
    }),

    setItem: jest.fn(async (key: string, value: string) => {
      mockStore.set(key, value);
    }),

    removeItem: jest.fn(async (key: string) => {
      // Simulate one cleanup failure.
      if (key === mockFailRemoveKey) {
        mockFailRemoveKey = null;

        throw new Error("Simulated startup marker cleanup failure");
      }

      mockStore.delete(key);
    }),
  },
}));

// =========================================
// PRODUCTION SERVICE IMPORTS
// =========================================

import { recoverInterruptedRestore } from "../backupRestoreWrite";

import { assertNoPendingRestoreRecovery } from "../restoreRecoveryState";

// =========================================
// ORIGINAL FINANCIAL RECORDS
// =========================================

const ORIGINAL = {
  expenses: JSON.stringify([{ id: "original-expense" }]),

  incomes: JSON.stringify([{ id: "original-income" }]),

  customCategories: "[]",
  customPaymentMethods: "[]",
};

function populateOriginalData(): void {
  mockStore.set(KEYS.expenses, ORIGINAL.expenses);
  mockStore.set(KEYS.incomes, ORIGINAL.incomes);

  mockStore.set(KEYS.customCategories, ORIGINAL.customCategories);

  mockStore.set(KEYS.customPaymentMethods, ORIGINAL.customPaymentMethods);
}

function expectOriginalData(): void {
  expect(mockStore.get(KEYS.expenses)).toBe(ORIGINAL.expenses);

  expect(mockStore.get(KEYS.incomes)).toBe(ORIGINAL.incomes);

  expect(mockStore.get(KEYS.customCategories)).toBe(ORIGINAL.customCategories);

  expect(mockStore.get(KEYS.customPaymentMethods)).toBe(
    ORIGINAL.customPaymentMethods,
  );
}

// =========================================
// INTERRUPTED FINANCIAL RECORDS
// =========================================

function populateInterruptedData(): void {
  mockStore.set(KEYS.expenses, JSON.stringify([{ id: "interrupted-expense" }]));

  mockStore.set(KEYS.incomes, JSON.stringify([{ id: "interrupted-income" }]));
}

// =========================================
// RECOVERY JOURNAL
// =========================================

function createRecoveryJournal(): void {
  mockStore.set(
    RECOVERY_KEY,
    JSON.stringify({
      version: 1,
      createdAt: TEST_DATE,
      snapshot: {
        ...ORIGINAL,
      },
    }),
  );
}

// =========================================
// COMPLETION MARKER
// =========================================

function createCompletionMarker(): void {
  mockStore.set(
    COMPLETION_KEY,
    JSON.stringify({
      version: 1,
      createdAt: TEST_DATE,
      backupCreatedAt: TEST_DATE,
      status: "finalizing",
    }),
  );
}

// =========================================
// INTEGRITY RECORD
// =========================================

function createIntegrityState(status: "finalizing" | "committed"): void {
  mockStore.set(
    INTEGRITY_KEY,
    JSON.stringify({
      version: 1,
      createdAt: TEST_DATE,
      backupCreatedAt: TEST_DATE,
      status,
    }),
  );
}

// =========================================
// ASSERT SAFETY RECORDS REMOVED
// =========================================

function expectNoPendingSafetyRecords(): void {
  expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  expect(mockStore.has(COMPLETION_KEY)).toBe(false);
  expect(mockStore.has(INTEGRITY_KEY)).toBe(false);
}

// =========================================
// STARTUP RECOVERY TEST SUITE
// =========================================

describe("Shavro startup restore recovery safety", () => {
  beforeEach(() => {
    mockStore.clear();

    mockFailReadKey = null;
    mockFailRemoveKey = null;

    populateOriginalData();

    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =======================================
  // TEST 1
  // ALL THREE SAFETY RECORDS EXIST
  // =======================================

  test("recovers original financial records when all restore safety records exist", async () => {
    createRecoveryJournal();
    createCompletionMarker();
    createIntegrityState("finalizing");

    populateInterruptedData();

    const recovered = await recoverInterruptedRestore();

    expect(recovered).toBe(true);

    expectOriginalData();
    expectNoPendingSafetyRecords();

    await expect(assertNoPendingRestoreRecovery()).resolves.toBeUndefined();
  });

  // =======================================
  // TEST 2
  // JOURNAL AND INTEGRITY ONLY
  // =======================================

  test("recovers original records when journal and finalizing integrity exist without completion marker", async () => {
    createRecoveryJournal();
    createIntegrityState("finalizing");

    populateInterruptedData();

    expect(mockStore.has(COMPLETION_KEY)).toBe(false);

    const recovered = await recoverInterruptedRestore();

    expect(recovered).toBe(true);

    expectOriginalData();
    expectNoPendingSafetyRecords();
  });

  // =======================================
  // TEST 3
  // INTEGRITY EXISTS WITHOUT JOURNAL
  // =======================================

  test("blocks startup when unresolved integrity exists without journal or completion marker", async () => {
    createIntegrityState("finalizing");

    populateInterruptedData();

    await expect(recoverInterruptedRestore()).rejects.toThrow(
      /could not safely resolve/i,
    );

    // Financial records must not be
    // silently replaced or modified.
    expect(JSON.parse(mockStore.get(KEYS.expenses)!)).toEqual([
      { id: "interrupted-expense" },
    ]);

    expect(mockStore.has(INTEGRITY_KEY)).toBe(true);

    await expect(assertNoPendingRestoreRecovery()).rejects.toThrow(
      /unresolved restore integrity/i,
    );
  });

  // =======================================
  // TEST 4
  // COMPLETION MARKER WITHOUT JOURNAL
  // =======================================

  test("blocks startup when completion marker exists without recovery journal", async () => {
    createCompletionMarker();

    await expect(recoverInterruptedRestore()).rejects.toThrow(
      /could not safely resolve/i,
    );

    expectOriginalData();

    expect(mockStore.has(COMPLETION_KEY)).toBe(true);

    await expect(assertNoPendingRestoreRecovery()).rejects.toThrow();
  });

  // =======================================
  // TEST 5
  // CLEANUP FAILURE AND RETRY
  // =======================================

  test("preserves recovery journal after cleanup failure and successfully retries recovery", async () => {
    createRecoveryJournal();
    createCompletionMarker();
    createIntegrityState("finalizing");

    populateInterruptedData();

    // Completion marker removal fails
    // before the deletion is persisted.
    mockFailRemoveKey = COMPLETION_KEY;

    await expect(recoverInterruptedRestore()).rejects.toThrow(
      /could not safely resolve/i,
    );

    // Rollback financial data succeeded.
    expectOriginalData();

    // The journal must remain so recovery
    // can be retried after restart.
    expect(mockStore.has(RECOVERY_KEY)).toBe(true);

    // The failed completion marker
    // also remains.
    expect(mockStore.has(COMPLETION_KEY)).toBe(true);

    // Write operations remain blocked.
    await expect(assertNoPendingRestoreRecovery()).rejects.toThrow();

    // Simulate a later startup after
    // the one-time failure has cleared.
    const recovered = await recoverInterruptedRestore();

    expect(recovered).toBe(true);

    expectOriginalData();
    expectNoPendingSafetyRecords();

    await expect(assertNoPendingRestoreRecovery()).resolves.toBeUndefined();
  });

  // =======================================
  // TEST 6
  // CORRUPTED INTEGRITY RECORD
  // =======================================

  test("blocks startup when restore integrity information is corrupted", async () => {
    mockStore.set(INTEGRITY_KEY, "{invalid-json");

    await expect(recoverInterruptedRestore()).rejects.toThrow(
      /could not safely resolve/i,
    );

    expectOriginalData();

    // Preserve evidence for investigation.
    expect(mockStore.get(INTEGRITY_KEY)).toBe("{invalid-json");

    await expect(assertNoPendingRestoreRecovery()).rejects.toThrow();
  });

  // =======================================
  // TEST 7
  // INTEGRITY STORAGE READ FAILURE
  // =======================================

  test("blocks startup when restore integrity storage cannot be read", async () => {
    createIntegrityState("finalizing");

    mockFailReadKey = INTEGRITY_KEY;

    await expect(recoverInterruptedRestore()).rejects.toThrow(
      /could not safely resolve/i,
    );

    expect(mockStore.has(INTEGRITY_KEY)).toBe(true);

    await expect(assertNoPendingRestoreRecovery()).rejects.toThrow(
      /cannot verify restore integrity/i,
    );
  });

  // =======================================
  // TEST 8
  // PREVIOUSLY COMMITTED RESTORE
  // =======================================

  test("allows normal startup when a committed integrity record exists without pending markers", async () => {
    createIntegrityState("committed");

    const recovered = await recoverInterruptedRestore();

    expect(recovered).toBe(false);

    expectOriginalData();

    // Retain committed finalization evidence.
    expect(mockStore.has(INTEGRITY_KEY)).toBe(true);

    await expect(assertNoPendingRestoreRecovery()).resolves.toBeUndefined();
  });
});
