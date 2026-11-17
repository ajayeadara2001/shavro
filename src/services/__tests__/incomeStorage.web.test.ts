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

import type { Income, CreateIncomeInput } from "../../types/income";

// =========================================
// TEST STORAGE
// =========================================

const STORAGE_KEY = "shavro_income_v1";

const mockStore = new Map<string, string>();

// Jest/Babel mock factory compatibility.
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

import { saveIncome, updateIncome, deleteIncome } from "../incomeStorage.web";

// =========================================
// TEST DATA
// =========================================

const TEST_DATE = "2026-11-17T06:00:00.000Z";

const INPUT: CreateIncomeInput = {
  amount: 5000,
  categoryId: "salary",
  incomeName: null,
  paymentMethodId: "upi",
  otherMethodName: null,
  transactionDate: "2026-11-17",
  notes: "Web income test",
};

function makeIncome(): Income {
  return {
    ...INPUT,
    id: "income-test-1",
    createdAt: TEST_DATE,
  };
}

function readStoredIncomes(): Income[] {
  return JSON.parse(mockStore.get(STORAGE_KEY) ?? "[]") as Income[];
}

// =========================================
// WEB INCOME TEST SUITE
// =========================================

describe("Shavro web income storage safety", () => {
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

  test("saves income inside the financial write guard", async () => {
    const saved = await saveIncome(INPUT);

    expect(saved.amount).toBe(5000);
    expect(saved.id).toBeTruthy();

    expect(mockFinancialGuardCalls).toBe(1);

    expect(readStoredIncomes()).toEqual([saved]);
  });

  // =======================================
  // TEST 2 — UPDATE
  // =======================================

  test("updates income while preserving its ID and creation date", async () => {
    const original = makeIncome();

    mockStore.set(STORAGE_KEY, JSON.stringify([original]));

    const updated = await updateIncome(original.id, {
      ...INPUT,
      amount: 9000,
      notes: "Updated income",
    });

    expect(mockFinancialGuardCalls).toBe(1);

    expect(updated.amount).toBe(9000);
    expect(updated.id).toBe(original.id);

    expect(updated.createdAt).toBe(original.createdAt);

    expect(readStoredIncomes()).toEqual([updated]);
  });

  // =======================================
  // TEST 3 — DELETE
  // =======================================

  test("deletes income inside the financial write guard", async () => {
    const original = makeIncome();

    mockStore.set(STORAGE_KEY, JSON.stringify([original]));

    await deleteIncome(original.id);

    expect(mockFinancialGuardCalls).toBe(1);

    expect(readStoredIncomes()).toEqual([]);
  });

  // =======================================
  // TEST 4 — BLOCKED SAVE
  // =======================================

  test("blocks income creation during unresolved restoration", async () => {
    mockBlockFinancialWrites = true;

    await expect(saveIncome(INPUT)).rejects.toThrow(
      /unresolved backup restoration/i,
    );

    expect(mockFinancialGuardCalls).toBe(1);

    expect(mockLocalStorage.setItem).not.toHaveBeenCalled();

    expect(mockStore.has(STORAGE_KEY)).toBe(false);
  });

  // =======================================
  // TEST 5 — BLOCKED UPDATE
  // =======================================

  test("preserves income when an update is blocked", async () => {
    const original = makeIncome();

    const stored = JSON.stringify([original]);

    mockStore.set(STORAGE_KEY, stored);

    mockBlockFinancialWrites = true;

    await expect(
      updateIncome(original.id, {
        ...INPUT,
        amount: 20000,
      }),
    ).rejects.toThrow(/unresolved backup restoration/i);

    expect(mockFinancialGuardCalls).toBe(1);

    expect(mockStore.get(STORAGE_KEY)).toBe(stored);

    expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
  });

  // =======================================
  // TEST 6 — BLOCKED DELETE
  // =======================================

  test("preserves income when deletion is blocked", async () => {
    const original = makeIncome();

    const stored = JSON.stringify([original]);

    mockStore.set(STORAGE_KEY, stored);

    mockBlockFinancialWrites = true;

    await expect(deleteIncome(original.id)).rejects.toThrow(
      /unresolved backup restoration/i,
    );

    expect(mockFinancialGuardCalls).toBe(1);

    expect(mockStore.get(STORAGE_KEY)).toBe(stored);

    expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
  });

  // =======================================
  // TEST 7 — LEGACY INCOME
  // =======================================

  test("preserves income records created before payment methods were introduced", async () => {
    const legacyIncome: Income = {
      id: "legacy-income",
      amount: 2000,
      categoryId: "other",
      incomeName: null,
      transactionDate: "2026-11-01",
      notes: "Older income",
      createdAt: TEST_DATE,
    };

    mockStore.set(STORAGE_KEY, JSON.stringify([legacyIncome]));

    const saved = await saveIncome(INPUT);

    const stored = readStoredIncomes();

    expect(mockFinancialGuardCalls).toBe(1);

    expect(stored).toHaveLength(2);

    expect(stored[0]).toEqual(saved);
    expect(stored[1]).toEqual(legacyIncome);
  });

  // =======================================
  // TEST 8 — CUSTOM PAYMENT METHOD
  // =======================================

  test("preserves custom payment method identifiers", async () => {
    const saved = await saveIncome({
      ...INPUT,
      paymentMethodId: "custom-payment-123",
    });

    expect(saved.paymentMethodId).toBe("custom-payment-123");

    expect(saved.otherMethodName).toBeNull();

    expect(readStoredIncomes()).toEqual([saved]);
  });

  // =======================================
  // TEST 9 — CORRUPTED DATA
  // =======================================

  test("rejects corrupted income storage without replacing it", async () => {
    mockStore.set(STORAGE_KEY, "{invalid-json");

    await expect(saveIncome(INPUT)).rejects.toThrow(
      /unable to load saved incomes/i,
    );

    expect(mockFinancialGuardCalls).toBe(1);

    expect(mockStore.get(STORAGE_KEY)).toBe("{invalid-json");

    expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
  });
});
