import { BACKUP_FORMAT, BACKUP_VERSION } from "../types/backup";

import type { ShavroBackup, ShavroBackupSummary } from "../types/backup";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isOptionalNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isPositiveAmount(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isValidTimestamp(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isValidTransactionDate(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);

  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

function assertUniqueIds(items: JsonObject[], label: string): void {
  const ids = new Set<string>();

  for (const item of items) {
    const id = item.id as string;

    if (ids.has(id)) {
      throw new Error(`Backup contains duplicate ${label} IDs.`);
    }

    ids.add(id);
  }
}

function validateExpense(value: unknown): value is JsonObject {
  if (!isObject(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.id) &&
    isPositiveAmount(value.amount) &&
    isNonEmptyString(value.categoryId) &&
    isNullableString(value.expenseName) &&
    isNonEmptyString(value.paymentMethodId) &&
    isNullableString(value.otherMethodName) &&
    isValidTransactionDate(value.transactionDate) &&
    typeof value.notes === "string" &&
    isValidTimestamp(value.createdAt) &&
    (value.paymentMethodId !== "other" ||
      isNonEmptyString(value.otherMethodName))
  );
}

function validateIncome(value: unknown): value is JsonObject {
  if (!isObject(value)) {
    return false;
  }

  const validPaymentMethod =
    value.paymentMethodId === undefined ||
    value.paymentMethodId === null ||
    isNonEmptyString(value.paymentMethodId);

  return (
    isNonEmptyString(value.id) &&
    isPositiveAmount(value.amount) &&
    isNonEmptyString(value.categoryId) &&
    isNullableString(value.incomeName) &&
    validPaymentMethod &&
    isOptionalNullableString(value.otherMethodName) &&
    isValidTransactionDate(value.transactionDate) &&
    typeof value.notes === "string" &&
    isValidTimestamp(value.createdAt) &&
    (value.paymentMethodId !== "other" ||
      isNonEmptyString(value.otherMethodName))
  );
}

function validateCustomCategory(value: unknown): value is JsonObject {
  if (!isObject(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.id) &&
    value.id.startsWith("category_") &&
    isNonEmptyString(value.name) &&
    value.name.trim().length <= 40 &&
    (value.scope === "INCOME" || value.scope === "EXPENSE") &&
    (value.archived === undefined || typeof value.archived === "boolean")
  );
}

function validateCustomPaymentMethod(value: unknown): value is JsonObject {
  if (!isObject(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.id) &&
    value.id.startsWith("payment_") &&
    isNonEmptyString(value.name) &&
    value.name.trim().length <= 40 &&
    (value.archived === undefined || typeof value.archived === "boolean")
  );
}

/**
 * Validate an unknown JSON value before
 * treating it as a Shavro backup.
 *
 * No storage is read or modified here.
 */
export function validateShavroBackup(value: unknown): ShavroBackup {
  if (!isObject(value)) {
    throw new Error("Invalid backup file.");
  }

  if (value.format !== BACKUP_FORMAT) {
    throw new Error("This is not a Shavro backup file.");
  }

  if (value.version !== BACKUP_VERSION) {
    throw new Error("This backup version is not supported.");
  }

  if (!isValidTimestamp(value.createdAt)) {
    throw new Error("Backup creation date is invalid.");
  }

  if (!isObject(value.data)) {
    throw new Error("Backup data is missing or invalid.");
  }

  const data = value.data;

  if (
    !Array.isArray(data.expenses) ||
    !Array.isArray(data.incomes) ||
    !Array.isArray(data.customCategories) ||
    !Array.isArray(data.customPaymentMethods)
  ) {
    throw new Error("Backup is missing required data collections.");
  }

  if (!data.expenses.every(validateExpense)) {
    throw new Error("Backup contains invalid expense records.");
  }

  if (!data.incomes.every(validateIncome)) {
    throw new Error("Backup contains invalid income records.");
  }

  if (!data.customCategories.every(validateCustomCategory)) {
    throw new Error("Backup contains invalid custom categories.");
  }

  if (!data.customPaymentMethods.every(validateCustomPaymentMethod)) {
    throw new Error("Backup contains invalid custom payment methods.");
  }

  assertUniqueIds(data.expenses, "expense");
  assertUniqueIds(data.incomes, "income");
  assertUniqueIds(data.customCategories, "custom category");
  assertUniqueIds(data.customPaymentMethods, "custom payment method");

  const categories = new Map(
    data.customCategories.map((item) => [item.id as string, item]),
  );

  const paymentIds = new Set(
    data.customPaymentMethods.map((item) => item.id as string),
  );

  // Custom references must resolve to saved
  // options with the correct transaction scope.
  // Built-in IDs are handled by the app's
  // existing category/method definitions.
  for (const [items, scope] of [
    [data.expenses, "EXPENSE"],
    [data.incomes, "INCOME"],
  ] as const) {
    for (const item of items) {
      const categoryId = item.categoryId as string;

      if (categoryId.startsWith("category_")) {
        const category = categories.get(categoryId);

        if (!category || category.scope !== scope) {
          throw new Error(
            `Backup has an unresolved ${scope.toLowerCase()} category.`,
          );
        }
      }

      const methodId = item.paymentMethodId;

      if (
        typeof methodId === "string" &&
        methodId.startsWith("payment_") &&
        !paymentIds.has(methodId)
      ) {
        throw new Error("Backup contains an unresolved custom payment method.");
      }
    }
  }

  return value as unknown as ShavroBackup;
}

/**
 * Parse JSON and validate the complete
 * backup before any restore operation.
 */
export function parseShavroBackup(json: string): ShavroBackup {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("The selected file does not contain valid JSON.");
  }

  return validateShavroBackup(parsed);
}

/**
 * Generate information for the future
 * Restore Confirmation screen.
 */
export function getShavroBackupSummary(
  backup: ShavroBackup,
): ShavroBackupSummary {
  return {
    createdAt: backup.createdAt,
    expenseCount: backup.data.expenses.length,
    incomeCount: backup.data.incomes.length,
    customCategoryCount: backup.data.customCategories.length,
    customPaymentMethodCount: backup.data.customPaymentMethods.length,
  };
}
