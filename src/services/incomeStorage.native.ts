import AsyncStorage from "@react-native-async-storage/async-storage";
import { getShavroDatabase } from "../database/shavroDatabase.native";
import type {
  Income,
  CreateIncomeInput,
  UpdateIncomeInput,
} from "../types/income";

import { runFinancialWrite } from "./storageOperationGuard";

import { getShavroStorageMode } from "../database/sqliteStorageMode.native";

import {
  encodeIncomes,
  decodeIncomes,
  type IncomeV4Row,
} from "../database/sqliteFinancialCodec.native";

const STORAGE_KEY = "shavro_income_v1";

// =========================================
// INCOME VALIDATION
// =========================================

/**
 * Validate income records.
 *
 * Older income records may not contain
 * paymentMethodId or otherMethodName.
 */
function isIncome(value: unknown): value is Income {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const item = value as Record<string, unknown>;

  const validPaymentMethod =
    item.paymentMethodId === undefined ||
    item.paymentMethodId === null ||
    (typeof item.paymentMethodId === "string" &&
      item.paymentMethodId.trim().length > 0);

  const validOtherMethodName =
    item.otherMethodName === undefined ||
    item.otherMethodName === null ||
    typeof item.otherMethodName === "string";

  return (
    typeof item.id === "string" &&
    item.id.trim().length > 0 &&
    typeof item.amount === "number" &&
    Number.isFinite(item.amount) &&
    item.amount > 0 &&
    typeof item.categoryId === "string" &&
    item.categoryId.trim().length > 0 &&
    (item.incomeName === null || typeof item.incomeName === "string") &&
    validPaymentMethod &&
    validOtherMethodName &&
    typeof item.transactionDate === "string" &&
    typeof item.notes === "string" &&
    typeof item.createdAt === "string"
  );
}

/**
 * Allow a missing payment method for
 * compatibility with older income records.
 */
function validatePaymentMethod(input: CreateIncomeInput): void {
  const methodId = input.paymentMethodId;

  if (methodId === undefined || methodId === null) {
    return;
  }

  if (typeof methodId !== "string" || !methodId.trim()) {
    throw new Error("Invalid payment method.");
  }

  if (methodId === "other" && !input.otherMethodName?.trim()) {
    throw new Error("Enter a name for the payment method.");
  }
}

/**
 * Normalize income values without
 * modifying custom payment method IDs.
 */
function normalizeIncomeInput(input: CreateIncomeInput): CreateIncomeInput {
  validatePaymentMethod(input);

  return {
    ...input,

    incomeName: input.incomeName?.trim() || null,

    paymentMethodId: input.paymentMethodId ?? null,

    otherMethodName:
      input.paymentMethodId === "other"
        ? input.otherMethodName?.trim() || null
        : null,

    notes: input.notes.trim(),
  };
}

function generateId(): string {
  return (
    `${Date.now()}-` +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  );
}

// =========================================
// ASYNCSTORAGE READER
// =========================================

async function readAsyncStorageIncomes(): Promise<Income[]> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);

  if (stored === null) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);

  if (!Array.isArray(parsed) || !parsed.every(isIncome)) {
    throw new Error("Stored income data is invalid.");
  }

  return parsed;
}

// =========================================
// SQLITE READER
// =========================================

async function readSQLiteIncomes(): Promise<Income[]> {
  const db = await getShavroDatabase();

  const rows = await db.getAllAsync<IncomeV4Row>(
    `SELECT *
       FROM incomes
       ORDER BY position ASC`,
  );

  const incomes = decodeIncomes(rows);

  if (!incomes.every(isIncome)) {
    throw new Error("SQLite income data is invalid.");
  }

  return incomes;
}

// =========================================
// STORAGE PROVIDER READER
// =========================================

async function readIncomeStorage(): Promise<Income[]> {
  const mode = await getShavroStorageMode();

  if (mode === "async-storage") {
    return readAsyncStorageIncomes();
  }

  return readSQLiteIncomes();
}

// =========================================
// SQLITE WRITER
// =========================================

/**
 * Replace the complete income collection
 * inside one exclusive SQLite transaction.
 *
 * SQL rollback protects the existing rows
 * if any insert or verification fails.
 *
 * This is called from runFinancialWrite().
 */
