import { beforeEach, describe, expect, jest, test } from "@jest/globals";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getShavroStorageMode } from "../../database/sqliteStorageMode.native";

import type {
  CategoryV4Row,
  PaymentMethodV4Row,
} from "../../database/sqliteFinancialCodec.native";

import {
  readCustomOptionsValue,
  writeCustomOptionsValue,
} from "../customOptionsStorageBackend.native";

// =========================================
// MOCKS
// =========================================

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

jest.mock("../../database/sqliteStorageMode.native", () => ({
  getShavroStorageMode: jest.fn(async () => "sqlite"),
}));

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(),
}));

jest.mock("../../database/shavroDatabase.native", () => ({
  getShavroDatabase: jest.fn(async () => mockDatabase),
}));

// =========================================
// TEST FIXTURES
// =========================================

const CATEGORY_KEY = "shavro_custom_categories_v1";
const PAYMENT_KEY = "shavro_custom_payment_methods_v1";

const categories = [
  {
    id: "category_a",
    name: "Travel",
    scope: "EXPENSE" as const,
    archived: false,
  },
  {
    id: "category_b",
    name: "Side gig",
    scope: "INCOME" as const,
    archived: true,
  },
  {
    id: "category_c",
    name: "Other",
    scope: "EXPENSE" as const,
  },
];

const methods = [
  { id: "payment_a", name: "Gift Card", archived: false },
  { id: "payment_b", name: "Wallet", archived: true },
  { id: "payment_c", name: "Voucher" },
];

let categoryRows: CategoryV4Row[] = [];
let methodRows: PaymentMethodV4Row[] = [];

let failInsert = false;
let corruptReadback = false;

// =========================================
// IN-MEMORY TRANSACTION HELPERS
// =========================================

function copyCategories(rows: CategoryV4Row[]): CategoryV4Row[] {
  return rows.map((row) => ({ ...row }));
}

function copyMethods(rows: PaymentMethodV4Row[]): PaymentMethodV4Row[] {
  return rows.map((row) => ({ ...row }));
}

function readRows(
  sql: string,
  cats: CategoryV4Row[],
  pays: PaymentMethodV4Row[],
) {
  if (sql.includes("FROM custom_categories")) {
    return copyCategories(cats).sort((a, b) => a.position - b.position);
  }

  if (sql.includes("FROM custom_payment_methods")) {
    return copyMethods(pays).sort((a, b) => a.position - b.position);
  }

  throw new Error(`Unexpected SELECT: ${sql}`);
}

// =========================================
// MOCK SQLITE DATABASE
// =========================================

const mockDatabase = {
  getAllAsync: jest.fn(async (sql: string) =>
    readRows(sql, categoryRows, methodRows),
  ),

  withExclusiveTransactionAsync: jest.fn(
    async (
      operation: (tx: {
        runAsync: (sql: string, args?: unknown[]) => Promise<void>;

        getAllAsync: (sql: string) => Promise<unknown[]>;
      }) => Promise<void>,
    ) => {
      let draftCategories = copyCategories(categoryRows);
      let draftMethods = copyMethods(methodRows);

      await operation({
        runAsync: async (sql: string, args: unknown[] = []) => {
          if (sql.startsWith("DELETE FROM custom_categories")) {
            draftCategories = [];
          } else if (sql.startsWith("DELETE FROM custom_payment_methods")) {
            draftMethods = [];
          } else if (sql.includes("INSERT INTO custom_categories")) {
            if (failInsert) {
              failInsert = false;
              throw new Error("Simulated category insert failure");
            }

            const [id, name, scope, archived, position] = args;

            draftCategories.push({
              id: String(id),
              name: String(name),
              scope: String(scope),
              archived: archived as number | null,
              position: Number(position),
            });
          } else if (sql.includes("INSERT INTO custom_payment_methods")) {
            if (failInsert) {
              failInsert = false;
              throw new Error("Simulated payment-method insert failure");
            }

            const [id, name, archived, position] = args;

            draftMethods.push({
              id: String(id),
              name: String(name),
              archived: archived as number | null,
              position: Number(position),
            });
          } else {
            throw new Error(`Unexpected SQL: ${sql}`);
          }
        },

        getAllAsync: async (sql: string) => {
          const rows = readRows(sql, draftCategories, draftMethods);

          if (corruptReadback && rows.length > 0) {
            return rows.map((row, index) =>
              index === 0 ? { ...row, name: "Corrupted" } : row,
            );
          }

          return rows;
        },
      });

      // Commit only after transaction and verification succeed.
      categoryRows = draftCategories;
      methodRows = draftMethods;
    },
  ),
};

// =========================================
// SETUP
// =========================================

