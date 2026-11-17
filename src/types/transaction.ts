import type { Expense } from "./expense";
import type { Income } from "./income";

export type Transaction =
  | {
      type: "EXPENSE";
      data: Expense;
    }
  | {
      type: "INCOME";
      data: Income;
    };

export function sortTransactions(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => {
    const dateComparison = b.data.transactionDate.localeCompare(
      a.data.transactionDate,
    );

    if (dateComparison !== 0) {
      return dateComparison;
    }

    return b.data.createdAt.localeCompare(a.data.createdAt);
  });
}
