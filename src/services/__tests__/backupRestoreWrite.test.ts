import type { ShavroBackup } from "../../types/backup";

import {
  jest,
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";

// =========================================
// SHAVRO NATIVE RESTORE SAFETY TESTS
// =========================================
// Uses simulated AsyncStorage.
// No actual financial records are modified.

const mockStore = new Map<string, string>();

let mockFailWriteKeys: string[] = [];
let mockFailReadKeys: string[] = [];
let mockFailRemoveKeys: string[] = [];
let mockPersistThenFailKeys: string[] = [];
let mockTamperThenFailKeys: string[] = [];

let mockFailJournalReadAfterRemoval = false;
let mockJournalRemoved = false;

const RECOVERY_KEY = "shavro_restore_recovery_v1";
const COMPLETION_KEY = "shavro_restore_completion_v1";
const INTEGRITY_KEY = "shavro_restore_integrity_v1";

const KEYS = {
  expenses: "shavro_expenses_v1",
  incomes: "shavro_income_v1",
  customCategories: "shavro_custom_categories_v1",
  customPaymentMethods: "shavro_custom_payment_methods_v1",
} as const;

const TEST_DATE = "2026-11-17T06:00:00.000Z";

function mockShouldFail(queue: string[], key: string): boolean {
  if (queue[0] !== key) {
    return false;
  }

  queue.shift();
  return true;
}

// =========================================
// MOCK ASYNC STORAGE
// =========================================

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => {
      if (mockShouldFail(mockFailReadKeys, key)) {
        throw new Error("Simulated storage read failure");
      }

      if (
        key === RECOVERY_KEY &&
        mockJournalRemoved &&
        mockFailJournalReadAfterRemoval
      ) {
        mockFailJournalReadAfterRemoval = false;

        throw new Error("Simulated post-removal verification failure");
      }

      return mockStore.get(key) ?? null;
    }),

    setItem: jest.fn(async (key: string, value: string) => {
      if (mockShouldFail(mockFailWriteKeys, key)) {
        throw new Error("Simulated storage write failure");
      }

      if (mockShouldFail(mockPersistThenFailKeys, key)) {
        mockStore.set(key, value);

        throw new Error("Simulated failure after persistence");
      }

      if (mockShouldFail(mockTamperThenFailKeys, key)) {
        mockStore.set(
          key,
          JSON.stringify({
            unexpected: "journal alteration",
          }),
        );

        throw new Error("Simulated journal alteration");
      }

      mockStore.set(key, value);
    }),

    removeItem: jest.fn(async (key: string) => {
      if (mockShouldFail(mockFailRemoveKeys, key)) {
        throw new Error("Simulated storage removal failure");
      }

      mockStore.delete(key);

      if (key === RECOVERY_KEY) {
        mockJournalRemoved = true;
      }
    }),
  },
}));

jest.mock("react-native", () => ({
  Platform: {
    OS: "android",
  },
}));

import {
  applyShavroRestore,
  hasPendingRestoreRecovery,
  recoverInterruptedRestore,
} from "../backupRestoreWrite";

// =========================================
// BACKUP FIXTURE
// =========================================

function makeBackup(): ShavroBackup {
  return {
    format: "shavro-backup",
    version: 1,
    createdAt: TEST_DATE,
    data: {
      expenses: [
        {
          id: "expense-test-1",
          amount: 500,
          categoryId: "food",
          expenseName: null,
          paymentMethodId: "cash",
          otherMethodName: null,
          transactionDate: "2026-11-17",
          notes: "Restore test",
          createdAt: TEST_DATE,
        },
      ],
      incomes: [
        {
          id: "income-test-1",
          amount: 2000,
          categoryId: "salary",
          incomeName: null,
          paymentMethodId: "upi",
          otherMethodName: null,
          transactionDate: "2026-11-17",
          notes: "Restore test",
          createdAt: TEST_DATE,
        },
      ],
      customCategories: [],
      customPaymentMethods: [],
    },
  };
}

