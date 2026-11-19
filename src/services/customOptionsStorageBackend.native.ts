import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  CustomCategory,
  CustomPaymentMethod,
} from "./customOptionsStorage";

import { getShavroStorageMode } from "../database/sqliteStorageMode.native";
import { getShavroDatabase } from "../database/shavroDatabase.native";

import {
  encodeCategories,
  decodeCategories,
  encodePaymentMethods,
  decodePaymentMethods,
  type CategoryV4Row,
  type PaymentMethodV4Row,
} from "../database/sqliteFinancialCodec.native";

// =========================================
// STORAGE KEYS
// =========================================

const CATEGORY_KEY = "shavro_custom_categories_v1";
const PAYMENT_METHOD_KEY = "shavro_custom_payment_methods_v1";

type OptionKey = typeof CATEGORY_KEY | typeof PAYMENT_METHOD_KEY;

// =========================================
// STORAGE KEY VALIDATION
// =========================================

function assertOptionKey(key: string): asserts key is OptionKey {
  if (key !== CATEGORY_KEY && key !== PAYMENT_METHOD_KEY) {
    throw new Error("Unknown custom-options storage key.");
  }
}

// =========================================
// NATIVE STORAGE READ
// =========================================

/**
 * Read custom categories or payment methods
 * from the selected storage provider.
 *
 * AsyncStorage remains the default provider.
 */
export async function readCustomOptionsValue(
  key: string,
): Promise<string | null> {
  assertOptionKey(key);

  const mode = await getShavroStorageMode();

  if (mode === "async-storage") {
    return AsyncStorage.getItem(key);
  }

  const db = await getShavroDatabase();

  if (key === CATEGORY_KEY) {
    const rows = await db.getAllAsync<CategoryV4Row>(
      `SELECT *
         FROM custom_categories
         ORDER BY position ASC`,
    );

    return JSON.stringify(decodeCategories(rows));
  }

  const rows = await db.getAllAsync<PaymentMethodV4Row>(
    `SELECT *
       FROM custom_payment_methods
       ORDER BY position ASC`,
  );

  return JSON.stringify(decodePaymentMethods(rows));
}

// =========================================
// SQLITE ROW VERIFICATION
// =========================================

/**
 * Verify every saved SQLite row:
 * - Record count
 * - Array ordering
 * - Record IDs
 * - All expected fields
 */
function assertStoredRowsMatch<T extends { id: string }>(
  saved: T[],
  expected: T[],
): void {
  if (saved.length !== expected.length) {
    throw new Error("SQLite custom-options count mismatch.");
  }

  for (let index = 0; index < expected.length; index += 1) {
    const actual = saved[index] as Record<string, unknown>;
    const wanted = expected[index] as Record<string, unknown>;

    for (const [field, value] of Object.entries(wanted)) {
      if (actual[field] !== value) {
        throw new Error(
          `SQLite custom-option mismatch: ` +
            `${expected[index].id}, ${field}.`,
        );
      }
    }
  }
}

// =========================================
// SQLITE CATEGORY WRITER
// =========================================

/**
 * Replace the custom-category collection
 * inside one exclusive SQLite transaction.
 *
 * If insertion or verification fails,
 * the transaction is rolled back.
 */
async function writeCategories(categories: CustomCategory[]): Promise<void> {
  const encoded = encodeCategories(categories);
  const db = await getShavroDatabase();

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync("DELETE FROM custom_categories");

    for (const row of encoded) {
      await tx.runAsync(
        `INSERT INTO custom_categories (
            id,
            name,
            scope,
            archived,
            position
          ) VALUES (?, ?, ?, ?, ?)`,
        [row.id, row.name, row.scope, row.archived, row.position],
      );
    }

    const saved = await tx.getAllAsync<CategoryV4Row>(
      `SELECT *
         FROM custom_categories
         ORDER BY position ASC`,
    );

    assertStoredRowsMatch(saved, encoded);
  });
}

// =========================================
// SQLITE PAYMENT METHOD WRITER
// =========================================

/**
 * Replace custom payment methods
 * in an exclusive SQLite transaction.
 *
 * Preserve ordering and archived flags.
 */
async function writePaymentMethods(
  methods: CustomPaymentMethod[],
): Promise<void> {
  const encoded = encodePaymentMethods(methods);
  const db = await getShavroDatabase();

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync("DELETE FROM custom_payment_methods");

    for (const row of encoded) {
      await tx.runAsync(
        `INSERT INTO custom_payment_methods (
            id,
            name,
            archived,
            position
          ) VALUES (?, ?, ?, ?)`,
        [row.id, row.name, row.archived, row.position],
      );
    }

    const saved = await tx.getAllAsync<PaymentMethodV4Row>(
      `SELECT *
         FROM custom_payment_methods
         ORDER BY position ASC`,
    );

    assertStoredRowsMatch(saved, encoded);
  });
}

// =========================================
// NATIVE STORAGE WRITE
// =========================================

/**
 * Called by existing custom-option mutations
 * under runFinancialWrite().
 *
 * Uses only the selected authoritative provider.
 *
 * AsyncStorage remains active until an
 * explicitly verified SQLite cutover.
 */
export async function writeCustomOptionsValue(
  key: string,
  value: string,
): Promise<void> {
  assertOptionKey(key);

  const mode = await getShavroStorageMode();

  if (mode === "async-storage") {
    await AsyncStorage.setItem(key, value);
    return;
  }

  const parsed: unknown = JSON.parse(value);

  if (!Array.isArray(parsed)) {
    throw new Error("Invalid custom-options data.");
  }

  if (key === CATEGORY_KEY) {
    await writeCategories(parsed as CustomCategory[]);
    return;
  }

  await writePaymentMethods(parsed as CustomPaymentMethod[]);
}
