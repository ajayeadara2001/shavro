import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Expense } from "../types/expense";
import type { Income } from "../types/income";

const EXPENSE_KEY = "shavro_expenses_v1";
const INCOME_KEY = "shavro_income_v1";

export interface MigrationPreflightResult {
  expenseCount: number;
  incomeCount: number;
  totalCount: number;
  ready: true;
}

/**
 * Convert rupees into integer paise.
 *
 * Never silently round financial records.
 * Reject unsupported precision and amounts
 * outside JavaScript's safe integer range.
 */
export function rupeesToPaise(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid financial amount.");
  }

  const value = amount.toString();

  // Accept positive amounts with at most
  // two decimal places.
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error("Amount cannot be represented exactly in paise.");
  }

  const [rupees, fraction = ""] = value.split(".");

  const whole = Number(rupees);
  const paise = Number(fraction.padEnd(2, "0"));

  if (
    !Number.isSafeInteger(whole) ||
    !Number.isSafeInteger(paise) ||
    whole > Math.floor((Number.MAX_SAFE_INTEGER - paise) / 100)
  ) {
    throw new Error("Financial amount exceeds safe limits.");
  }

  const result = whole * 100 + paise;

  if (!Number.isSafeInteger(result) || result <= 0) {
    throw new Error("Invalid converted financial amount.");
  }

  return result;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isOptionalNullableString(value: unknown): boolean {
  return value === undefined || isNullableString(value);
}

function isExpense(value: unknown): value is Expense {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const item = value as Record<string, unknown>;

  return (
    isNonEmptyString(item.id) &&
    typeof item.amount === "number" &&
    Number.isFinite(item.amount) &&
    item.amount > 0 &&
    isNonEmptyString(item.categoryId) &&
    isNullableString(item.expenseName) &&
    isNonEmptyString(item.paymentMethodId) &&
    isNullableString(item.otherMethodName) &&
    isNonEmptyString(item.transactionDate) &&
    typeof item.notes === "string" &&
    isNonEmptyString(item.createdAt)
  );
}

function isIncome(value: unknown): value is Income {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const item = value as Record<string, unknown>;

  return (
    isNonEmptyString(item.id) &&
    typeof item.amount === "number" &&
    Number.isFinite(item.amount) &&
    item.amount > 0 &&
    isNonEmptyString(item.categoryId) &&
    isNullableString(item.incomeName) &&
    isOptionalNullableString(item.paymentMethodId) &&
    isOptionalNullableString(item.otherMethodName) &&
    isNonEmptyString(item.transactionDate) &&
    typeof item.notes === "string" &&
    isNonEmptyString(item.createdAt)
  );
}

async function readRecords(
  storageKey: string,
  collectionName: string,
): Promise<unknown[]> {
  const raw = await AsyncStorage.getItem(storageKey);

  if (raw === null) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${collectionName}: saved JSON could not be parsed.`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${collectionName}: expected an array of records.`);
  }

  return parsed;
}

function validateRecords<T extends { id: string; amount: number }>(
  records: unknown[],
  collectionName: string,
  validator: (value: unknown) => value is T,
): void {
  const ids = new Set<string>();

  records.forEach((record, index) => {
    if (!validator(record)) {
      throw new Error(`${collectionName}: invalid record at index ${index}.`);
    }

    if (ids.has(record.id)) {
      throw new Error(
        `${collectionName}: duplicate record ID at index ${index}.`,
      );
    }

    ids.add(record.id);

    try {
      rupeesToPaise(record.amount);
    } catch {
      throw new Error(
        `${collectionName}: amount cannot be safely migrated at index ${index}.`,
      );
    }
  });
}

/**
 * Read-only preflight.
 *
 * DOES NOT:
 * - Create financial database rows
 * - Modify AsyncStorage
 * - Switch active storage
 * - Change Backup & Restore
 *
 * This validates only expense and income
 * collections. Additional collections and
 * restore guards are verified separately.
 */
export async function runMigrationPreflight(): Promise<MigrationPreflightResult> {
  const expenses = await readRecords(EXPENSE_KEY, "Expenses");

  const incomes = await readRecords(INCOME_KEY, "Incomes");

  validateRecords(expenses, "Expenses", isExpense);
  validateRecords(incomes, "Incomes", isIncome);

  return {
    expenseCount: expenses.length,
    incomeCount: incomes.length,
    totalCount: expenses.length + incomes.length,
    ready: true,
  };
}
