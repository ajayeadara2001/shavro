import type { Transaction } from "../types/transaction";

import { toPaise, toRupees } from "./money";

// Financial summary for one calendar month.
export interface MonthlyReport {
  month: number;
  year: number;
  monthKey: string;
  monthLabel: string;

  totalIncome: number;
  totalExpenses: number;
  netBalance: number;

  incomeCount: number;
  expenseCount: number;
  transactionCount: number;
}

// Spending summary for one expense category.
export interface CategoryReport {
  categoryId: string;
  categoryName: string;

  totalAmount: number;
  transactionCount: number;
  percentage: number;
}

// Filter transactions by a calendar month.
export function getTransactionsForMonth(
  transactions: Transaction[],
  year: number,
  month: number,
): Transaction[] {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return [];
  }

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  return transactions.filter((transaction) =>
    transaction.data.transactionDate.startsWith(`${monthKey}-`),
  );
}

// Generate the financial summary for one month.
export function generateMonthlyReport(
  transactions: Transaction[],
  year: number,
  month: number,
): MonthlyReport {
  const monthlyTransactions = getTransactionsForMonth(
    transactions,
    year,
    month,
  );

  let incomePaise = 0;
  let expensePaise = 0;

  let incomeCount = 0;
  let expenseCount = 0;

  monthlyTransactions.forEach((transaction) => {
    const amountPaise = toPaise(transaction.data.amount);

    if (transaction.type === "INCOME") {
      incomePaise += amountPaise;
      incomeCount++;
    } else {
      expensePaise += amountPaise;
      expenseCount++;
    }
  });

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });

  return {
    month,
    year,
    monthKey,
    monthLabel,

    totalIncome: toRupees(incomePaise),
    totalExpenses: toRupees(expensePaise),

    netBalance: toRupees(incomePaise - expensePaise),

    incomeCount,
    expenseCount,

    transactionCount: monthlyTransactions.length,
  };
}

// Generate monthly reports for a selected year.
// Includes months with no transactions.
export function generateYearlyReports(
  transactions: Transaction[],
  year: number,
): MonthlyReport[] {
  return Array.from({ length: 12 }, (_, index) =>
    generateMonthlyReport(transactions, year, index + 1),
  );
}

// Display category IDs in a readable format.
function formatCategoryName(categoryId: string): string {
  return categoryId
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

// Calculate expense-category breakdowns.
//
// Pass an already-filtered transaction array
// to produce reports for a specific month,
// year, or other selected period.
export function generateCategoryReport(
  transactions: Transaction[],
): CategoryReport[] {
  const categoryTotals = new Map<
    string,
    {
      amountPaise: number;
      count: number;
    }
  >();

  let totalExpensePaise = 0;

  transactions.forEach((transaction) => {
    if (transaction.type !== "EXPENSE") {
      return;
    }

    const expense = transaction.data;

    const amountPaise = toPaise(expense.amount);

    totalExpensePaise += amountPaise;

    const existing = categoryTotals.get(expense.categoryId);

    if (existing) {
      existing.amountPaise += amountPaise;
      existing.count++;
    } else {
      categoryTotals.set(expense.categoryId, {
        amountPaise,
        count: 1,
      });
    }
  });

  const report: CategoryReport[] = Array.from(categoryTotals.entries()).map(
    ([categoryId, data]) => ({
      categoryId,

      categoryName: formatCategoryName(categoryId),

      totalAmount: toRupees(data.amountPaise),

      transactionCount: data.count,

      percentage:
        totalExpensePaise > 0
          ? (data.amountPaise / totalExpensePaise) * 100
          : 0,
    }),
  );

  // Largest expense categories first.
  return report.sort((first, second) => second.totalAmount - first.totalAmount);
}

// Calculate how much income remains after
// expenses, expressed as a percentage.
//
// This is a net-balance ratio, not a measure
// of money transferred into savings accounts.
export function calculateSavingsRate(
  totalIncome: number,
  totalExpenses: number,
): number {
  if (totalIncome <= 0) {
    return 0;
  }

  return ((totalIncome - totalExpenses) / totalIncome) * 100;
}