async function writeSQLiteIncomes(incomes: Income[]): Promise<void> {
  if (!incomes.every(isIncome)) {
    throw new Error("Invalid income data for SQLite.");
  }

  const encoded = encodeIncomes(incomes);
  const db = await getShavroDatabase();

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync("DELETE FROM incomes");

    for (const row of encoded) {
      await tx.runAsync(
        `INSERT INTO incomes (
            id,
            amount_paise,
            category_id,
            income_name,
            payment_method_id,
            other_method_name,
            transaction_date,
            notes,
            created_at,
            position,
            has_payment_method_id,
            has_other_method_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.amount_paise,
          row.category_id,
          row.income_name,
          row.payment_method_id,
          row.other_method_name,
          row.transaction_date,
          row.notes,
          row.created_at,
          row.position,
          row.has_payment_method_id,
          row.has_other_method_name,
        ],
      );
    }

    // Verify the full stored collection
    // before committing.
    const saved = await tx.getAllAsync<IncomeV4Row>(
      `SELECT *
           FROM incomes
           ORDER BY position ASC`,
    );

    if (saved.length !== encoded.length) {
      throw new Error("SQLite income count verification failed.");
    }

    for (let index = 0; index < encoded.length; index += 1) {
      const expected = encoded[index];
      const actual = saved[index];

      for (const key of Object.keys(expected)) {
        const field = key as keyof IncomeV4Row;

        if (actual[field] !== expected[field]) {
          throw new Error(
            `SQLite income verification failed ` +
              `for ${expected.id}, field ${key}.`,
          );
        }
      }
    }

    // The codec must reproduce the
    // original ordering and optional
    // income-field presence.
    const reconstructed = decodeIncomes(saved);

    if (
      JSON.stringify(
        reconstructed.map((item) => Object.entries(item).sort()),
      ) !== JSON.stringify(incomes.map((item) => Object.entries(item).sort()))
    ) {
      throw new Error("SQLite income round-trip verification failed.");
    }
  });
}

// =========================================
// STORAGE PROVIDER WRITER
// =========================================

/**
 * Must be called while holding
 * runFinancialWrite().
 *
 * The storage-mode decision is made
 * within the existing write reservation.
 *
 * Future SQLite activation must also
 * acquire the same exclusive lock.
 */
async function writeIncomeStorage(incomes: Income[]): Promise<void> {
  const mode = await getShavroStorageMode();

  if (mode === "async-storage") {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(incomes));

    return;
  }

  await writeSQLiteIncomes(incomes);
}

// =========================================
// PUBLIC READ OPERATION
// =========================================

/**
 * Read income records without acquiring
 * a second financial write lock.
 */
export async function getIncomes(): Promise<Income[]> {
  try {
    return await readIncomeStorage();
  } catch (error) {
    console.error("Failed to read incomes:", error);

    throw new Error("Unable to load saved incomes.");
  }
}

// =========================================
// SAVE INCOME
// =========================================

/**
 * Save income using the shared,
 * serialized write queue.
 */
export async function saveIncome(input: CreateIncomeInput): Promise<Income> {
  return runFinancialWrite(async () => {
    const incomes = await getIncomes();

    const normalizedInput = normalizeIncomeInput(input);

    const income: Income = {
      ...normalizedInput,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };

    if (!isIncome(income)) {
      throw new Error("Invalid income data.");
    }

    try {
      await writeIncomeStorage([income, ...incomes]);

      return income;
    } catch (error) {
      console.error("Failed to save income:", error);

      throw new Error("Unable to save income.");
    }
  });
}

// =========================================
// UPDATE INCOME
// =========================================

/**
 * Update income without changing its
 * original ID or creation timestamp.
 */
export async function updateIncome(
  id: string,
  changes: UpdateIncomeInput,
): Promise<Income> {
  return runFinancialWrite(async () => {
    const incomes = await getIncomes();

    const index = incomes.findIndex((income) => income.id === id);

    if (index === -1) {
      throw new Error("Income not found.");
    }

    const existingIncome = incomes[index];

    /**
     * Preserve existing Received Via
     * information if the edit does not
     * explicitly replace it.
     */
    const effectiveChanges: CreateIncomeInput = {
      ...changes,

      paymentMethodId:
        changes.paymentMethodId === undefined
          ? existingIncome.paymentMethodId
          : changes.paymentMethodId,

      otherMethodName:
        changes.otherMethodName === undefined
          ? existingIncome.otherMethodName
          : changes.otherMethodName,
    };

    const normalizedChanges = normalizeIncomeInput(effectiveChanges);

    const updatedIncome: Income = {
      ...existingIncome,
      ...normalizedChanges,

      id: existingIncome.id,
      createdAt: existingIncome.createdAt,
    };

    if (!isIncome(updatedIncome)) {
      throw new Error("Invalid income data.");
    }

    const updatedIncomes = [...incomes];

    updatedIncomes[index] = updatedIncome;

    try {
      await writeIncomeStorage(updatedIncomes);

      return updatedIncome;
    } catch (error) {
      console.error("Failed to update income:", error);

      throw new Error("Unable to update income.");
    }
  });
}

// =========================================
// DELETE INCOME
// =========================================

/**
 * Delete income using the financial
 * write coordinator.
 */
export async function deleteIncome(id: string): Promise<void> {
  return runFinancialWrite(async () => {
    const incomes = await getIncomes();

    if (!incomes.some((income) => income.id === id)) {
      throw new Error("Income not found.");
    }

    const remaining = incomes.filter((income) => income.id !== id);

    try {
      await writeIncomeStorage(remaining);
    } catch (error) {
      console.error("Failed to delete income:", error);

      throw new Error("Unable to delete income.");
    }
  });
}
