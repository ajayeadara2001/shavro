import { defaultIncomeCategories } from "../constants/incomeCategories";

import { getExpenses } from "./expenseStorage";
import { getIncomes } from "./incomeStorage";

import { runFinancialWrite } from "./storageOperationGuard";

import { Platform } from "react-native";

import * as nativeBackend from "./customOptionsStorageBackend.native";
import * as webBackend from "./customOptionsStorageBackend.web";

const backend = Platform.OS === "web" ? webBackend : nativeBackend;

export const readCustomOptionsValue = backend.readCustomOptionsValue;

export const writeCustomOptionsValue = backend.writeCustomOptionsValue;

export type CategoryScope = "INCOME" | "EXPENSE";

export interface CustomCategory {
  id: string;
  name: string;
  scope: CategoryScope;

  // Optional for backward compatibility.
  archived?: boolean;
}

export interface CustomPaymentMethod {
  id: string;
  name: string;

  // Optional for backward compatibility.
  archived?: boolean;
}

const CATEGORY_KEY = "shavro_custom_categories_v1";

const PAYMENT_METHOD_KEY = "shavro_custom_payment_methods_v1";

const MAX_NAME_LENGTH = 40;

const BUILT_IN_EXPENSE_NAMES = [
  "Food",
  "Transport",
  "Bills",
  "Shopping",
  "Health",
  "Housing",
  "Entertainment",
  "Other",
];

const BUILT_IN_PAYMENT_NAMES = [
  "Cash",
  "UPI",
  "Debit Card",
  "Credit Card",
  "Bank Transfer",
  "Other",
];

// ----------------------------------------
// STORAGE HELPERS
// ----------------------------------------

async function readStorage(key: string): Promise<string | null> {
  return readCustomOptionsValue(key);
}

async function writeStorage(key: string, value: string): Promise<void> {
  await writeCustomOptionsValue(key, value);
}

// ----------------------------------------
// NAME VALIDATION
// ----------------------------------------

function cleanOptionName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Treat spaces, underscores, hyphens
 * and capitalization as equivalent.
 *
 * Gift Card = giftCard = gift_card
 * = GIFT-CARD
 */
export function normalizeOptionName(name: string): string {
  return name
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s_-]+/g, "");
}

function validateName(
  name: string,
  optionType: "category" | "payment method",
): string {
  const cleanName = cleanOptionName(name);

  if (!cleanName) {
    throw new Error(`Enter a ${optionType} name.`);
  }

  if (cleanName.length > MAX_NAME_LENGTH) {
    throw new Error(
      `${
        optionType === "category" ? "Category" : "Payment method"
      } name must be ${MAX_NAME_LENGTH} characters or fewer.`,
    );
  }

  return cleanName;
}

function generateId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);

  return `${prefix}_${Date.now()}_${random}`;
}

function parseStoredArray<T>(stored: string | null): T[] {
  if (stored === null) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);

  if (!Array.isArray(parsed)) {
    throw new Error("Invalid custom options data.");
  }

  return parsed as T[];
}

function validateScope(scope: CategoryScope): void {
  if (scope !== "INCOME" && scope !== "EXPENSE") {
    throw new Error("Invalid category type.");
  }
}

function isDuplicate(name: string, existingNames: string[]): boolean {
  const normalized = normalizeOptionName(name);

  return existingNames.some(
    (existing) => normalizeOptionName(existing) === normalized,
  );
}

function getBuiltInCategoryNames(scope: CategoryScope): string[] {
  if (scope === "INCOME") {
    return defaultIncomeCategories.map((category) => category.name);
  }

  return BUILT_IN_EXPENSE_NAMES;
}

// ----------------------------------------
// CUSTOM CATEGORIES — READ OPERATIONS
// ----------------------------------------

/**
 * Returns all custom categories,
 * including archived categories.
 *
 * Read operations do not acquire
 * a financial write reservation.
 */
export async function getCustomCategories(
  scope?: CategoryScope,
): Promise<CustomCategory[]> {
  const stored = await readStorage(CATEGORY_KEY);

  const categories = parseStoredArray<CustomCategory>(stored);

  if (scope) {
    validateScope(scope);

    return categories.filter((category) => category.scope === scope);
  }

  return categories;
}

