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

const CATEGORY_KEY = "shavro_custom_categories_v1";

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
 * Category constants import icons from
 * lucide-react-native.
 *
 * Jest does not need to render those icons
 * for financial storage safety tests.
 *
 * Mocking the icon library prevents its
 * ESM bundle from being loaded as CommonJS.
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
  addCustomCategory,
  renameCustomCategory,
  setCustomCategoryArchived,
  deleteCustomCategory,
  getCustomCategories,
} from "../customOptionsStorage";

// =========================================
// STORAGE HELPER
// =========================================

function storedCategories(): Array<{
  id: string;
  name: string;
  scope: "INCOME" | "EXPENSE";
  archived?: boolean;
}> {
  return JSON.parse(mockStore.get(CATEGORY_KEY) ?? "[]");
}

// =========================================
// TEST SUITE
// =========================================

describe("Shavro custom category write safety", () => {
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
  // TEST 1 — CREATE CATEGORY
  // =======================================

  test("creates an expense category through the guard", async () => {
    const category = await addCustomCategory("Subscriptions", "EXPENSE");

    expect(category.scope).toBe("EXPENSE");
    expect(category.name).toBe("Subscriptions");
    expect(mockGuardCalls).toBe(1);

    expect(storedCategories()).toEqual([category]);
  });

  // =======================================
  // TEST 2 — RENAME CATEGORY
  // =======================================

  test("renames a category without changing its ID", async () => {
    const created = await addCustomCategory("Memberships", "EXPENSE");

    mockGuardCalls = 0;

    const renamed = await renameCustomCategory(created.id, "Subscriptions");

    expect(renamed.id).toBe(created.id);
    expect(renamed.name).toBe("Subscriptions");
    expect(mockGuardCalls).toBe(1);

    expect(storedCategories()).toEqual([renamed]);
  });

  // =======================================
  // TEST 3 — ARCHIVE CATEGORY
  // =======================================

  test("archives a category while retaining its record", async () => {
    const created = await addCustomCategory(
      "Shavro Test Project Earnings 2026",
      "INCOME",
    );

    mockGuardCalls = 0;

    const archived = await setCustomCategoryArchived(created.id, true);

    expect(archived.id).toBe(created.id);
    expect(archived.name).toBe("Shavro Test Project Earnings 2026");
    expect(archived.archived).toBe(true);
    expect(mockGuardCalls).toBe(1);
    expect(storedCategories()).toEqual([archived]);
  });

  // =======================================
  // TEST 4 — EXPENSE REFERENCE
  // =======================================

  test("refuses to delete a category referenced by an expense", async () => {
    const category = await addCustomCategory("Hobbies", "EXPENSE");

    mockExpenses = [
      {
        id: "expense-1",
        amount: 100,
        categoryId: category.id,
        expenseName: null,
        paymentMethodId: "cash",
        otherMethodName: null,
        transactionDate: "2026-11-17",
        notes: "",
        createdAt: "2026-11-17T06:00:00.000Z",
      },
    ];

    mockGuardCalls = 0;

    await expect(deleteCustomCategory(category.id)).rejects.toThrow(
      /archive it instead/i,
    );

    expect(mockGuardCalls).toBe(1);
    expect(storedCategories()).toContainEqual(category);
  });

  // =======================================
  // TEST 5 — INCOME REFERENCE
  // =======================================

  test("refuses to delete a category referenced by income", async () => {
    const category = await addCustomCategory("Side Projects", "INCOME");

    mockIncomes = [
      {
        id: "income-1",
        amount: 500,
        categoryId: category.id,
        incomeName: null,
        paymentMethodId: "upi",
        otherMethodName: null,
        transactionDate: "2026-11-17",
        notes: "",
        createdAt: "2026-11-17T06:00:00.000Z",
      },
    ];

    await expect(deleteCustomCategory(category.id)).rejects.toThrow(
      /archive it instead/i,
    );

    expect(storedCategories()).toContainEqual(category);
  });

  // =======================================
  // TEST 6 — DELETE UNUSED CATEGORY
  // =======================================

  test("deletes an unused category through the guard", async () => {
    const category = await addCustomCategory("Temporary Category", "EXPENSE");

    mockGuardCalls = 0;

    await deleteCustomCategory(category.id);

    expect(mockGuardCalls).toBe(1);
    expect(await getCustomCategories()).toEqual([]);
  });

  // =======================================
  // TEST 7 — BLOCK RESTORATION
  // =======================================

  test("blocks category creation during unresolved restoration", async () => {
    mockBlockWrites = true;

    await expect(
      addCustomCategory("Blocked Category", "EXPENSE"),
    ).rejects.toThrow(/unresolved backup restoration/i);

    expect(mockGuardCalls).toBe(1);

    expect(mockStore.has(CATEGORY_KEY)).toBe(false);
  });

  // =======================================
  // TEST 8 — DUPLICATE CATEGORY
  // =======================================

  test("rejects duplicate category names", async () => {
    await addCustomCategory("Subscriptions", "EXPENSE");

    await expect(addCustomCategory("subscriptions", "EXPENSE")).rejects.toThrow(
      /already exists/i,
    );

    expect(storedCategories()).toHaveLength(1);
  });
});
