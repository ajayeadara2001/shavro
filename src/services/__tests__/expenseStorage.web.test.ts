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

import type { Expense, CreateExpenseInput } from "../../types/expense";

// =========================================
// TEST STORAGE
// =========================================

const STORAGE_KEY = "shavro_expenses_v1";

const mockStore = new Map<string, string>();

// Variables accessed by jest.mock() must
// use the mock prefix for Babel compatibility.
let mockBlockFinancialWrites = false;
let mockFinancialGuardCalls = 0;
let mockOperationInsideGuard = false;

// =========================================
// MOCK BROWSER LOCAL STORAGE
// =========================================

const mockLocalStorage = {
  getItem: jest.fn((key: string): string | null => {
    if (key === STORAGE_KEY && !mockOperationInsideGuard) {
      throw new Error("Financial read occurred outside write guard.");
    }

    return mockStore.get(key) ?? null;
  }),

  setItem: jest.fn((key: string, value: string): void => {
    if (key === STORAGE_KEY && !mockOperationInsideGuard) {
      throw new Error("Financial write occurred outside guard.");
    }

    mockStore.set(key, value);
  }),

  removeItem: jest.fn((key: string): void => {
    mockStore.delete(key);
  }),
};

// =========================================
// FINANCIAL GUARD MOCK
// =========================================

jest.mock("../storageOperationGuard", () => ({
  runFinancialWrite: async <T>(operation: () => Promise<T>): Promise<T> => {
    mockFinancialGuardCalls += 1;

    if (mockBlockFinancialWrites) {
      throw new Error(
        "Unresolved backup restoration. Financial writes blocked.",
      );
    }

    mockOperationInsideGuard = true;

    try {
      return await operation();
    } finally {
      mockOperationInsideGuard = false;
    }
  },
}));

// =========================================
// SERVICE IMPORTS
// =========================================

import {
  saveExpense,
  updateExpense,
  deleteExpense,
} from "../expenseStorage.web";

// =========================================
// TEST DATA
// =========================================

const TEST_DATE = "2026-11-17T06:00:00.000Z";

const INPUT: CreateExpenseInput = {
  amount: 750,
  categoryId: "food",
  expenseName: null,
  paymentMethodId: "upi",
  otherMethodName: null,
  transactionDate: "2026-11-17",
  notes: "Web expense test",
};

function makeExpense(): Expense {
  return {
    ...INPUT,
    id: "expense-test-1",
    createdAt: TEST_DATE,
  };
}

function readStoredExpenses(): Expense[] {
  return JSON.parse(mockStore.get(STORAGE_KEY) ?? "[]") as Expense[];
}

// =========================================
// WEB EXPENSE TEST SUITE
// =========================================

describe("Shavro web expense storage safety", () => {
  let originalWindowDescriptor: PropertyDescriptor | undefined;

  // =======================================
  // TEST ENVIRONMENT SETUP
  // =======================================

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

  // =======================================
  // RESET MOCK STATE
  // =======================================

  beforeEach(() => {
    mockStore.clear();

    mockBlockFinancialWrites = false;
    mockFinancialGuardCalls = 0;
    mockOperationInsideGuard = false;

    mockLocalStorage.getItem.mockClear();
    mockLocalStorage.setItem.mockClear();
    mockLocalStorage.removeItem.mockClear();

    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =======================================
  // TEST 1 — SAVE
  // =======================================

  test("saves a new expense inside the financial write guard", async () => {
    const saved = await saveExpense(INPUT);

    expect(saved.amount).toBe(750);
    expect(saved.id).toBeTruthy();

    expect(mockFinancialGuardCalls).toBe(1);

    expect(readStoredExpenses()).toEqual([saved]);
  });

  // =======================================
  // TEST 2 — UPDATE
  // =======================================

  test("updates an expense without changing its identity", async () => {
    const original = makeExpense();

    mockStore.set(STORAGE_KEY, JSON.stringify([original]));

    const updated = await updateExpense(original.id, {
      ...INPUT,
      amount: 1200,
      notes: "Updated expense",
    });

    expect(mockFinancialGuardCalls).toBe(1);

    expect(updated.amount).toBe(1200);
    expect(updated.id).toBe(original.id);

    expect(updated.createdAt).toBe(original.createdAt);

    expect(readStoredExpenses()).toEqual([updated]);
  });

  // =======================================
  // TEST 3 — DELETE
  // =======================================

  test("deletes an expense inside the financial write guard", async () => {
    const original = makeExpense();

    mockStore.set(STORAGE_KEY, JSON.stringify([original]));

    await deleteExpense(original.id);

    expect(mockFinancialGuardCalls).toBe(1);

    expect(readStoredExpenses()).toEqual([]);
  });

  // =======================================
  // TEST 4 — BLOCKED SAVE
  // =======================================

  test("does not save an expense when restoration is unresolved", async () => {
    mockBlockFinancialWrites = true;

    await expect(saveExpense(INPUT)).rejects.toThrow(
      /unresolved backup restoration/i,
    );

    expect(mockFinancialGuardCalls).toBe(1);

    expect(mockLocalStorage.setItem).not.toHaveBeenCalled();

    expect(mockStore.has(STORAGE_KEY)).toBe(false);
  });

  // =======================================
  // TEST 5 — BLOCKED UPDATE
  // =======================================

  test("preserves expenses when an update is blocked", async () => {
    const original = makeExpense();

    const stored = JSON.stringify([original]);

    mockStore.set(STORAGE_KEY, stored);

    mockBlockFinancialWrites = true;

    await expect(
      updateExpense(original.id, {
        ...INPUT,
        amount: 5000,
      }),
    ).rejects.toThrow(/unresolved backup restoration/i);

    expect(mockFinancialGuardCalls).toBe(1);

    expect(mockStore.get(STORAGE_KEY)).toBe(stored);

    expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
  });

  // =======================================
  // TEST 6 — BLOCKED DELETE
  // =======================================

  test("preserves expenses when deletion is blocked", async () => {
    const original = makeExpense();

    const stored = JSON.stringify([original]);

    mockStore.set(STORAGE_KEY, stored);

    mockBlockFinancialWrites = true;

    await expect(deleteExpense(original.id)).rejects.toThrow(
      /unresolved backup restoration/i,
    );

    expect(mockFinancialGuardCalls).toBe(1);

    expect(mockStore.get(STORAGE_KEY)).toBe(stored);

    expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
  });

  // =======================================
  // TEST 7 — CORRUPTED DATA
  // =======================================

  test("rejects corrupted expense storage without overwriting it", async () => {
    mockStore.set(STORAGE_KEY, "{invalid-json");

    await expect(saveExpense(INPUT)).rejects.toThrow(
      /unable to load saved expenses/i,
    );

    expect(mockFinancialGuardCalls).toBe(1);

    expect(mockStore.get(STORAGE_KEY)).toBe("{invalid-json");

    expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
  });
});
