import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  Expense,
  CreateExpenseInput,
  UpdateExpenseInput,
} from "../types/expense";

import { runFinancialWrite } from "./storageOperationGuard";

import { getShavroStorageMode } from "../database/sqliteStorageMode.native";

import {
  encodeExpenses,
  decodeExpenses,
  type ExpenseV4Row,
} from "../database/sqliteFinancialCodec.native";

const STORAGE_KEY = "shavro_expenses_v1";

// =========================================
// EXPENSE VALIDATION
// =========================================

function isExpense(value: unknown): value is Expense {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const item = value as Record<string, unknown>;

  return (
    typeof item.id === "string" &&
    typeof item.amount === "number" &&
    Number.isFinite(item.amount) &&
    item.amount > 0 &&
    typeof item.categoryId === "string" &&
    (item.expenseName === null || typeof item.expenseName === "string") &&
    typeof item.paymentMethodId === "string" &&
    (item.otherMethodName === null ||
      typeof item.otherMethodName === "string") &&
    typeof item.transactionDate === "string" &&
    typeof item.notes === "string" &&
    typeof item.createdAt === "string"
  );
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

async function readAsyncStorageExpenses(): Promise<Expense[]> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);

  if (stored === null) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);

  if (!Array.isArray(parsed) || !parsed.every(isExpense)) {
    throw new Error("Stored expenses contain invalid data.");
  }

  return parsed;
}

// =========================================
// SQLITE READER
// =========================================

async function readSQLiteExpenses(): Promise<Expense[]> {
  const { getShavroDatabase } =
    await import("../database/shavroDatabase.native");
  const db = await getShavroDatabase();

  const rows = await db.getAllAsync<ExpenseV4Row>(
    `SELECT *
       FROM expenses
       ORDER BY position ASC`,
  );

  const expenses = decodeExpenses(rows);

  if (!expenses.every(isExpense)) {
    throw new Error("SQLite expense data is invalid.");
  }

  return expenses;
}

// =========================================
// ACTIVE STORAGE READER
// =========================================

async function readExpenseStorage(): Promise<Expense[]> {
  const mode = await getShavroStorageMode();

  if (mode === "async-storage") {
    return readAsyncStorageExpenses();
  }

  return readSQLiteExpenses();
}

// =========================================
// SQLITE WRITER
// =========================================

/**
 * Replace the expense collection using
 * a single exclusive SQLite transaction.
 *
 * If any insertion or verification
 * fails, the transaction rolls back.
 *
 * Called within runFinancialWrite().
 */
