import type {
  Expense,
  CreateExpenseInput,
  UpdateExpenseInput,
} from "../types/expense";

import { runFinancialWrite } from "./storageOperationGuard";

const STORAGE_KEY = "shavro_expenses_v1";

// =========================================
// EXPENSE VALIDATION
// =========================================

function isExpense(value: unknown): value is Expense {
  if (!value || typeof value !== "object") {
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

// =========================================
// ID GENERATION
// =========================================

function generateId(): string {
  return (
    `${Date.now()}-` +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  );
}

// =========================================
// READ EXPENSES
// =========================================

/**
 * Read expenses from browser storage.
 *
 * This function is intentionally read-only.
 *
 * It may be called inside runFinancialWrite().
 * Never acquire a nested financial write lock.
 */
export async function getExpenses(): Promise<Expense[]> {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (stored === null) {
      return [];
    }

    const parsed: unknown = JSON.parse(stored);

    if (!Array.isArray(parsed) || !parsed.every(isExpense)) {
      throw new Error("Stored expenses contain invalid data.");
    }

    return parsed;
  } catch (error) {
    console.error("Failed to read expenses:", error);

    throw new Error("Unable to load saved expenses.");
  }
}

// =========================================
// SAVE EXPENSE
// =========================================

/**
 * Protect the complete read-modify-write
 * sequence using the financial coordinator.
 *
 * Web financial locking is handled by
 * runFinancialWrite().
 */
export async function saveExpense(input: CreateExpenseInput): Promise<Expense> {
  return runFinancialWrite(async () => {
    const expenses = await getExpenses();

    const expense: Expense = {
      ...input,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([expense, ...expenses]),
      );

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
 * Update an existing expense without
 * changing its original ID or createdAt.
 *
 * Both the initial read and final write
 * are performed inside the same guard.
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

    const existingExpense = expenses[index];

    const updatedExpense: Expense = {
      ...existingExpense,
      ...changes,

      id: existingExpense.id,
      createdAt: existingExpense.createdAt,
    };

    const updatedExpenses = [...expenses];

    updatedExpenses[index] = updatedExpense;

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedExpenses));

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
 *
 * The existence check and deletion are
 * performed inside one guarded operation.
 */
export async function deleteExpense(id: string): Promise<void> {
  return runFinancialWrite(async () => {
    const expenses = await getExpenses();

    if (!expenses.some((expense) => expense.id === id)) {
      throw new Error("Expense not found.");
    }

    const remainingExpenses = expenses.filter((expense) => expense.id !== id);

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(remainingExpenses),
      );
    } catch (error) {
      console.error("Failed to delete expense:", error);

      throw new Error("Unable to delete expense.");
    }
  });
}
