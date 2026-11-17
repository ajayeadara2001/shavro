import type { Transaction } from "../types/transaction";

export type TransactionTypeFilter = "ALL" | "INCOME" | "EXPENSE";

export type TransactionSortOption =
  | "newest"
  | "oldest"
  | "amount_high"
  | "amount_low";

export interface TransactionFilters {
  type: TransactionTypeFilter;

  // null means no restriction.
  month: number | null;
  year: number | null;

  startDate: string | null;
  endDate: string | null;

  categoryId: string | null;
  paymentMethodId: string | null;

  minAmount: number | null;
  maxAmount: number | null;

  search: string;
  sortBy: TransactionSortOption;
}

// Filter-only ID for historical income
// transactions without Received Via.
//
// This value is never stored on an
// income or expense record.
export const NOT_RECORDED_METHOD_ID = "__not_recorded__";

export const defaultTransactionFilters: TransactionFilters = {
  type: "ALL",

  month: null,
  year: null,

  startDate: null,
  endDate: null,

  categoryId: null,
  paymentMethodId: null,

  minAmount: null,
  maxAmount: null,

  search: "",
  sortBy: "newest",
};

// Normalize text for case-insensitive search.
function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

// Match a transaction against the search query.
//
// Include income Received Via details
// while preserving the existing fields.
function matchesSearch(transaction: Transaction, query: string): boolean {
  const search = normalizeText(query);

  if (!search) {
    return true;
  }

  const commonFields: string[] = [];

  if (transaction.type === "INCOME") {
    const income = transaction.data;

    const receivedVia = income.paymentMethodId?.trim()
      ? income.paymentMethodId
      : "Not recorded";

    commonFields.push(
      String(income.amount),
      income.transactionDate,
      income.notes ?? "",
      income.categoryId,
      income.incomeName ?? "",
      receivedVia,
      income.otherMethodName ?? "",
      "income",
    );
  } else {
    const expense = transaction.data;

    commonFields.push(
      String(expense.amount),
      expense.transactionDate,
      expense.notes ?? "",
      expense.categoryId,
      expense.expenseName ?? "",
      expense.paymentMethodId,
      expense.otherMethodName ?? "",
      "expense",
    );
  }

  return commonFields.some((value) => normalizeText(value).includes(search));
}

// Validate an ISO-format local date string.
function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);

  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

// Match the selected Payment Method filter.
//
// Income and expenses use the same saved
// payment-method IDs.
//
// Historical income without Received Via
// can match the Not recorded filter.
function matchesPaymentMethod(
  transaction: Transaction,
  selectedMethodId: string | null,
): boolean {
  if (selectedMethodId === null) {
    return true;
  }

  if (selectedMethodId === NOT_RECORDED_METHOD_ID) {
    return (
      transaction.type === "INCOME" && !transaction.data.paymentMethodId?.trim()
    );
  }

  if (transaction.type === "INCOME") {
    return transaction.data.paymentMethodId === selectedMethodId;
  }

  return transaction.data.paymentMethodId === selectedMethodId;
}

// Filter and sort without modifying
// the original transaction array.
export function filterTransactions(
  transactions: Transaction[],
  filters: TransactionFilters,
): Transaction[] {
  const filtered = transactions.filter((transaction) => {
    const item = transaction.data;

    const date = item.transactionDate;
    const amount = item.amount;

    // 1. Transaction type
    if (filters.type !== "ALL" && transaction.type !== filters.type) {
      return false;
    }

    // 2. Month and year
    const [transactionYear, transactionMonth] = date.split("-").map(Number);

    if (filters.month !== null && transactionMonth !== filters.month) {
      return false;
    }

    if (filters.year !== null && transactionYear !== filters.year) {
      return false;
    }

    // 3. Custom date range
    if (
      filters.startDate &&
      isValidDateString(filters.startDate) &&
      date < filters.startDate
    ) {
      return false;
    }

    if (
      filters.endDate &&
      isValidDateString(filters.endDate) &&
      date > filters.endDate
    ) {
      return false;
    }

    // 4. Category
    if (filters.categoryId !== null && item.categoryId !== filters.categoryId) {
      return false;
    }

    // 5. Payment Method / Received Via
    //
    // This now supports both transaction types.
    if (!matchesPaymentMethod(transaction, filters.paymentMethodId)) {
      return false;
    }

    // 6. Minimum amount
    if (filters.minAmount !== null && amount < filters.minAmount) {
      return false;
    }

    // 7. Maximum amount
    if (filters.maxAmount !== null && amount > filters.maxAmount) {
      return false;
    }

    // 8. Search
    if (!matchesSearch(transaction, filters.search)) {
      return false;
    }

    return true;
  });

  // 9. Sorting
  return filtered.sort((first, second) => {
    const firstDate = first.data.transactionDate;

    const secondDate = second.data.transactionDate;

    const firstAmount = first.data.amount;

    const secondAmount = second.data.amount;

    switch (filters.sortBy) {
      case "oldest":
        return firstDate.localeCompare(secondDate);

      case "amount_high":
        return (
          secondAmount - firstAmount || secondDate.localeCompare(firstDate)
        );

      case "amount_low":
        return (
          firstAmount - secondAmount || secondDate.localeCompare(firstDate)
        );

      case "newest":
      default:
        return secondDate.localeCompare(firstDate);
    }
  });
}

// Count active filters.
// Sorting is excluded because it changes
// ordering rather than restricting results.
export function countActiveFilters(filters: TransactionFilters): number {
  let count = 0;

  if (filters.type !== "ALL") count++;

  if (filters.month !== null) count++;
  if (filters.year !== null) count++;

  if (filters.startDate !== null) count++;
  if (filters.endDate !== null) count++;

  if (filters.categoryId !== null) count++;

  if (filters.paymentMethodId !== null) {
    count++;
  }

  if (filters.minAmount !== null) count++;
  if (filters.maxAmount !== null) count++;

  if (filters.search.trim()) count++;

  return count;
}

// Reset all filters to their defaults.
export function resetTransactionFilters(): TransactionFilters {
  return {
    ...defaultTransactionFilters,
  };
}
