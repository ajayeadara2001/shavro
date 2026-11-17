import {
  beforeEach,
  afterEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";

import type { Expense } from "../../types/expense";
import type { Income } from "../../types/income";

// =========================================
// STORAGE KEY
// =========================================

const PAYMENT_KEY = "shavro_custom_payment_methods_v1";

// =========================================
// MOCK STORAGE
// =========================================

const mockStore = new Map<string, string>();

let mockExpenses: Expense[] = [];
let mockIncomes: Income[] = [];

let mockBlockWrites = false;
let mockGuardActive = false;
let mockGuardCalls = 0;

// =========================================
// MOCK ICON LIBRARY
// =========================================

/**
 * Built-in category and payment-method
 * constants can import lucide-react-native.
 *
 * These tests verify storage behavior,
 * not visual icon rendering.
 *
 * Prevent Jest from loading the
 * lucide-react-native ESM bundle.
 */
jest.mock("lucide-react-native", () => {
  return new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === "__esModule") {
          return true;
        }

        return () => null;
      },
    },
  );
});

// =========================================
// PLATFORM MOCK
// =========================================

jest.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

// =========================================
// ASYNC STORAGE MOCK
// =========================================

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,

  default: {
    getItem: jest.fn(async (key: string) => {
      return mockStore.get(key) ?? null;
    }),

    setItem: jest.fn(async (key: string, value: string) => {
      if (!mockGuardActive) {
        throw new Error("Unguarded financial write");
      }

      mockStore.set(key, value);
    }),

    removeItem: jest.fn(async (key: string) => {
      mockStore.delete(key);
    }),
  },
}));

// =========================================
// FINANCIAL WRITE GUARD MOCK
// =========================================

jest.mock("../storageOperationGuard", () => ({
  runFinancialWrite: async <T>(operation: () => Promise<T>): Promise<T> => {
    mockGuardCalls++;

    if (mockBlockWrites) {
      throw new Error("Unresolved backup restoration");
    }

    mockGuardActive = true;

    try {
      return await operation();
    } finally {
      mockGuardActive = false;
    }
  },
}));

// =========================================
// TRANSACTION STORAGE MOCKS
// =========================================

jest.mock("../expenseStorage", () => ({
  getExpenses: async () => mockExpenses,
}));

jest.mock("../incomeStorage", () => ({
  getIncomes: async () => mockIncomes,
}));

// =========================================
// SERVICE IMPORTS
// =========================================

import {
  addCustomPaymentMethod,
  renameCustomPaymentMethod,
  setCustomPaymentMethodArchived,
  deleteCustomPaymentMethod,
  getCustomPaymentMethods,
} from "../customOptionsStorage";

// =========================================
// STORAGE HELPER
// =========================================

function storedMethods(): Array<{
  id: string;
  name: string;
  archived?: boolean;
}> {
  return JSON.parse(mockStore.get(PAYMENT_KEY) ?? "[]");
}

// =========================================
// TEST SUITE
// =========================================

describe("Shavro custom payment method safety", () => {
  beforeEach(() => {
    mockStore.clear();

    mockExpenses = [];
    mockIncomes = [];

    mockBlockWrites = false;
    mockGuardActive = false;
    mockGuardCalls = 0;

    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =======================================
  // TEST 1 — CREATE PAYMENT METHOD
  // =======================================

  test("creates a payment method inside the guard", async () => {
    const method = await addCustomPaymentMethod("Travel Wallet");

    expect(method.name).toBe("Travel Wallet");
    expect(mockGuardCalls).toBe(1);

    expect(storedMethods()).toEqual([method]);
  });

  // =======================================
  // TEST 2 — RENAME PAYMENT METHOD
  // =======================================

  test("renames a method without changing its ID", async () => {
    const created = await addCustomPaymentMethod("Travel Wallet");

    mockGuardCalls = 0;

    const renamed = await renameCustomPaymentMethod(
      created.id,
      "Holiday Wallet",
    );

    expect(renamed.id).toBe(created.id);
    expect(renamed.name).toBe("Holiday Wallet");
    expect(mockGuardCalls).toBe(1);

    expect(storedMethods()).toEqual([renamed]);
  });

  // =======================================
  // TEST 3 — ARCHIVE PAYMENT METHOD
  // =======================================

  test("archives a method without deleting it", async () => {
    const created = await addCustomPaymentMethod("Travel Wallet");

    mockGuardCalls = 0;

    const archived = await setCustomPaymentMethodArchived(created.id, true);

    expect(archived.archived).toBe(true);
    expect(mockGuardCalls).toBe(1);

    expect(storedMethods()).toEqual([archived]);
  });

  // =======================================
  // TEST 4 — EXPENSE REFERENCE
  // =======================================

  test("prevents deletion when an expense references the method", async () => {
    const method = await addCustomPaymentMethod("Travel Wallet");

    mockExpenses = [
      {
        id: "expense-1",
        amount: 250,
        categoryId: "food",
        expenseName: null,
        paymentMethodId: method.id,
        otherMethodName: null,
        transactionDate: "2026-11-17",
        notes: "",
        createdAt: "2026-11-17T06:00:00.000Z",
      },
    ];

    await expect(deleteCustomPaymentMethod(method.id)).rejects.toThrow(
      /archive it instead/i,
    );

    expect(storedMethods()).toContainEqual(method);
  });

  // =======================================
  // TEST 5 — INCOME REFERENCE
  // =======================================

  test("prevents deletion when income references the method", async () => {
    const method = await addCustomPaymentMethod("Freelance Wallet");

    mockIncomes = [
      {
        id: "income-1",
        amount: 1000,
        categoryId: "salary",
        incomeName: null,
        paymentMethodId: method.id,
        otherMethodName: null,
        transactionDate: "2026-11-17",
        notes: "",
        createdAt: "2026-11-17T06:00:00.000Z",
      },
    ];

    await expect(deleteCustomPaymentMethod(method.id)).rejects.toThrow(
      /archive it instead/i,
    );

    expect(storedMethods()).toContainEqual(method);
  });

  // =======================================
  // TEST 6 — DELETE UNUSED METHOD
  // =======================================

  test("deletes an unused payment method", async () => {
    const method = await addCustomPaymentMethod("Temporary Wallet");

    mockGuardCalls = 0;

    await deleteCustomPaymentMethod(method.id);

    expect(mockGuardCalls).toBe(1);
    expect(await getCustomPaymentMethods()).toEqual([]);
  });

  // =======================================
  // TEST 7 — BLOCK RESTORATION
  // =======================================

  test("blocks payment method creation during restoration", async () => {
    mockBlockWrites = true;

    await expect(addCustomPaymentMethod("Blocked Wallet")).rejects.toThrow(
      /unresolved backup restoration/i,
    );

    expect(mockGuardCalls).toBe(1);
    expect(mockStore.has(PAYMENT_KEY)).toBe(false);
  });

  // =======================================
  // TEST 8 — DUPLICATE METHOD
  // =======================================

  test("rejects duplicate payment method names", async () => {
    await addCustomPaymentMethod("Travel Wallet");

    await expect(addCustomPaymentMethod("travel_wallet")).rejects.toThrow(
      /already exists/i,
    );

    expect(storedMethods()).toHaveLength(1);
  });

  // =======================================
  // TEST 9 — BUILT-IN NAME CONFLICT
  // =======================================

  test("rejects names conflicting with built-in payment methods", async () => {
    await expect(addCustomPaymentMethod("Cash")).rejects.toThrow(
      /already exists/i,
    );

    expect(storedMethods()).toHaveLength(0);
  });
});
