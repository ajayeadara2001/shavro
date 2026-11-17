import type { Transaction } from "../types/transaction";

import type { CategoryReport } from "./financialReports";

import {
  getExpenseCategoryLabel,
  type CustomOptionLabels,
} from "./customOptionLabels";

import { toPaise, toRupees } from "./money";

interface CategoryTotals {
  categoryId: string;
  categoryName: string;
  totalPaise: number;
  transactionCount: number;
}

export function generateCustomCategoryReport(
  transactions: Transaction[],
  labels: CustomOptionLabels,
): CategoryReport[] {
  const categories = new Map<string, CategoryTotals>();

  let totalExpensePaise = 0;

  for (const transaction of transactions) {
    // Category spending charts include expenses only.
    if (transaction.type !== "EXPENSE") {
      continue;
    }

    const expense = transaction.data;
    const amountPaise = toPaise(expense.amount);

    const categoryName = getExpenseCategoryLabel(expense, labels);

    // Match Excel's grouping by readable name.
    const key = categoryName.trim().toLocaleLowerCase();

    const existing = categories.get(key);

    if (existing) {
      existing.totalPaise += amountPaise;
      existing.transactionCount += 1;
    } else {
      categories.set(key, {
        categoryId: expense.categoryId,
        categoryName,
        totalPaise: amountPaise,
        transactionCount: 1,
      });
    }

    totalExpensePaise += amountPaise;
  }

  const result: CategoryReport[] = Array.from(categories.values()).map(
    (category) => ({
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      totalAmount: toRupees(category.totalPaise),
      transactionCount: category.transactionCount,
      percentage:
        totalExpensePaise > 0
          ? (category.totalPaise / totalExpensePaise) * 100
          : 0,
    }),
  );

  return result.sort(
    (first, second) =>
      second.totalAmount - first.totalAmount ||
      first.categoryName.localeCompare(second.categoryName),
  );
}
