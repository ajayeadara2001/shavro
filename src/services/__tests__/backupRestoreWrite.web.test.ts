import {
  jest,
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "@jest/globals";

import type { ShavroBackup } from "../../types/backup";

// =========================================
// SHAVRO WEB RESTORE SAFETY TESTS
// =========================================
// Simulated browser localStorage only.
// No real browser financial data is used.

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

const mockStore = new Map<string, string>();

let mockFailWriteKeys: string[] = [];
let mockFailReadKeys: string[] = [];
let mockFailRemoveKeys: string[] = [];

let mockFailReadAfterJournalRemovalKey: string | null = null;

let mockJournalRemoved = false;
let mockRemoveCompletionThenThrow = false;

let mockFailReadAfterCompletionRemovalKey: string | null = null;

let mockCompletionRemoved = false;

// =========================================
// FAILURE HELPER
// =========================================

function mockShouldFail(queue: string[], key: string): boolean {
  if (queue[0] !== key) {
    return false;
  }

  queue.shift();
  return true;
}

// =========================================
// MOCK BROWSER LOCAL STORAGE
// =========================================

const mockLocalStorage = {
  getItem: jest.fn((key: string): string | null => {
    if (
      mockCompletionRemoved &&
      mockFailReadAfterCompletionRemovalKey === key
    ) {
      mockFailReadAfterCompletionRemovalKey = null;

      throw new Error(
        "Simulated verification read failure after completion marker removal",
      );
    }

    if (mockFailReadAfterJournalRemovalKey === key && mockJournalRemoved) {
      mockFailReadAfterJournalRemovalKey = null;

      throw new Error("Simulated read failure after journal removal");
    }

    if (mockShouldFail(mockFailReadKeys, key)) {
      throw new Error("Simulated web storage read failure");
    }

    return mockStore.get(key) ?? null;
  }),

  setItem: jest.fn((key: string, value: string): void => {
    if (mockShouldFail(mockFailWriteKeys, key)) {
      throw new Error("Simulated web storage write failure");
    }

    mockStore.set(key, value);
  }),

  removeItem: jest.fn((key: string): void => {
    if (mockShouldFail(mockFailRemoveKeys, key)) {
      throw new Error("Simulated web storage removal failure");
    }

    if (key === COMPLETION_KEY && mockRemoveCompletionThenThrow) {
      mockRemoveCompletionThenThrow = false;

      mockStore.delete(key);
      mockCompletionRemoved = true;

      throw new Error(
        "Simulated completion marker removal error after persistence",
      );
    }

    mockStore.delete(key);

    if (key === RECOVERY_KEY) {
      mockJournalRemoved = true;
    }

    if (key === COMPLETION_KEY) {
      mockCompletionRemoved = true;
    }
  }),

  clear: jest.fn(() => {
    mockStore.clear();
  }),

  key: jest.fn((index: number): string | null => {
    return Array.from(mockStore.keys())[index] ?? null;
  }),

  get length() {
    return mockStore.size;
  },
};

// =========================================
// PLATFORM MOCKS
// =========================================

jest.mock("react-native", () => ({
  Platform: {
    OS: "web",
  },
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

// =========================================
// SERVICE IMPORTS
// =========================================

import {
  applyShavroRestore,
  hasPendingRestoreRecovery,
  recoverInterruptedRestore,
} from "../backupRestoreWrite";

import { hasPendingRestoreCompletion } from "../restoreCompletionState";

// =========================================
// TEST BACKUP
// =========================================

function makeBackup(): ShavroBackup {
  return {
    format: "shavro-backup",
    version: 1,
    createdAt: TEST_DATE,
    data: {
      expenses: [
        {
          id: "web-expense-test-1",
          amount: 750,
          categoryId: "food",
          expenseName: null,
          paymentMethodId: "upi",
          otherMethodName: null,
          transactionDate: "2026-11-17",
          notes: "Web restore test",
          createdAt: TEST_DATE,
        },
      ],
      incomes: [
        {
          id: "web-income-test-1",
          amount: 5000,
          categoryId: "salary",
          incomeName: null,
          paymentMethodId: "cash",
          otherMethodName: null,
          transactionDate: "2026-11-17",
          notes: "Web restore test",
          createdAt: TEST_DATE,
        },
      ],
      customCategories: [],
      customPaymentMethods: [],
    },
  };
}

// =========================================
// ORIGINAL FINANCIAL DATA
// =========================================

const ORIGINAL = {
  expenses: JSON.stringify([{ id: "original-web-expense" }]),
  incomes: JSON.stringify([{ id: "original-web-income" }]),
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

function expectRestoredData(backup: ShavroBackup): void {
  expect(JSON.parse(mockStore.get(KEYS.expenses)!)).toEqual(
    backup.data.expenses,
  );

  expect(JSON.parse(mockStore.get(KEYS.incomes)!)).toEqual(backup.data.incomes);

  expect(JSON.parse(mockStore.get(KEYS.customCategories)!)).toEqual(
    backup.data.customCategories,
  );

  expect(JSON.parse(mockStore.get(KEYS.customPaymentMethods)!)).toEqual(
    backup.data.customPaymentMethods,
  );
}

// =========================================
// RECOVERY FIXTURES
// =========================================

function populateRecoveryJournal(): void {
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

function populateCompletionMarker(): void {
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
// WEB RESTORE TEST SUITE
// =========================================

describe("Shavro web protected restore", () => {
  let originalWindowDescriptor: PropertyDescriptor | undefined;

  beforeAll(() => {
    originalWindowDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "window",
    );

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: {
        localStorage: mockLocalStorage,
      },
    });
  });

  afterAll(() => {
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  });

  beforeEach(() => {
    mockStore.clear();

    mockFailWriteKeys = [];
    mockFailReadKeys = [];
    mockFailRemoveKeys = [];

    mockFailReadAfterJournalRemovalKey = null;
    mockJournalRemoved = false;

    mockRemoveCompletionThenThrow = false;
    mockFailReadAfterCompletionRemovalKey = null;
    mockCompletionRemoved = false;

    populateOriginalData();

    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // TEST 1
  test("successfully restores browser collections", async () => {
    const backup = makeBackup();

    const summary = await applyShavroRestore(backup);

    expect(summary.expenseCount).toBe(1);
    expect(summary.incomeCount).toBe(1);

    expectRestoredData(backup);
    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  });

  // TEST 2
  test("rolls back when browser income write fails", async () => {
    mockFailWriteKeys = [KEYS.incomes];

    await expect(applyShavroRestore(makeBackup())).rejects.toThrow();

    expectOriginalData();
    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  });

  // TEST 3
  test("preserves recovery journal after failed rollback", async () => {
    mockFailWriteKeys = [KEYS.incomes, KEYS.expenses];

    await expect(applyShavroRestore(makeBackup())).rejects.toThrow(
      /storage state could not be safely verified/i,
    );

    expect(await hasPendingRestoreRecovery()).toBe(true);
  });

  // TEST 4
  test("recovers interrupted browser restoration", async () => {
    populateRecoveryJournal();

    mockStore.set(
      KEYS.expenses,
      JSON.stringify([{ id: "partially-restored" }]),
    );

    const recovered = await recoverInterruptedRestore();

    expect(recovered).toBe(true);
    expectOriginalData();

    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  });

  // TEST 5
  test("does nothing when no browser recovery exists", async () => {
    const recovered = await recoverInterruptedRestore();

    expect(recovered).toBe(false);
    expectOriginalData();
  });

  // TEST 6
  test("rejects backup when journal creation fails", async () => {
    mockFailWriteKeys = [RECOVERY_KEY];

    await expect(applyShavroRestore(makeBackup())).rejects.toThrow();

    expectOriginalData();
    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  });

  // TEST 7
  test("rolls back after browser journal cleanup failure", async () => {
    mockFailRemoveKeys = [RECOVERY_KEY];

    await expect(applyShavroRestore(makeBackup())).rejects.toThrow();

    expectOriginalData();
    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  });

  // TEST 8
  test("does not overwrite an existing recovery journal", async () => {
    populateRecoveryJournal();

    const originalJournal = mockStore.get(RECOVERY_KEY);

    await expect(applyShavroRestore(makeBackup())).rejects.toThrow(
      /interrupted restore/i,
    );

    expectOriginalData();

    expect(mockStore.get(RECOVERY_KEY)).toBe(originalJournal);
  });

  // TEST 9
  test("rejects corrupt recovery data", async () => {
    mockStore.set(RECOVERY_KEY, "{invalid-json");

    await expect(recoverInterruptedRestore()).rejects.toThrow();

    expectOriginalData();

    expect(mockStore.get(RECOVERY_KEY)).toBe("{invalid-json");
  });

  // TEST 10
  test("does not restore if browser storage cannot be read", async () => {
    mockFailReadKeys = [KEYS.expenses];

    await expect(applyShavroRestore(makeBackup())).rejects.toThrow();

    expectOriginalData();
    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  });

  // TEST 11
  test("successful restore removes recovery journal and completion marker", async () => {
    const backup = makeBackup();

    await applyShavroRestore(backup);

    expectRestoredData(backup);

    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
    expect(mockStore.has(COMPLETION_KEY)).toBe(false);

    expect(await hasPendingRestoreCompletion()).toBe(false);
  });

  // TEST 12
  test("rolls back when completion marker cannot be saved", async () => {
    mockFailWriteKeys = [COMPLETION_KEY];

    await expect(applyShavroRestore(makeBackup())).rejects.toThrow();

    expectOriginalData();

    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
    expect(mockStore.has(COMPLETION_KEY)).toBe(false);
  });

  // TEST 13
  test("preserves completion marker when final cleanup fails", async () => {
    const backup = makeBackup();

    mockFailRemoveKeys = [COMPLETION_KEY];

    await expect(applyShavroRestore(backup)).rejects.toThrow(
      /storage state could not be safely verified/i,
    );

    expectRestoredData(backup);

    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
    expect(mockStore.has(COMPLETION_KEY)).toBe(true);

    expect(await hasPendingRestoreCompletion()).toBe(true);
  });

  // TEST 14
  test("blocks startup when completion marker exists without journal", async () => {
    populateCompletionMarker();

    await expect(recoverInterruptedRestore()).rejects.toThrow(
      /could not safely resolve/i,
    );

    expectOriginalData();

    expect(mockStore.has(COMPLETION_KEY)).toBe(true);
    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  });

  // TEST 15
  test("recovers original records when journal and marker both exist", async () => {
    populateRecoveryJournal();
    populateCompletionMarker();

    mockStore.set(
      KEYS.expenses,
      JSON.stringify([{ id: "interrupted-web-expense" }]),
    );

    mockStore.set(
      KEYS.incomes,
      JSON.stringify([{ id: "interrupted-web-income" }]),
    );

    const recovered = await recoverInterruptedRestore();

    expect(recovered).toBe(true);
    expectOriginalData();

    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
    expect(mockStore.has(COMPLETION_KEY)).toBe(false);
  });

  // TEST 16
  test("preserves completion marker when financial verification fails after journal removal", async () => {
    const backup = makeBackup();

    mockFailReadAfterJournalRemovalKey = KEYS.expenses;

    await expect(applyShavroRestore(backup)).rejects.toThrow(
      /storage state could not be safely verified/i,
    );

    expectRestoredData(backup);

    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
    expect(mockStore.has(COMPLETION_KEY)).toBe(true);

    await expect(recoverInterruptedRestore()).rejects.toThrow(
      /could not safely resolve/i,
    );
  });

  // TEST 17
  test("does not report an unresolved restore without retaining safety evidence", async () => {
    const backup = makeBackup();

    mockRemoveCompletionThenThrow = true;

    let restoreError: Error | null = null;

    try {
      await applyShavroRestore(backup);
    } catch (error) {
      restoreError = error instanceof Error ? error : new Error(String(error));
    }

    if (restoreError !== null) {
      const hasRecoveryJournal = await hasPendingRestoreRecovery();

      const hasCompletionMarker = await hasPendingRestoreCompletion();

      expect(
        hasRecoveryJournal ||
          hasCompletionMarker ||
          mockStore.get(INTEGRITY_KEY) !== undefined,
      ).toBe(true);
    } else {
      expectRestoredData(backup);

      expect(await hasPendingRestoreRecovery()).toBe(false);

      expect(await hasPendingRestoreCompletion()).toBe(false);
    }
  });

  // TEST 18
  test("verifies successful finalization after a transient read failure", async () => {
    const backup = makeBackup();

    mockRemoveCompletionThenThrow = true;

    mockFailReadAfterCompletionRemovalKey = RECOVERY_KEY;

    const summary = await applyShavroRestore(backup);

    expect(summary.expenseCount).toBe(1);
    expect(summary.incomeCount).toBe(1);

    expectRestoredData(backup);

    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
    expect(mockStore.has(COMPLETION_KEY)).toBe(false);

    expect(await hasPendingRestoreRecovery()).toBe(false);

    expect(await hasPendingRestoreCompletion()).toBe(false);

    expect(mockCompletionRemoved).toBe(true);

    expect(mockFailReadAfterCompletionRemovalKey).toBeNull();
  });

  // =======================================
  // NEW WEB INTEGRITY TESTS
  // =======================================

  // TEST 19
  test("web restore retains a verified committed integrity state", async () => {
    const backup = makeBackup();

    await applyShavroRestore(backup);

    expectRestoredData(backup);

    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
    expect(mockStore.has(COMPLETION_KEY)).toBe(false);

    const integrityRaw = mockStore.get(INTEGRITY_KEY);

    expect(integrityRaw).toBeDefined();

    expect(JSON.parse(integrityRaw!)).toMatchObject({
      version: 1,
      backupCreatedAt: backup.createdAt,
      status: "committed",
    });

    await expect(recoverInterruptedRestore()).resolves.toBe(false);

    expectRestoredData(backup);
  });

  // TEST 20
  test("web allows a second restore after the first commit", async () => {
    const firstBackup = makeBackup();

    await applyShavroRestore(firstBackup);

    const secondBackup = makeBackup();

    secondBackup.data.expenses[0].amount = 2000;
    secondBackup.data.incomes[0].amount = 12000;

    await applyShavroRestore(secondBackup);

    expectRestoredData(secondBackup);

    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
    expect(mockStore.has(COMPLETION_KEY)).toBe(false);

    const integrity = JSON.parse(mockStore.get(INTEGRITY_KEY)!);

    expect(integrity.status).toBe("committed");

    expect(integrity.backupCreatedAt).toBe(secondBackup.createdAt);
  });
});