const ORIGINAL = {
  expenses: JSON.stringify([{ id: "old-expense" }]),
  incomes: JSON.stringify([{ id: "old-income" }]),
  customCategories: "[]",
  customPaymentMethods: "[]",
};

function populateExistingStorage(): void {
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

function populateRecoveryJournal(
  snapshot: Record<string, string | null> = {
    ...ORIGINAL,
  },
): void {
  mockStore.set(
    RECOVERY_KEY,
    JSON.stringify({
      version: 1,
      createdAt: TEST_DATE,
      snapshot,
    }),
  );
}

// =========================================
// NATIVE RESTORE TEST SUITE
// =========================================

describe("Shavro protected restore", () => {
  beforeEach(() => {
    mockStore.clear();

    mockFailWriteKeys = [];
    mockFailReadKeys = [];
    mockFailRemoveKeys = [];
    mockPersistThenFailKeys = [];
    mockTamperThenFailKeys = [];

    mockFailJournalReadAfterRemoval = false;
    mockJournalRemoved = false;

    populateExistingStorage();

    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // TEST 1
  test("successfully restores all collections", async () => {
    const backup = makeBackup();

    const summary = await applyShavroRestore(backup);

    expect(summary.expenseCount).toBe(1);
    expect(summary.incomeCount).toBe(1);
    expect(summary.customCategoryCount).toBe(0);
    expect(summary.customPaymentMethodCount).toBe(0);

    expectRestoredData(backup);
    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  });

  // TEST 2
  test("rolls back when an income write fails", async () => {
    mockFailWriteKeys = [KEYS.incomes];

    await expect(applyShavroRestore(makeBackup())).rejects.toThrow();

    expectOriginalData();
    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  });

  // TEST 3
  test("preserves recovery journal if rollback fails", async () => {
    mockFailWriteKeys = [KEYS.incomes, KEYS.expenses];

    await expect(applyShavroRestore(makeBackup())).rejects.toThrow(
      /storage state could not be safely verified/i,
    );

    expect(await hasPendingRestoreRecovery()).toBe(true);

    expect(mockStore.has(RECOVERY_KEY)).toBe(true);
  });

  // TEST 4
  test("recovers an interrupted restore on startup", async () => {
    populateRecoveryJournal();

    mockStore.set(KEYS.expenses, JSON.stringify([{ id: "partial-restore" }]));

    const recovered = await recoverInterruptedRestore();

    expect(recovered).toBe(true);
    expectOriginalData();
    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  });

  // TEST 5
  test("does nothing when no recovery journal exists", async () => {
    const recovered = await recoverInterruptedRestore();

    expect(recovered).toBe(false);
    expectOriginalData();
    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  });

  // TEST 6
  test("rejects an unsupported backup version", async () => {
    const backup = {
      ...makeBackup(),
      version: 999,
    } as unknown as ShavroBackup;

    await expect(applyShavroRestore(backup)).rejects.toThrow();

    expectOriginalData();
    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  });

  // TEST 7
  test("does not replace data when journal creation fails", async () => {
    mockFailWriteKeys = [RECOVERY_KEY];

    await expect(applyShavroRestore(makeBackup())).rejects.toThrow();

    expectOriginalData();
    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  });

  // TEST 8
  test("rolls back when recovery journal cleanup fails", async () => {
    mockFailRemoveKeys = [RECOVERY_KEY];

    await expect(applyShavroRestore(makeBackup())).rejects.toThrow();

    expectOriginalData();
    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  });

  // TEST 9
  test("retains journal when cleanup and rollback fail", async () => {
    mockFailRemoveKeys = [RECOVERY_KEY];
    mockFailWriteKeys = [KEYS.expenses];

    await expect(applyShavroRestore(makeBackup())).rejects.toThrow(
      /storage state could not be safely verified/i,
    );

    expect(await hasPendingRestoreRecovery()).toBe(true);

    expect(mockStore.has(RECOVERY_KEY)).toBe(true);
  });

  // TEST 10
  test("does not restore when original storage cannot be read", async () => {
    mockFailReadKeys = [KEYS.expenses];

    await expect(applyShavroRestore(makeBackup())).rejects.toThrow();

    expectOriginalData();
    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  });

  // TEST 11
  test("rejects corrupted recovery journal without deleting it", async () => {
    mockStore.set(RECOVERY_KEY, "{invalid-json");

    await expect(recoverInterruptedRestore()).rejects.toThrow();

    expectOriginalData();

    expect(mockStore.get(RECOVERY_KEY)).toBe("{invalid-json");
  });

  // TEST 12
  test("recovers storage keys that were originally absent", async () => {
    mockStore.delete(KEYS.expenses);
    mockStore.delete(KEYS.incomes);

    populateRecoveryJournal({
      expenses: null,
      incomes: null,
      customCategories: ORIGINAL.customCategories,
      customPaymentMethods: ORIGINAL.customPaymentMethods,
    });

    mockStore.set(KEYS.expenses, JSON.stringify([{ id: "imported-expense" }]));

    mockStore.set(KEYS.incomes, JSON.stringify([{ id: "imported-income" }]));

    const recovered = await recoverInterruptedRestore();

    expect(recovered).toBe(true);

    expect(mockStore.has(KEYS.expenses)).toBe(false);
    expect(mockStore.has(KEYS.incomes)).toBe(false);

    expect(mockStore.get(KEYS.customCategories)).toBe(
      ORIGINAL.customCategories,
    );

    expect(mockStore.get(KEYS.customPaymentMethods)).toBe(
      ORIGINAL.customPaymentMethods,
    );

    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  });

  // TEST 13
  test("rejects a new restore when recovery is already pending", async () => {
    populateRecoveryJournal();

    await expect(applyShavroRestore(makeBackup())).rejects.toThrow(
      /interrupted restore/i,
    );

    expectOriginalData();
    expect(mockStore.has(RECOVERY_KEY)).toBe(true);
  });

  // TEST 14
  test("allows retry after temporary recovery failure", async () => {
    populateRecoveryJournal();

    mockStore.set(
      KEYS.expenses,
      JSON.stringify([{ id: "partially-restored" }]),
    );

    mockFailWriteKeys = [KEYS.expenses];

    await expect(recoverInterruptedRestore()).rejects.toThrow();

    expect(mockStore.has(RECOVERY_KEY)).toBe(true);

    const recovered = await recoverInterruptedRestore();

    expect(recovered).toBe(true);
    expectOriginalData();

    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  });

  // TEST 15
  test("rejects recovery journal with missing snapshot fields", async () => {
    mockStore.set(
      RECOVERY_KEY,
      JSON.stringify({
        version: 1,
        createdAt: TEST_DATE,
        snapshot: {
          expenses: ORIGINAL.expenses,
        },
      }),
    );

    await expect(recoverInterruptedRestore()).rejects.toThrow();

    expectOriginalData();
    expect(mockStore.has(RECOVERY_KEY)).toBe(true);
  });

  // TEST 16
  test("preserves recovery journal if startup cleanup fails", async () => {
    populateRecoveryJournal();
    mockFailRemoveKeys = [RECOVERY_KEY];

    await expect(recoverInterruptedRestore()).rejects.toThrow();

    expectOriginalData();
    expect(mockStore.has(RECOVERY_KEY)).toBe(true);
  });

  // TEST 17
  test("recovers when journal persists before a reported write failure", async () => {
    mockPersistThenFailKeys = [RECOVERY_KEY];

    await expect(applyShavroRestore(makeBackup())).rejects.toThrow(
      "Simulated failure after persistence",
    );

    expectOriginalData();
    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  });

  // TEST 18
  test("preserves financial data when journal cannot persist", async () => {
    mockFailWriteKeys = [RECOVERY_KEY];

    await expect(applyShavroRestore(makeBackup())).rejects.toThrow(
      "Simulated storage write failure",
    );

    expectOriginalData();
    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  });

  // TEST 19
  test("preserves an altered recovery journal without trusting it", async () => {
    mockTamperThenFailKeys = [RECOVERY_KEY];

    await expect(applyShavroRestore(makeBackup())).rejects.toThrow(
      /storage state could not be safely verified/i,
    );

    expectOriginalData();
    expect(mockStore.has(RECOVERY_KEY)).toBe(true);

    expect(mockStore.get(RECOVERY_KEY)).toContain("journal alteration");
  });

  // TEST 20
  test("reports an uncertain state when journal verification fails after removal", async () => {
    const backup = makeBackup();

    mockFailJournalReadAfterRemoval = true;

    await expect(applyShavroRestore(backup)).rejects.toThrow(
      /storage state could not be safely verified/i,
    );

    expectRestoredData(backup);

    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  });

  // TEST 21
  test("successful restore clears recovery and completion markers", async () => {
    const backup = makeBackup();

    await applyShavroRestore(backup);

    expectRestoredData(backup);

    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
    expect(mockStore.has(COMPLETION_KEY)).toBe(false);
  });

  // TEST 22
  // IMPORTANT: This test ends completely
  // before the next test is declared.
  test("recovers original data when journal and completion marker both exist", async () => {
    populateRecoveryJournal();

    mockStore.set(KEYS.expenses, JSON.stringify([{ id: "imported-expense" }]));

    mockStore.set(
      COMPLETION_KEY,
      JSON.stringify({
        version: 1,
        createdAt: TEST_DATE,
        backupCreatedAt: TEST_DATE,
        status: "finalizing",
      }),
    );

    const recovered = await recoverInterruptedRestore();

    expect(recovered).toBe(true);
    expectOriginalData();

    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
    expect(mockStore.has(COMPLETION_KEY)).toBe(false);
  });

  // TEST 23
  test("blocks startup when completion marker exists without recovery journal", async () => {
    mockStore.set(
      COMPLETION_KEY,
      JSON.stringify({
        version: 1,
        createdAt: TEST_DATE,
        backupCreatedAt: TEST_DATE,
        status: "finalizing",
      }),
    );

    await expect(recoverInterruptedRestore()).rejects.toThrow(
      /could not safely resolve/i,
    );

    expectOriginalData();

    expect(mockStore.has(COMPLETION_KEY)).toBe(true);
    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  });

  // TEST 24
  test("rejects new restore when completion marker remains unresolved", async () => {
    const marker = JSON.stringify({
      version: 1,
      createdAt: TEST_DATE,
      backupCreatedAt: TEST_DATE,
      status: "finalizing",
    });

    mockStore.set(COMPLETION_KEY, marker);

    await expect(applyShavroRestore(makeBackup())).rejects.toThrow(
      /unresolved restore completion state/i,
    );

    expectOriginalData();

    expect(mockStore.get(COMPLETION_KEY)).toBe(marker);
    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
  });

  // =======================================
  // NEW INTEGRITY TESTS
  // =======================================

  // TEST 25
  test("successful restore retains a committed integrity record", async () => {
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

  // TEST 26
  test("allows another restore after a previous restore was committed", async () => {
    const firstBackup = makeBackup();

    await applyShavroRestore(firstBackup);

    const secondBackup = makeBackup();

    secondBackup.data.expenses[0].amount = 1250;
    secondBackup.data.incomes[0].amount = 8000;

    const summary = await applyShavroRestore(secondBackup);

    expect(summary.expenseCount).toBe(1);
    expect(summary.incomeCount).toBe(1);

    expectRestoredData(secondBackup);

    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
    expect(mockStore.has(COMPLETION_KEY)).toBe(false);

    const integrity = JSON.parse(mockStore.get(INTEGRITY_KEY)!);

    expect(integrity.status).toBe("committed");

    expect(integrity.backupCreatedAt).toBe(secondBackup.createdAt);
  });
});