export async function getActiveCustomCategories(
  scope: CategoryScope,
): Promise<CustomCategory[]> {
  const categories = await getCustomCategories(scope);

  return categories.filter((category) => !category.archived);
}

// ----------------------------------------
// CUSTOM CATEGORIES — WRITE OPERATIONS
// ----------------------------------------

export async function addCustomCategory(
  name: string,
  scope: CategoryScope,
): Promise<CustomCategory> {
  return runFinancialWrite(async () => {
    validateScope(scope);

    const cleanName = validateName(name, "category");

    const existing = await getCustomCategories();

    const namesInScope = existing
      .filter((category) => category.scope === scope)
      .map((category) => category.name);

    const builtInNames = getBuiltInCategoryNames(scope);

    // Archived names remain protected
    // because historical transactions
    // may reference their IDs.
    if (isDuplicate(cleanName, [...namesInScope, ...builtInNames])) {
      throw new Error("This category already exists.");
    }

    const category: CustomCategory = {
      id: generateId("category"),
      name: cleanName,
      scope,
      archived: false,
    };

    await writeStorage(CATEGORY_KEY, JSON.stringify([...existing, category]));

    return category;
  });
}

/**
 * Rename without changing the ID
 * referenced by existing transactions.
 */
export async function renameCustomCategory(
  id: string,
  newName: string,
): Promise<CustomCategory> {
  return runFinancialWrite(async () => {
    const cleanName = validateName(newName, "category");

    const categories = await getCustomCategories();

    const index = categories.findIndex((category) => category.id === id);

    if (index === -1) {
      throw new Error("Custom category not found.");
    }

    const current = categories[index];

    const otherNames = categories
      .filter(
        (category) => category.id !== id && category.scope === current.scope,
      )
      .map((category) => category.name);

    const builtInNames = getBuiltInCategoryNames(current.scope);

    if (isDuplicate(cleanName, [...otherNames, ...builtInNames])) {
      throw new Error("This category already exists.");
    }

    const updated: CustomCategory = {
      ...current,
      name: cleanName,
    };

    const next = [...categories];

    next[index] = updated;

    await writeStorage(CATEGORY_KEY, JSON.stringify(next));

    return updated;
  });
}

/**
 * Archive or restore a category.
 *
 * Existing transaction references
 * remain unchanged.
 */
export async function setCustomCategoryArchived(
  id: string,
  archived: boolean,
): Promise<CustomCategory> {
  return runFinancialWrite(async () => {
    const categories = await getCustomCategories();

    const index = categories.findIndex((category) => category.id === id);

    if (index === -1) {
      throw new Error("Custom category not found.");
    }

    const updated: CustomCategory = {
      ...categories[index],
      archived,
    };

    const next = [...categories];

    next[index] = updated;

    await writeStorage(CATEGORY_KEY, JSON.stringify(next));

    return updated;
  });
}

/**
 * Permanently delete only an unused
 * custom category.
 *
 * Perform the transaction-reference
 * check and deletion in the same
 * guarded operation.
 */
export async function deleteCustomCategory(id: string): Promise<void> {
  return runFinancialWrite(async () => {
    const categories = await getCustomCategories();

    const category = categories.find((item) => item.id === id);

    if (!category) {
      throw new Error("Custom category not found.");
    }

    if (category.scope === "INCOME") {
      const incomes = await getIncomes();

      if (incomes.some((income) => income.categoryId === id)) {
        throw new Error(
          "This category is used by income transactions. Archive it instead.",
        );
      }
    } else {
      const expenses = await getExpenses();

      if (expenses.some((expense) => expense.categoryId === id)) {
        throw new Error(
          "This category is used by expense transactions. Archive it instead.",
        );
      }
    }

    const remaining = categories.filter((item) => item.id !== id);

    await writeStorage(CATEGORY_KEY, JSON.stringify(remaining));
  });
}

// ----------------------------------------
// CUSTOM PAYMENT METHODS — READ OPERATIONS
// ----------------------------------------

/**
 * Returns all methods, including
 * archived historical methods.
 */
