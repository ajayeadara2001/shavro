import { jest, describe, it, expect } from "@jest/globals";

import type { Expense } from "../../types/expense";
import type { Income } from "../../types/income";

import type {
  CustomCategory,
  CustomPaymentMethod,
} from "../../services/customOptionsStorage";

import {
  encodeAllCollections,
  decodeAllCollections,
  decodeExpenses,
  decodeIncomes,
  decodeCategories,
} from "../sqliteFinancialCodec.native";

// =========================================
// JEST MOCKS
// =========================================

/**
 * sqliteFinancialCodec.native.ts uses
 * rupeesToPaise from the migration
 * preflight service.
 *
 * That service imports AsyncStorage.
 *
 * Jest must therefore mock AsyncStorage
 * to prevent the native module error.
 *
 * Obtain Jest inside the mock factory
 * to avoid module-hoisting issues.
 */
jest.mock("@react-native-async-storage/async-storage", () => {
  const mockJest = require("@jest/globals").jest;

  return {
    __esModule: true,
    default: {
      getItem: mockJest.fn(),
      setItem: mockJest.fn(),
      removeItem: mockJest.fn(),
    },
  };
});

// =========================================
// TEST DATA — EXPENSES
// =========================================

const expenses: Expense[] = [
  {
    id: "expense-second",
    amount: 500.25,
    categoryId: "food",
    expenseName: null,
    paymentMethodId: "upi",
    otherMethodName: null,
    transactionDate: "2026-11-18",
    notes: "Second",
    createdAt: "2026-11-18T10:00:00.000Z",
  },
  {
    id: "expense-first",
    amount: 100.05,
    categoryId: "transport",
    expenseName: null,
    paymentMethodId: "cash",
    otherMethodName: null,
    transactionDate: "2026-11-18",
    notes: "First",
    createdAt: "2026-11-18T10:00:00.000Z",
  },
];

// =========================================
// TEST DATA — INCOMES
// =========================================

const incomes: Income[] = [
  {
    id: "income-legacy",
    amount: 50000,
    categoryId: "salary",
    incomeName: null,
    transactionDate: "2026-11-18",
    notes: "Legacy income",
    createdAt: "2026-11-18T09:00:00.000Z",
  },
  {
    id: "income-new",
    amount: 750.5,
    categoryId: "freelance",
    incomeName: null,
    paymentMethodId: null,
    otherMethodName: null,
    transactionDate: "2026-11-18",
    notes: "New income",
    createdAt: "2026-11-18T08:00:00.000Z",
  },
];

// =========================================
// TEST DATA — CUSTOM CATEGORIES
// =========================================

const categories: CustomCategory[] = [
  {
    id: "category-old",
    name: "Old Category",
    scope: "EXPENSE",
  },
  {
    id: "category-archived",
    name: "Archived Category",
    scope: "INCOME",
    archived: true,
  },
];

// =========================================
// TEST DATA — PAYMENT METHODS
// =========================================

const paymentMethods: CustomPaymentMethod[] = [
  {
    id: "payment-old",
    name: "Old Wallet",
  },
  {
    id: "payment-active",
    name: "Gift Card",
    archived: false,
  },
];

// =========================================
// TEST SUITE
// =========================================

describe("SQLite financial round-trip", () => {
  // =======================================
  // TEST 1 — ALL COLLECTIONS
  // =======================================

  it("preserves all four collections", () => {
    const original = {
      expenses,
      incomes,
      categories,
      paymentMethods,
    };

    const encoded = encodeAllCollections(original);

    const restored = decodeAllCollections(encoded);

    expect(restored).toEqual(original);
  });

  // =======================================
  // TEST 2 — TRANSACTION ORDER
  // =======================================

  it("preserves transaction order when dates are identical", () => {
    const rows = encodeAllCollections({
      expenses,
      incomes: [],
      categories: [],
      paymentMethods: [],
    }).expenses;

    // Simulate SQLite returning records
    // in a different order.
    const reversed = [...rows].reverse();

    const restored = decodeExpenses(reversed);

    expect(restored.map((item) => item.id)).toEqual([
      "expense-second",
      "expense-first",
    ]);
  });

  // =======================================
  // TEST 3 — EXACT MONETARY VALUES
  // =======================================

  it("preserves exact paise values", () => {
    const encoded = encodeAllCollections({
      expenses,
      incomes: [],
      categories: [],
      paymentMethods: [],
    });

    expect(encoded.expenses[0].amount_paise).toBe(50025);

    expect(encoded.expenses[1].amount_paise).toBe(10005);

    expect(decodeExpenses(encoded.expenses)).toEqual(expenses);
  });

  // =======================================
  // TEST 4 — LEGACY INCOME
  // =======================================

  it("preserves omitted legacy income fields", () => {
    const encoded = encodeAllCollections({
      expenses: [],
      incomes,
      categories: [],
      paymentMethods: [],
    });

    const restored = decodeIncomes(encoded.incomes);

    // Legacy income must not suddenly
    // acquire optional properties.
    expect(
      Object.prototype.hasOwnProperty.call(restored[0], "paymentMethodId"),
    ).toBe(false);

    expect(
      Object.prototype.hasOwnProperty.call(restored[0], "otherMethodName"),
    ).toBe(false);

    // Explicit null remains explicit null.
    expect(restored[1].paymentMethodId).toBeNull();

    expect(
      Object.prototype.hasOwnProperty.call(restored[1], "paymentMethodId"),
    ).toBe(true);

    expect(
      Object.prototype.hasOwnProperty.call(restored[1], "otherMethodName"),
    ).toBe(true);
  });

  // =======================================
  // TEST 5 — ARCHIVED VALUES
  // =======================================

  it("preserves archived true, false and missing values", () => {
    const encoded = encodeAllCollections({
      expenses: [],
      incomes: [],
      categories,
      paymentMethods,
    });

    const restored = decodeAllCollections(encoded);

    expect(restored.categories[0]).not.toHaveProperty("archived");

    expect(restored.categories[1].archived).toBe(true);

    expect(restored.paymentMethods[0]).not.toHaveProperty("archived");

    expect(restored.paymentMethods[1].archived).toBe(false);
  });

  // =======================================
  // TEST 6 — DUPLICATE POSITIONS
  // =======================================

  it("rejects duplicate transaction positions", () => {
    const encoded = encodeAllCollections({
      expenses,
      incomes: [],
      categories: [],
      paymentMethods: [],
    });

    encoded.expenses[1].position = 0;

    expect(() => decodeExpenses(encoded.expenses)).toThrow(
      "Expenses: invalid SQLite ordering",
    );
  });

  // =======================================
  // TEST 7 — INVALID PRESENCE FLAGS
  // =======================================

  it("rejects invalid income presence flags", () => {
    const encoded = encodeAllCollections({
      expenses: [],
      incomes,
      categories: [],
      paymentMethods: [],
    });

    encoded.incomes[0].has_payment_method_id = 5;

    expect(() => decodeIncomes(encoded.incomes)).toThrow(
      "invalid property-presence flag",
    );
  });

  // =======================================
  // TEST 8 — INVALID ARCHIVED VALUE
  // =======================================

  it("rejects invalid category archived values", () => {
    const encoded = encodeAllCollections({
      expenses: [],
      incomes: [],
      categories,
      paymentMethods: [],
    });

    encoded.categories[0].archived = 5;

    expect(() => decodeCategories(encoded.categories)).toThrow(
      "invalid archived value",
    );
  });
});
