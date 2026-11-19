import { beforeEach, describe, expect, jest, test } from "@jest/globals";

import type { IncomeV4Row } from "../../database/sqliteFinancialCodec.native";
import type { CreateIncomeInput } from "../../types/income";

// =========================================
// STORAGE PROVIDER MOCKS
// =========================================

jest.mock("../../database/sqliteStorageMode.native", () => ({
  getShavroStorageMode: jest.fn(async () => "sqlite"),
}));

jest.mock("../storageOperationGuard", () => ({
  runFinancialWrite: async <T>(action: () => Promise<T>): Promise<T> =>
    action(),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

jest.mock("../../database/shavroDatabase.native", () => ({
  getShavroDatabase: jest.fn(async () => mockDatabase),
}));

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  getIncomes,
  saveIncome,
  updateIncome,
  deleteIncome,
} from "../incomeStorage.native";

// =========================================
// SQLITE ROW STATE
// =========================================

const columns = [
  "id",
  "amount_paise",
  "category_id",
  "income_name",
  "payment_method_id",
  "other_method_name",
  "transaction_date",
  "notes",
  "created_at",
  "position",
  "has_payment_method_id",
  "has_other_method_name",
] as const;

let committedRows: IncomeV4Row[] = [];

let failNextInsert = false;

function clone(rows: IncomeV4Row[]): IncomeV4Row[] {
  return rows.map((row) => ({ ...row }));
}

// =========================================
// TRANSACTIONAL SQLITE MOCK
// =========================================

/**
 * Simulates an exclusive SQLite transaction.
 *
 * Uses a draft collection.
 *
 * If the transaction throws, the original
 * committed rows remain unchanged.
 */
const mockDatabase = {
  getAllAsync: jest.fn(
    async (): Promise<IncomeV4Row[]> => clone(committedRows),
  ),

  withExclusiveTransactionAsync: jest.fn(
    async (
      callback: (tx: {
        runAsync: (sql: string, args?: unknown[]) => Promise<void>;

        getAllAsync: () => Promise<IncomeV4Row[]>;
      }) => Promise<void>,
    ): Promise<void> => {
      let draft = clone(committedRows);

      await callback({
        runAsync: async (sql, args = []) => {
          if (sql.startsWith("DELETE FROM incomes")) {
            draft = [];
          } else if (sql.includes("INSERT INTO incomes")) {
            if (failNextInsert) {
              failNextInsert = false;

              throw new Error("Simulated SQLite insertion failure");
            }

            draft.push(
              Object.fromEntries(
                columns.map((name, i) => [name, args[i]]),
              ) as unknown as IncomeV4Row,
            );
          } else {
            throw new Error(`Unexpected SQL: ${sql}`);
          }
        },

        getAllAsync: async () =>
          clone(draft).sort((a, b) => a.position - b.position),
      });

      // Commit only after successful completion.
      committedRows = draft;
    },
  ),
};

// =========================================
// TEST INPUT
// =========================================

const input: CreateIncomeInput = {
  amount: 900.55,
  categoryId: "salary",
  incomeName: null,
  paymentMethodId: "bank",
  otherMethodName: null,
  transactionDate: "2026-11-19",
  notes: "Salary",
};

// =========================================
// TEST SETUP
// =========================================

beforeEach(() => {
  committedRows = [];
  failNextInsert = false;

  jest.clearAllMocks();
});

// =========================================
// SQLITE INCOME INTEGRATION TESTS
// =========================================

describe("native SQLite income CRUD integration", () => {
  test("persists precise paise and newest-first ordering without AsyncStorage writes", async () => {
    const first = await saveIncome(input);

    const second = await saveIncome({
      ...input,
      amount: 0.01,
      notes: "Other",
    });

    expect((await getIncomes()).map((item) => item.id)).toEqual([
      second.id,
      first.id,
    ]);

    expect(committedRows.map((row) => row.amount_paise)).toEqual([1, 90055]);

    expect(committedRows.map((row) => row.position)).toEqual([0, 1]);

    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  test("updates income without changing ID, creation time, or Received Via", async () => {
    const saved = await saveIncome(input);

    const updated = await updateIncome(saved.id, {
      amount: 1750.25,
      categoryId: saved.categoryId,
      incomeName: "Updated",
      transactionDate: saved.transactionDate,
      notes: "Edited",

      // Omitting paymentMethodId preserves
      // the previously selected method.
    });

    expect(updated.id).toBe(saved.id);

    expect(updated.createdAt).toBe(saved.createdAt);

    expect(updated.paymentMethodId).toBe("bank");

    expect(committedRows[0].amount_paise).toBe(175025);
  });

  test("deletes income and compacts its ordering", async () => {
    const first = await saveIncome(input);

    const second = await saveIncome({
      ...input,
      notes: "Second",
    });

    await deleteIncome(second.id);

    expect((await getIncomes()).map((item) => item.id)).toEqual([first.id]);

    expect(committedRows.map((row) => row.position)).toEqual([0]);
  });

  test("rolls back failed SQLite insert without writing to AsyncStorage", async () => {
    await saveIncome(input);

    const before = clone(committedRows);

    failNextInsert = true;

    await expect(
      saveIncome({
        ...input,
        notes: "Must fail",
      }),
    ).rejects.toThrow("Unable to save income");

    expect(committedRows).toEqual(before);

    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  test("rejects unknown income deletion without modifying persisted rows", async () => {
    await saveIncome(input);

    const before = clone(committedRows);

    await expect(deleteIncome("missing")).rejects.toThrow("Income not found");

    expect(committedRows).toEqual(before);
  });
});