export async function getCustomPaymentMethods(): Promise<
  CustomPaymentMethod[]
> {
  const stored = await readStorage(PAYMENT_METHOD_KEY);

  return parseStoredArray<CustomPaymentMethod>(stored);
}

export async function getActiveCustomPaymentMethods(): Promise<
  CustomPaymentMethod[]
> {
  const methods = await getCustomPaymentMethods();

  return methods.filter((method) => !method.archived);
}

// ----------------------------------------
// CUSTOM PAYMENT METHODS — WRITE OPERATIONS
// ----------------------------------------

export async function addCustomPaymentMethod(
  name: string,
): Promise<CustomPaymentMethod> {
  return runFinancialWrite(async () => {
    const cleanName = validateName(name, "payment method");

    const existing = await getCustomPaymentMethods();

    if (
      isDuplicate(cleanName, [
        ...existing.map((method) => method.name),
        ...BUILT_IN_PAYMENT_NAMES,
      ])
    ) {
      throw new Error("This payment method already exists.");
    }

    const paymentMethod: CustomPaymentMethod = {
      id: generateId("payment"),
      name: cleanName,
      archived: false,
    };

    await writeStorage(
      PAYMENT_METHOD_KEY,
      JSON.stringify([...existing, paymentMethod]),
    );

    return paymentMethod;
  });
}

/**
 * Rename without changing transaction
 * paymentMethodId references.
 */
export async function renameCustomPaymentMethod(
  id: string,
  newName: string,
): Promise<CustomPaymentMethod> {
  return runFinancialWrite(async () => {
    const cleanName = validateName(newName, "payment method");

    const methods = await getCustomPaymentMethods();

    const index = methods.findIndex((method) => method.id === id);

    if (index === -1) {
      throw new Error("Custom payment method not found.");
    }

    const otherNames = methods
      .filter((method) => method.id !== id)
      .map((method) => method.name);

    if (isDuplicate(cleanName, [...otherNames, ...BUILT_IN_PAYMENT_NAMES])) {
      throw new Error("This payment method already exists.");
    }

    const updated: CustomPaymentMethod = {
      ...methods[index],
      name: cleanName,
    };

    const next = [...methods];

    next[index] = updated;

    await writeStorage(PAYMENT_METHOD_KEY, JSON.stringify(next));

    return updated;
  });
}

/**
 * Archive or restore a payment method
 * while preserving historical labels.
 */
export async function setCustomPaymentMethodArchived(
  id: string,
  archived: boolean,
): Promise<CustomPaymentMethod> {
  return runFinancialWrite(async () => {
    const methods = await getCustomPaymentMethods();

    const index = methods.findIndex((method) => method.id === id);

    if (index === -1) {
      throw new Error("Custom payment method not found.");
    }

    const updated: CustomPaymentMethod = {
      ...methods[index],
      archived,
    };

    const next = [...methods];

    next[index] = updated;

    await writeStorage(PAYMENT_METHOD_KEY, JSON.stringify(next));

    return updated;
  });
}

/**
 * Payment methods are shared across
 * income and expense transactions.
 *
 * Check both collections before deletion.
 *
 * The full check-and-delete operation
 * runs inside one financial write guard.
 */
export async function deleteCustomPaymentMethod(id: string): Promise<void> {
  return runFinancialWrite(async () => {
    const methods = await getCustomPaymentMethods();

    const exists = methods.some((method) => method.id === id);

    if (!exists) {
      throw new Error("Custom payment method not found.");
    }

    // These are read-only functions.
    // They do not acquire another write lock.
    const [incomes, expenses] = await Promise.all([
      getIncomes(),
      getExpenses(),
    ]);

    const usedByIncome = incomes.some(
      (income) => income.paymentMethodId === id,
    );

    const usedByExpense = expenses.some(
      (expense) => expense.paymentMethodId === id,
    );

    if (usedByIncome || usedByExpense) {
      throw new Error(
        "This payment method is used by saved transactions. Archive it instead.",
      );
    }

    const remaining = methods.filter((method) => method.id !== id);

    await writeStorage(PAYMENT_METHOD_KEY, JSON.stringify(remaining));
  });
}