async function writeSQLiteExpenses(expenses: Expense[]): Promise<void> {
  if (!expenses.every(isExpense)) {
    throw new Error("Invalid expense data for SQLite.");
  }

  const encoded = encodeExpenses(expenses);
  const { getShavroDatabase } =
    await import("../database/shavroDatabase.native");
  const db = await getShavroDatabase();

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync("DELETE FROM expenses");

    for (const row of encoded) {
      await tx.runAsync(
        `INSERT INTO expenses (
            id,
            amount_paise,
            category_id,
            expense_name,
            payment_method_id,
            other_method_name,
            transaction_date,
            notes,
            created_at,
            position
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.amount_paise,
          row.category_id,
          row.expense_name,
          row.payment_method_id,
          row.other_method_name,
          row.transaction_date,
          row.notes,
          row.created_at,
          row.position,
        ],
      );
    }

    // Verify row count, ordering,
    // and every stored field.
    const saved = await tx.getAllAsync<ExpenseV4Row>(
      `SELECT *
           FROM expenses
           ORDER BY position ASC`,
    );

    if (saved.length !== encoded.length) {
      throw new Error("SQLite expense count verification failed.");
    }

    for (let index = 0; index < encoded.length; index += 1) {
      const expected = encoded[index];

      const actual = saved[index];

      for (const key of Object.keys(expected)) {
        const field = key as keyof ExpenseV4Row;

        if (actual[field] !== expected[field]) {
          throw new Error(
            `SQLite expense verification failed ` +
              `for ${expected.id}, field ${key}.`,
          );
        }
      }
    }

    // Verify the codec reconstructs
    // the original expense records.
    const reconstructed = decodeExpenses(saved);

    if (
      JSON.stringify(
        reconstructed.map((item) => Object.entries(item).sort()),
      ) !== JSON.stringify(expenses.map((item) => Object.entries(item).sort()))
    ) {
      throw new Error("SQLite expense round-trip verification failed.");
    }
  });
}

// =========================================
// ACTIVE STORAGE WRITER
// =========================================

/**
 * Must run inside runFinancialWrite().
 *
 * The eventual storage activation must
 * use the same exclusive lock, so
 * provider selection and writes cannot
 * overlap the cutover.
 */
async function writeExpenseStorage(expenses: Expense[]): Promise<void> {
  const mode = await getShavroStorageMode();

  if (mode === "async-storage") {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));

    return;
  }

  await writeSQLiteExpenses(expenses);
}

// =========================================
// READ EXPENSES
// =========================================

/**
 * Read expenses without modifying storage.
 *
 * This function is also called inside
 * runFinancialWrite(), so it must not
 * acquire another write reservation.
 */
export async function getExpenses(): Promise<Expense[]> {
  try {
    return await readExpenseStorage();
  } catch (error) {
    console.error("Failed to read expenses:", error);

    throw new Error("Unable to load saved expenses.");
  }
}

// =========================================
// SAVE EXPENSE
// =========================================

/**
 * Save an expense using a serialized
 * read-modify-write operation.
 */
export async function saveExpense(input: CreateExpenseInput): Promise<Expense> {
  return runFinancialWrite(async () => {
    const expenses = await getExpenses();

    const expense: Expense = {
      ...input,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };

    if (!isExpense(expense)) {
      throw new Error("Invalid expense data.");
    }

    try {
      await writeExpenseStorage([expense, ...expenses]);

      return expense;
    } catch (error) {
      console.error("Failed to save expense:", error);

      throw new Error("Unable to save expense.");
    }
  });
}

// =========================================
// UPDATE EXPENSE
// =========================================

/**
 * Update an existing expense while
 * preserving its ID and creation time.
 */
export async function updateExpense(
  id: string,
  changes: UpdateExpenseInput,
): Promise<Expense> {
  return runFinancialWrite(async () => {
    const expenses = await getExpenses();

    const index = expenses.findIndex((expense) => expense.id === id);

    if (index === -1) {
      throw new Error("Expense not found.");
    }

    const updatedExpense: Expense = {
      ...expenses[index],
      ...changes,

      id: expenses[index].id,
      createdAt: expenses[index].createdAt,
    };

    if (!isExpense(updatedExpense)) {
      throw new Error("Invalid expense data.");
    }

    const updatedExpenses = [...expenses];

    updatedExpenses[index] = updatedExpense;

    try {
      await writeExpenseStorage(updatedExpenses);

      return updatedExpense;
    } catch (error) {
      console.error("Failed to update expense:", error);

      throw new Error("Unable to update expense.");
    }
  });
}

// =========================================
// DELETE EXPENSE
// =========================================

/**
 * Delete an expense using the shared
 * financial write coordinator.
 */
export async function deleteExpense(id: string): Promise<void> {
  return runFinancialWrite(async () => {
    const expenses = await getExpenses();

    if (!expenses.some((expense) => expense.id === id)) {
      throw new Error("Expense not found.");
    }

    const remainingExpenses = expenses.filter((expense) => expense.id !== id);

    try {
      await writeExpenseStorage(remainingExpenses);
    } catch (error) {
      console.error("Failed to delete expense:", error);

      throw new Error("Unable to delete expense.");
    }
  });
}
