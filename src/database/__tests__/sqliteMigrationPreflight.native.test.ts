import AsyncStorage from "@react-native-async-storage/async-storage";

import { jest, describe, it, expect, beforeEach } from "@jest/globals";

import {
  rupeesToPaise,
  runMigrationPreflight,
} from "../sqliteMigrationPreflight.native";

// =========================================
// MOCK ASYNC STORAGE
// =========================================

jest.mock("@react-native-async-storage/async-storage", () => {
  const mockJest = require("@jest/globals").jest;

  return {
    __esModule: true,
    default: {
      getItem: mockJest.fn(),
    },
  };
});

// =========================================
// TEST DATA
// =========================================

const EXPENSE_KEY = "shavro_expenses_v1";
const INCOME_KEY = "shavro_income_v1";

const expense = {
  id: "expense-001",
  amount: 500.25,
  categoryId: "food",
  expenseName: null,
  paymentMethodId: "upi",
  otherMethodName: null,
  transactionDate: "2026-11-18",
  notes: "Lunch",
  createdAt: "2026-11-18T10:00:00.000Z",
};

const income = {
  id: "income-001",
  amount: 50000,
  categoryId: "salary",
  incomeName: null,
  paymentMethodId: "bank",
  otherMethodName: null,
  transactionDate: "2026-11-18",
  notes: "Salary",
  createdAt: "2026-11-18T09:00:00.000Z",
};

// =========================================
// STORAGE TEST HELPER
// =========================================

function mockStoredRecords(expenses: unknown, incomes: unknown): void {
  jest.mocked(AsyncStorage.getItem).mockImplementation(async (key: string) => {
    if (key === EXPENSE_KEY) {
      return JSON.stringify(expenses);
    }

    if (key === INCOME_KEY) {
      return JSON.stringify(incomes);
    }

    return null;
  });
}

// =========================================
// TEST SUITE
// =========================================

describe("SQLite migration preflight", () => {
  beforeEach(() => {
    jest.resetAllMocks();

    mockStoredRecords([expense], [income]);
  });

  // =======================================
  // TEST 1 — VALID RECORDS
  // =======================================

  it("accepts valid expense and income records", async () => {
    const result = await runMigrationPreflight();

    expect(result).toEqual({
      ready: true,
      expenseCount: 1,
      incomeCount: 1,
      totalCount: 2,
    });
  });

  // =======================================
  // TEST 2 — EMPTY INSTALLATION
  // =======================================

  it("accepts an installation with no saved records", async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);

    const result = await runMigrationPreflight();

    expect(result).toEqual({
      ready: true,
      expenseCount: 0,
      incomeCount: 0,
      totalCount: 0,
    });
  });

  // =======================================
  // TEST 3 — MONEY CONVERSION
  // =======================================

  it("converts supported rupee amounts into paise", () => {
    expect(rupeesToPaise(500)).toBe(50000);
    expect(rupeesToPaise(500.25)).toBe(50025);
    expect(rupeesToPaise(100.05)).toBe(10005);
    expect(rupeesToPaise(0.01)).toBe(1);
    expect(rupeesToPaise(999.99)).toBe(99999);
  });

  // =======================================
  // TEST 4 — UNSUPPORTED PRECISION
  // =======================================

  it("rejects amounts with more than two decimal places", () => {
    expect(() => rupeesToPaise(10.001)).toThrow(
      "Amount cannot be represented exactly in paise.",
    );

    expect(() => rupeesToPaise(0.001)).toThrow();
  });

  // =======================================
  // TEST 5 — INVALID FINANCIAL AMOUNTS
  // =======================================

  it("rejects zero, negative and non-finite amounts", () => {
    expect(() => rupeesToPaise(0)).toThrow();
    expect(() => rupeesToPaise(-500)).toThrow();
    expect(() => rupeesToPaise(NaN)).toThrow();
    expect(() => rupeesToPaise(Infinity)).toThrow();
  });

  // =======================================
  // TEST 6 — DUPLICATE IDS
  // =======================================

  it("rejects duplicate transaction identifiers", async () => {
    mockStoredRecords([expense, { ...expense }], [income]);

    await expect(runMigrationPreflight()).rejects.toThrow(
      "duplicate record ID",
    );
  });

  // =======================================
  // TEST 7 — INVALID EXPENSE
  // =======================================

  it("rejects an expense with an invalid category", async () => {
    mockStoredRecords([{ ...expense, categoryId: "" }], [income]);

    await expect(runMigrationPreflight()).rejects.toThrow(
      "Expenses: invalid record",
    );
  });

  // =======================================
  // TEST 8 — INVALID INCOME
  // =======================================

  it("rejects an income with an invalid amount", async () => {
    mockStoredRecords([expense], [{ ...income, amount: -100 }]);

    await expect(runMigrationPreflight()).rejects.toThrow(
      "Incomes: invalid record",
    );
  });

  // =======================================
  // TEST 9 — LEGACY INCOME COMPATIBILITY
  // =======================================

  it("accepts older incomes without payment-method fields", async () => {
    const legacyIncome = {
      id: income.id,
      amount: income.amount,
      categoryId: income.categoryId,
      incomeName: income.incomeName,
      transactionDate: income.transactionDate,
      notes: income.notes,
      createdAt: income.createdAt,
    };

    mockStoredRecords([expense], [legacyIncome]);

    const result = await runMigrationPreflight();

    expect(result.ready).toBe(true);
    expect(result.incomeCount).toBe(1);
  });

  // =======================================
  // TEST 10 — CORRUPTED JSON
  // =======================================

  it("rejects malformed stored JSON", async () => {
    jest
      .mocked(AsyncStorage.getItem)
      .mockImplementation(async (key: string) => {
        if (key === EXPENSE_KEY) {
          return "{invalid-json";
        }

        if (key === INCOME_KEY) {
          return JSON.stringify([income]);
        }

        return null;
      });

    await expect(runMigrationPreflight()).rejects.toThrow(
      "Expenses: saved JSON could not be parsed.",
    );
  });

  // =======================================
  // TEST 11 — INVALID COLLECTION STRUCTURE
  // =======================================

  it("rejects stored data that is not an array", async () => {
    mockStoredRecords({ records: [expense] }, [income]);

    await expect(runMigrationPreflight()).rejects.toThrow(
      "Expenses: expected an array of records.",
    );
  });

  // =======================================
  // TEST 12 — EXCESSIVE AMOUNT
  // =======================================

  it("rejects amounts outside the safe integer range", () => {
    expect(() => rupeesToPaise(Number.MAX_SAFE_INTEGER)).toThrow();

    expect(() => rupeesToPaise(100000000000000)).toThrow();
  });
});
