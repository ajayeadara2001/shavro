import type { Expense } from "../types/expense";
import type { Income } from "../types/income";
import type { Transaction } from "../types/transaction";

import {
  getCustomCategories,
  getCustomPaymentMethods,
} from "../services/customOptionsStorage";

export interface CustomOptionLabels {
  incomeCategories: Record<string, string>;
  expenseCategories: Record<string, string>;
  paymentMethods: Record<string, string>;
}

export const EMPTY_CUSTOM_OPTION_LABELS: CustomOptionLabels = {
  incomeCategories: {},
  expenseCategories: {},
  paymentMethods: {},
};

function formatName(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

// Load saved names from the existing storage service.
export async function loadCustomOptionLabels(): Promise<CustomOptionLabels> {
  const [categories, methods] = await Promise.all([
    getCustomCategories(),
    getCustomPaymentMethods(),
  ]);

  const incomeCategories: Record<string, string> = {};
  const expenseCategories: Record<string, string> = {};
  const paymentMethods: Record<string, string> = {};

  categories.forEach((category) => {
    if (category.scope === "INCOME") {
      incomeCategories[category.id] = category.name;
    } else if (category.scope === "EXPENSE") {
      expenseCategories[category.id] = category.name;
    }
  });

  methods.forEach((method) => {
    paymentMethods[method.id] = method.name;
  });

  return {
    incomeCategories,
    expenseCategories,
    paymentMethods,
  };
}

// Readable category name for an expense.
export function getExpenseCategoryLabel(
  expense: Expense,
  labels: CustomOptionLabels,
): string {
  if (expense.categoryId === "other" && expense.expenseName?.trim()) {
    return expense.expenseName.trim();
  }

  return (
    labels.expenseCategories[expense.categoryId] ??
    formatName(expense.categoryId)
  );
}

// Readable category name for income.
export function getIncomeCategoryLabel(
  income: Income,
  labels: CustomOptionLabels,
): string {
  if (income.categoryId === "other" && income.incomeName?.trim()) {
    return income.incomeName.trim();
  }

  const customCategory = labels.incomeCategories[income.categoryId];

  if (customCategory) {
    return customCategory;
  }

  // Preserve existing income naming behavior.
  if (income.incomeName?.trim()) {
    return income.incomeName.trim();
  }

  return formatName(income.categoryId);
}

// Readable payment method for an expense.
export function getExpensePaymentLabel(
  expense: Expense,
  labels: CustomOptionLabels,
): string {
  if (expense.paymentMethodId === "other" && expense.otherMethodName?.trim()) {
    return expense.otherMethodName.trim();
  }

  if (expense.paymentMethodId === "upi") {
    return "UPI";
  }

  return (
    labels.paymentMethods[expense.paymentMethodId] ??
    formatName(expense.paymentMethodId)
  );
}

// Shared resolver for transaction reports and exports.
export function getTransactionCategoryLabel(
  transaction: Transaction,
  labels: CustomOptionLabels,
): string {
  if (transaction.type === "INCOME") {
    return getIncomeCategoryLabel(transaction.data, labels);
  }

  return getExpenseCategoryLabel(transaction.data, labels);
}

export function getTransactionPaymentLabel(
  transaction: Transaction,
  labels: CustomOptionLabels,
): string {
  if (transaction.type === "INCOME") {
    return "—";
  }

  return getExpensePaymentLabel(transaction.data, labels);
}
