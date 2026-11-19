import type { Expense } from "../types/expense";
import type { Income } from "../types/income";

import type {
  CustomCategory,
  CustomPaymentMethod,
  CategoryScope,
} from "../services/customOptionsStorage";

import { rupeesToPaise } from "./sqliteMigrationPreflight.native";

// =========================================
// SQLITE ROW TYPES — VERSION 4
// =========================================

export interface ExpenseV4Row {
  id: string;
  amount_paise: number;
  category_id: string;
  expense_name: string | null;
  payment_method_id: string;
  other_method_name: string | null;
  transaction_date: string;
  notes: string;
  created_at: string;
  position: number;
}

export interface IncomeV4Row {
  id: string;
  amount_paise: number;
  category_id: string;
  income_name: string | null;
  payment_method_id: string | null;
  other_method_name: string | null;
  transaction_date: string;
  notes: string;
  created_at: string;
  position: number;

  // Preserve absent properties versus null.
  has_payment_method_id: number;
  has_other_method_name: number;
}

export interface CategoryV4Row {
  id: string;
  name: string;
  scope: string;
  archived: number | null;
  position: number;
}

export interface PaymentMethodV4Row {
  id: string;
  name: string;
  archived: number | null;
  position: number;
}

// =========================================
// SOURCE AND DESTINATION TYPES
// =========================================

export interface FinancialCollections {
  expenses: Expense[];
  incomes: Income[];
  categories: CustomCategory[];
  paymentMethods: CustomPaymentMethod[];
}

export interface SQLiteV4Collections {
  expenses: ExpenseV4Row[];
  incomes: IncomeV4Row[];
  categories: CategoryV4Row[];
  paymentMethods: PaymentMethodV4Row[];
}

// =========================================
// VALIDATION HELPERS
// =========================================

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function toRupees(paise: number): number {
  if (!Number.isSafeInteger(paise) || paise <= 0) {
    throw new Error("SQLite contains an invalid monetary amount.");
  }

  const rupees = paise / 100;

  if (rupeesToPaise(rupees) !== paise) {
    throw new Error("SQLite monetary amount failed round-trip verification.");
  }

  return rupees;
}

function encodeArchived(value: boolean | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  return value ? 1 : 0;
}

function decodeArchived(value: number | null): boolean | undefined {
  if (value === null) {
    return undefined;
  }

  if (value === 0) {
    return false;
  }

  if (value === 1) {
    return true;
  }

  throw new Error("SQLite contains an invalid archived value.");
}

function assertPresenceFlag(value: number): void {
  if (value !== 0 && value !== 1) {
    throw new Error("SQLite contains an invalid property-presence flag.");
  }
}

/**
 * Check positions and IDs before reconstructing
 * the original collection order.
 *
 * These checks detect duplicate, missing,
 * negative and out-of-range positions.
 */
function restoreOrder<
  T extends {
    id: string;
    position: number;
  },
>(rows: readonly T[], collection: string): T[] {
  const sorted = [...rows].sort((a, b) => a.position - b.position);

  const ids = new Set<string>();

  sorted.forEach((row, index) => {
    if (!Number.isSafeInteger(row.position) || row.position !== index) {
      throw new Error(`${collection}: invalid SQLite ordering.`);
    }

    if (
      typeof row.id !== "string" ||
      row.id.trim().length === 0 ||
      ids.has(row.id)
    ) {
      throw new Error(`${collection}: invalid or duplicate SQLite ID.`);
    }

    ids.add(row.id);
  });

  return sorted;
}

// =========================================
// EXPENSE CONVERSION
// =========================================

export function encodeExpenses(expenses: readonly Expense[]): ExpenseV4Row[] {
  return expenses.map(
    (expense, position): ExpenseV4Row => ({
      id: expense.id,
      amount_paise: rupeesToPaise(expense.amount),
      category_id: expense.categoryId,
      expense_name: expense.expenseName,
      payment_method_id: expense.paymentMethodId,
      other_method_name: expense.otherMethodName,
      transaction_date: expense.transactionDate,
      notes: expense.notes,
      created_at: expense.createdAt,
      position,
    }),
  );
}

export function decodeExpenses(rows: readonly ExpenseV4Row[]): Expense[] {
  return restoreOrder(rows, "Expenses").map(
    (row): Expense => ({
      id: row.id,
      amount: toRupees(row.amount_paise),
      categoryId: row.category_id,
      expenseName: row.expense_name,
      paymentMethodId: row.payment_method_id,
      otherMethodName: row.other_method_name,
      transactionDate: row.transaction_date,
      notes: row.notes,
      createdAt: row.created_at,
    }),
  );
}

