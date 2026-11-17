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

type RemovalFailureMode = "none" | "before" | "after";

let mockRemovalFailureMode: RemovalFailureMode = "none";
let mockJournalFailureTriggered = false;

jest.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,

  default: {
    getItem: jest.fn(async (key: string) => {
      return mockStore.get(key) ?? null;
    }),

    setItem: jest.fn(async (key: string, value: string) => {
      mockStore.set(key, value);
    }),

    removeItem: jest.fn(async (key: string) => {
      if (key === RECOVERY_KEY && mockRemovalFailureMode !== "none") {
        const mode = mockRemovalFailureMode;

        // Inject the failure only once.
        mockRemovalFailureMode = "none";
        mockJournalFailureTriggered = true;

        if (mode === "before") {
          throw new Error(
            "Simulated journal removal failure before persistence",
          );
        }

        // Deletion persisted, but the call
        // reported an error afterward.
        mockStore.delete(key);

        throw new Error("Simulated journal removal failure after persistence");
      }

      mockStore.delete(key);
    }),
  },
}));

// =========================================
// PRODUCTION IMPORTS
// =========================================

import { recoverInterruptedRestore } from "../backupRestoreWrite";

import { assertNoPendingRestoreRecovery } from "../restoreRecoveryState";

// =========================================
// ORIGINAL FINANCIAL DATA
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
// INTERRUPTED RESTORE DATA
// =========================================

function populateInterruptedRestore(): void {
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

  mockStore.set(
    COMPLETION_KEY,
    JSON.stringify({
      version: 1,
      createdAt: TEST_DATE,
      backupCreatedAt: TEST_DATE,
      status: "finalizing",
    }),
  );

  mockStore.set(
    INTEGRITY_KEY,
    JSON.stringify({
      version: 1,
      createdAt: TEST_DATE,
      backupCreatedAt: TEST_DATE,
      status: "finalizing",
    }),
  );

  mockStore.set(KEYS.expenses, JSON.stringify([{ id: "interrupted-expense" }]));

  mockStore.set(KEYS.incomes, JSON.stringify([{ id: "interrupted-income" }]));
}

// =========================================
// SAFETY RECORD ASSERTIONS
// =========================================

function expectNoPendingSafetyRecords(): void {
  expect(mockStore.has(RECOVERY_KEY)).toBe(false);

  expect(mockStore.has(COMPLETION_KEY)).toBe(false);

  expect(mockStore.has(INTEGRITY_KEY)).toBe(false);
}

// =========================================
// ROLLBACK CLEANUP TEST SUITE
// =========================================

describe("Shavro rollback cleanup persistence", () => {
  beforeEach(() => {
    mockStore.clear();

    mockRemovalFailureMode = "none";
    mockJournalFailureTriggered = false;

    populateOriginalData();

    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =======================================
  // TEST 1
  // REMOVAL PERSISTS BUT REPORTS AN ERROR
  // =======================================

  test("allows normal startup after a verified rollback whose journal deletion persisted", async () => {
    populateInterruptedRestore();

    mockRemovalFailureMode = "after";

    // The current recovery attempt reports
    // an error after journal deletion.
    await expect(recoverInterruptedRestore()).rejects.toThrow(
      /could not safely resolve/i,
    );

    expect(mockJournalFailureTriggered).toBe(true);

    // Original financial collections
    // must have been restored.
    expectOriginalData();

    // All cleanup operations persisted.
    expectNoPendingSafetyRecords();

    // On a later startup, there is
    // no interrupted recovery remaining.
    const recovered = await recoverInterruptedRestore();

    expect(recovered).toBe(false);

    expectOriginalData();

    // Ordinary financial writes may
    // proceed after safety verification.
    await expect(assertNoPendingRestoreRecovery()).resolves.toBeUndefined();
  });

  // =======================================
  // TEST 2
  // REMOVAL FAILS BEFORE PERSISTENCE
  // =======================================

  test("preserves the recovery journal when deletion fails before persistence and succeeds on retry", async () => {
    populateInterruptedRestore();

    mockRemovalFailureMode = "before";

    await expect(recoverInterruptedRestore()).rejects.toThrow(
      /could not safely resolve/i,
    );

    expect(mockJournalFailureTriggered).toBe(true);

    // Financial rollback succeeded.
    expectOriginalData();

    // Recovery journal remains because
    // its deletion did not persist.
    expect(mockStore.has(RECOVERY_KEY)).toBe(true);

    // Writes must remain blocked.
    await expect(assertNoPendingRestoreRecovery()).rejects.toThrow(
      /unfinished backup recovery/i,
    );

    // Simulate the next app startup.
    // The injected failure has cleared.
    const recovered = await recoverInterruptedRestore();

    expect(recovered).toBe(true);

    expectOriginalData();

    expectNoPendingSafetyRecords();

    // Verified cleanup permits
    // subsequent guarded financial writes.
    await expect(assertNoPendingRestoreRecovery()).resolves.toBeUndefined();
  });
});
