import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";

import type { ShavroBackup } from "../../types/backup";

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

let mockCommitFailureMode: "none" | "before" | "after" = "none";

let mockCommitFailureTriggered = false;

const mockLocalStorage = {
  getItem: jest.fn((key: string): string | null => {
    return mockStore.get(key) ?? null;
  }),

  setItem: jest.fn((key: string, value: string): void => {
    if (key === INTEGRITY_KEY) {
      const parsed = JSON.parse(value) as {
        status?: string;
      };

      if (parsed.status === "committed" && mockCommitFailureMode !== "none") {
        const mode = mockCommitFailureMode;

        mockCommitFailureMode = "none";
        mockCommitFailureTriggered = true;

        if (mode === "before") {
          throw new Error("Commit failed before persistence");
        }

        mockStore.set(key, value);

        throw new Error("Commit succeeded but reported an error");
      }
    }

    mockStore.set(key, value);
  }),

  removeItem: jest.fn((key: string): void => {
    mockStore.delete(key);
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

jest.mock("react-native", () => ({
  Platform: { OS: "web" },
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock("../browserFinancialLock", () => ({
  runWithBrowserFinancialLock: async <T>(
    operation: () => Promise<T>,
  ): Promise<T> => operation(),
}));

import {
  applyShavroRestore,
  recoverInterruptedRestore,
} from "../backupRestoreWrite";

import { assertNoPendingRestoreRecovery } from "../restoreRecoveryState";

function makeBackup(): ShavroBackup {
  return {
    format: "shavro-backup",
    version: 1,
    createdAt: TEST_DATE,
    data: {
      expenses: [
        {
          id: "commit-test-expense",
          amount: 750,
          categoryId: "food",
          expenseName: null,
          paymentMethodId: "upi",
          otherMethodName: null,
          transactionDate: "2026-11-17",
          notes: "Integrity commit test",
          createdAt: TEST_DATE,
        },
      ],
      incomes: [
        {
          id: "commit-test-income",
          amount: 5000,
          categoryId: "salary",
          incomeName: null,
          paymentMethodId: "cash",
          otherMethodName: null,
          transactionDate: "2026-11-17",
          notes: "Integrity commit test",
          createdAt: TEST_DATE,
        },
      ],
      customCategories: [],
      customPaymentMethods: [],
    },
  };
}

describe("Shavro durable restore commit", () => {
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

    mockCommitFailureMode = "none";
    mockCommitFailureTriggered = false;

    mockStore.set(KEYS.expenses, "[]");
    mockStore.set(KEYS.incomes, "[]");
    mockStore.set(KEYS.customCategories, "[]");
    mockStore.set(KEYS.customPaymentMethods, "[]");

    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("recovers from a transient error before commit persistence", async () => {
    mockCommitFailureMode = "before";

    const summary = await applyShavroRestore(makeBackup());

    expect(mockCommitFailureTriggered).toBe(true);

    expect(summary.expenseCount).toBe(1);
    expect(summary.incomeCount).toBe(1);

    expect(mockStore.has(RECOVERY_KEY)).toBe(false);

    expect(mockStore.has(COMPLETION_KEY)).toBe(false);

    const integrity = JSON.parse(mockStore.get(INTEGRITY_KEY)!);

    expect(integrity.status).toBe("committed");

    await expect(assertNoPendingRestoreRecovery()).resolves.toBeUndefined();
  });

  test("verifies commit after persistence succeeds but reports an error", async () => {
    mockCommitFailureMode = "after";

    const backup = makeBackup();

    const summary = await applyShavroRestore(backup);

    expect(mockCommitFailureTriggered).toBe(true);

    expect(summary.expenseCount).toBe(1);
    expect(summary.incomeCount).toBe(1);

    expect(JSON.parse(mockStore.get(KEYS.expenses)!)).toEqual(
      backup.data.expenses,
    );

    expect(JSON.parse(mockStore.get(KEYS.incomes)!)).toEqual(
      backup.data.incomes,
    );

    const integrity = JSON.parse(mockStore.get(INTEGRITY_KEY)!);

    expect(integrity.status).toBe("committed");

    await expect(recoverInterruptedRestore()).resolves.toBe(false);

    await expect(assertNoPendingRestoreRecovery()).resolves.toBeUndefined();
  });
});