beforeEach(() => {
  categoryRows = [];
  methodRows = [];

  failInsert = false;
  corruptReadback = false;

  jest.clearAllMocks();

  jest.mocked(getShavroStorageMode).mockResolvedValue("sqlite");
});

// =========================================
// INTEGRATION TESTS
// =========================================

describe("native SQLite custom-options backend", () => {
  test("preserves category order, scope, archived and absent archived values", async () => {
    await writeCustomOptionsValue(CATEGORY_KEY, JSON.stringify(categories));

    expect(categoryRows.map((row) => row.position)).toEqual([0, 1, 2]);

    expect(categoryRows.map((row) => row.archived)).toEqual([0, 1, null]);

    expect(JSON.parse((await readCustomOptionsValue(CATEGORY_KEY))!)).toEqual(
      categories,
    );

    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  test("preserves payment method order and archived state", async () => {
    await writeCustomOptionsValue(PAYMENT_KEY, JSON.stringify(methods));

    expect(methodRows.map((row) => row.position)).toEqual([0, 1, 2]);

    expect(methodRows.map((row) => row.archived)).toEqual([0, 1, null]);

    expect(JSON.parse((await readCustomOptionsValue(PAYMENT_KEY))!)).toEqual(
      methods,
    );

    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  test("updating categories never changes payment methods", async () => {
    await writeCustomOptionsValue(PAYMENT_KEY, JSON.stringify(methods));

    const original = copyMethods(methodRows);

    await writeCustomOptionsValue(CATEGORY_KEY, JSON.stringify(categories));

    expect(methodRows).toEqual(original);
  });

  test("updating payment methods never changes categories", async () => {
    await writeCustomOptionsValue(CATEGORY_KEY, JSON.stringify(categories));

    const original = copyCategories(categoryRows);

    await writeCustomOptionsValue(PAYMENT_KEY, JSON.stringify(methods));

    expect(categoryRows).toEqual(original);
  });

  test("failed category insertion rolls back existing categories", async () => {
    await writeCustomOptionsValue(CATEGORY_KEY, JSON.stringify(categories));

    const before = copyCategories(categoryRows);
    failInsert = true;

    await expect(
      writeCustomOptionsValue(
        CATEGORY_KEY,
        JSON.stringify(categories.slice(0, 1)),
      ),
    ).rejects.toThrow("Simulated category insert failure");

    expect(categoryRows).toEqual(before);
  });

  test("failed payment-method insertion rolls back existing methods", async () => {
    await writeCustomOptionsValue(PAYMENT_KEY, JSON.stringify(methods));

    const before = copyMethods(methodRows);
    failInsert = true;

    await expect(
      writeCustomOptionsValue(PAYMENT_KEY, JSON.stringify(methods.slice(0, 1))),
    ).rejects.toThrow("Simulated payment-method insert failure");

    expect(methodRows).toEqual(before);
  });

  test("readback mismatch prevents a category commit", async () => {
    await writeCustomOptionsValue(CATEGORY_KEY, JSON.stringify(categories));

    const before = copyCategories(categoryRows);
    corruptReadback = true;

    await expect(
      writeCustomOptionsValue(
        CATEGORY_KEY,
        JSON.stringify(categories.slice(0, 1)),
      ),
    ).rejects.toThrow("SQLite custom-option mismatch");

    expect(categoryRows).toEqual(before);
  });

  test("readback mismatch prevents a payment-method commit", async () => {
    await writeCustomOptionsValue(PAYMENT_KEY, JSON.stringify(methods));

    const before = copyMethods(methodRows);
    corruptReadback = true;

    await expect(
      writeCustomOptionsValue(PAYMENT_KEY, JSON.stringify(methods.slice(0, 1))),
    ).rejects.toThrow("SQLite custom-option mismatch");

    expect(methodRows).toEqual(before);
  });

  test("AsyncStorage mode writes only to AsyncStorage", async () => {
    jest.mocked(getShavroStorageMode).mockResolvedValue("async-storage");

    const value = JSON.stringify(categories);

    await writeCustomOptionsValue(CATEGORY_KEY, value);

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(CATEGORY_KEY, value);

    expect(mockDatabase.withExclusiveTransactionAsync).not.toHaveBeenCalled();
  });

  test("invalid keys and non-array JSON never mutate storage", async () => {
    await expect(writeCustomOptionsValue("invalid", "[]")).rejects.toThrow(
      "Unknown custom-options storage key",
    );

    await expect(writeCustomOptionsValue(CATEGORY_KEY, "{}")).rejects.toThrow(
      "Invalid custom-options data",
    );

    expect(mockDatabase.withExclusiveTransactionAsync).not.toHaveBeenCalled();

    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});