// =========================================
// INCOME CONVERSION
// =========================================

export function encodeIncomes(incomes: readonly Income[]): IncomeV4Row[] {
  return incomes.map((income, position): IncomeV4Row => {
    const hasPayment = hasOwn(income, "paymentMethodId");

    const hasOtherName = hasOwn(income, "otherMethodName");

    if (
      (hasPayment && income.paymentMethodId === undefined) ||
      (hasOtherName && income.otherMethodName === undefined)
    ) {
      throw new Error("Income contains an undefined optional property.");
    }

    return {
      id: income.id,
      amount_paise: rupeesToPaise(income.amount),
      category_id: income.categoryId,
      income_name: income.incomeName,
      payment_method_id: income.paymentMethodId ?? null,
      other_method_name: income.otherMethodName ?? null,
      transaction_date: income.transactionDate,
      notes: income.notes,
      created_at: income.createdAt,
      position,
      has_payment_method_id: hasPayment ? 1 : 0,
      has_other_method_name: hasOtherName ? 1 : 0,
    };
  });
}

export function decodeIncomes(rows: readonly IncomeV4Row[]): Income[] {
  return restoreOrder(rows, "Incomes").map((row): Income => {
    assertPresenceFlag(row.has_payment_method_id);

    assertPresenceFlag(row.has_other_method_name);

    if (
      (row.has_payment_method_id === 0 && row.payment_method_id !== null) ||
      (row.has_other_method_name === 0 && row.other_method_name !== null)
    ) {
      throw new Error("SQLite income property-presence data is inconsistent.");
    }

    const income: Income = {
      id: row.id,
      amount: toRupees(row.amount_paise),
      categoryId: row.category_id,
      incomeName: row.income_name,
      transactionDate: row.transaction_date,
      notes: row.notes,
      createdAt: row.created_at,
    };

    if (row.has_payment_method_id === 1) {
      income.paymentMethodId = row.payment_method_id;
    }

    if (row.has_other_method_name === 1) {
      income.otherMethodName = row.other_method_name;
    }

    return income;
  });
}

// =========================================
// CUSTOM CATEGORY CONVERSION
// =========================================

export function encodeCategories(
  categories: readonly CustomCategory[],
): CategoryV4Row[] {
  return categories.map(
    (category, position): CategoryV4Row => ({
      id: category.id,
      name: category.name,
      scope: category.scope,
      archived: encodeArchived(category.archived),
      position,
    }),
  );
}

export function decodeCategories(
  rows: readonly CategoryV4Row[],
): CustomCategory[] {
  return restoreOrder(rows, "Categories").map((row): CustomCategory => {
    if (row.scope !== "INCOME" && row.scope !== "EXPENSE") {
      throw new Error("SQLite contains an invalid category scope.");
    }

    const archived = decodeArchived(row.archived);

    const category: CustomCategory = {
      id: row.id,
      name: row.name,
      scope: row.scope as CategoryScope,
    };

    if (archived !== undefined) {
      category.archived = archived;
    }

    return category;
  });
}

// =========================================
// PAYMENT METHOD CONVERSION
// =========================================

export function encodePaymentMethods(
  methods: readonly CustomPaymentMethod[],
): PaymentMethodV4Row[] {
  return methods.map(
    (method, position): PaymentMethodV4Row => ({
      id: method.id,
      name: method.name,
      archived: encodeArchived(method.archived),
      position,
    }),
  );
}

export function decodePaymentMethods(
  rows: readonly PaymentMethodV4Row[],
): CustomPaymentMethod[] {
  return restoreOrder(rows, "Payment methods").map(
    (row): CustomPaymentMethod => {
      const archived = decodeArchived(row.archived);

      const method: CustomPaymentMethod = {
        id: row.id,
        name: row.name,
      };

      if (archived !== undefined) {
        method.archived = archived;
      }

      return method;
    },
  );
}

// =========================================
// FULL FOUR-COLLECTION CONVERSION
// =========================================

export function encodeAllCollections(
  source: FinancialCollections,
): SQLiteV4Collections {
  return {
    expenses: encodeExpenses(source.expenses),
    incomes: encodeIncomes(source.incomes),
    categories: encodeCategories(source.categories),
    paymentMethods: encodePaymentMethods(source.paymentMethods),
  };
}

export function decodeAllCollections(
  source: SQLiteV4Collections,
): FinancialCollections {
  return {
    expenses: decodeExpenses(source.expenses),
    incomes: decodeIncomes(source.incomes),
    categories: decodeCategories(source.categories),
    paymentMethods: decodePaymentMethods(source.paymentMethods),
  };
}
