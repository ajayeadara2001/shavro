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

const KEYS = {
  expenses: "shavro_expenses_v1",
  incomes: "shavro_income_v1",
  customCategories: "shavro_custom_categories_v1",
  customPaymentMethods: "shavro_custom_payment_methods_v1",
} as const;

const RECOVERY_KEY = "shavro_restore_recovery_v1";
const COMPLETION_KEY = "shavro_restore_completion_v1";

const TEST_DATE = "2026-11-17T06:00:00.000Z";

const mockStore = new Map<string, string>();

let mockRemoveCompletionThenThrow = false;
let mockPersistentReadFailure = false;
let mockFailureTriggered = false;

const mockLocalStorage = {
  getItem: jest.fn((key: string): string | null => {
    if (mockPersistentReadFailure && key === RECOVERY_KEY) {
      throw new Error("Simulated persistent storage read failure");
    }

    return mockStore.get(key) ?? null;
  }),

  setItem: jest.fn((key: string, value: string): void => {
    mockStore.set(key, value);
  }),

  removeItem: jest.fn((key: string): void => {
    mockStore.delete(key);

    if (key === COMPLETION_KEY && mockRemoveCompletionThenThrow) {
      mockRemoveCompletionThenThrow = false;
      mockPersistentReadFailure = true;
      mockFailureTriggered = true;

      throw new Error(
        "Completion marker was deleted, but storage reported an error",
      );
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

// Isolate storage recovery behavior from browser lock acquisition.
// Browser locking is tested in its own existing test suite.
jest.mock("../browserFinancialLock", () => ({
  runWithBrowserFinancialLock: async <T>(
    operation: () => Promise<T>,
  ): Promise<T> => operation(),
}));

import {
  applyShavroRestore,
  recoverInterruptedRestore,
} from "../backupRestoreWrite";

function makeBackup(): ShavroBackup {
  return {
    format: "shavro-backup",
    version: 1,
    createdAt: TEST_DATE,
    data: {
      expenses: [
        {
          id: "persistent-test-expense",
          amount: 750,
          categoryId: "food",
          expenseName: null,
          paymentMethodId: "upi",
          otherMethodName: null,
          transactionDate: "2026-11-17",
          notes: "Persistent failure regression",
          createdAt: TEST_DATE,
        },
      ],
      incomes: [
        {
          id: "persistent-test-income",
          amount: 5000,
          categoryId: "salary",
          incomeName: null,
          paymentMethodId: "cash",
          otherMethodName: null,
          transactionDate: "2026-11-17",
          notes: "Persistent failure regression",
          createdAt: TEST_DATE,
        },
      ],
      customCategories: [],
      customPaymentMethods: [],
    },
  };
}

describe("Shavro persistent restore failure protection", () => {
  let originalWindowDescriptor: PropertyDescriptor | undefined;

  beforeAll(() => {
    originalWindowDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "window",
    );

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: { localStorage: mockLocalStorage },
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

    mockRemoveCompletionThenThrow = false;
    mockPersistentReadFailure = false;
    mockFailureTriggered = false;

    mockStore.set(KEYS.expenses, JSON.stringify([{ id: "original-expense" }]));

    mockStore.set(KEYS.incomes, JSON.stringify([{ id: "original-income" }]));

    mockStore.set(KEYS.customCategories, "[]");
    mockStore.set(KEYS.customPaymentMethods, "[]");

    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("must not silently accept an unresolved restore after persistent verification failures", async () => {
    const backup = makeBackup();

    mockRemoveCompletionThenThrow = true;

    // Final marker deletion succeeds, but reports an error.
    // Subsequent recovery-journal verification keeps failing.
    await expect(applyShavroRestore(backup)).rejects.toThrow(
      /storage state could not be safely verified/i,
    );

    expect(mockFailureTriggered).toBe(true);
    expect(mockPersistentReadFailure).toBe(true);

    // Both existing markers have disappeared.
    expect(mockStore.has(RECOVERY_KEY)).toBe(false);
    expect(mockStore.has(COMPLETION_KEY)).toBe(false);

    // Simulate the storage read failure disappearing
    // before the application starts again.
    mockPersistentReadFailure = false;

    // A safe startup must not silently classify
    // an unresolved restoration as normal.
    await expect(recoverInterruptedRestore()).rejects.toThrow();
  });
});
