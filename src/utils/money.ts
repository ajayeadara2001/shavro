// src/utils/money.ts

/**
 * Shared financial calculation utilities.
 *
 * Shavro stores amounts in rupees.
 * Calculations use integer paise to reduce
 * floating-point precision problems.
 */

export interface FinancialTotals {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
}

interface AmountRecord {
  amount: number;
}

/**
 * Convert rupees to integer paise.
 *
 * Example:
 * 125.75 -> 12575
 */
export function toPaise(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new Error("Invalid monetary amount");
  }

  const paise = Math.round(amount * 100);

  if (!Number.isSafeInteger(paise)) {
    throw new Error("Monetary amount is too large");
  }

  return paise;
}

/**
 * Convert integer paise back to rupees.
 *
 * Example:
 * 12575 -> 125.75
 */
export function toRupees(paise: number): number {
  if (!Number.isSafeInteger(paise)) {
    throw new Error("Invalid amount in paise");
  }

  return paise / 100;
}

/**
 * Sum transaction amounts safely.
 *
 * Example:
 * 100.10 + 200.20 = 300.30
 */
export function sumAmounts(amounts: number[]): number {
  const totalPaise = amounts.reduce((total, amount) => {
    const next = total + toPaise(amount);

    if (!Number.isSafeInteger(next)) {
      throw new Error("Monetary total is too large");
    }

    return next;
  }, 0);

  return toRupees(totalPaise);
}

/**
 * Calculate income, expenses, and net balance.
 *
 * Accepts records containing an amount field,
 * including Shavro's Income and Expense objects.
 */
export function calculateFinancialTotals(
  incomes: AmountRecord[],
  expenses: AmountRecord[],
): FinancialTotals {
  const incomePaise = incomes.reduce((total, income) => {
    const next = total + toPaise(income.amount);

    if (!Number.isSafeInteger(next)) {
      throw new Error("Income total is too large");
    }

    return next;
  }, 0);

  const expensePaise = expenses.reduce((total, expense) => {
    const next = total + toPaise(expense.amount);

    if (!Number.isSafeInteger(next)) {
      throw new Error("Expense total is too large");
    }

    return next;
  }, 0);

  const balancePaise = incomePaise - expensePaise;

  if (!Number.isSafeInteger(balancePaise)) {
    throw new Error("Net balance is too large");
  }

  return {
    totalIncome: toRupees(incomePaise),
    totalExpenses: toRupees(expensePaise),
    netBalance: toRupees(balancePaise),
  };
}

/**
 * Format an amount in Indian rupees.
 *
 * Example:
 * 2859.5 -> ₹2,859.50
 */
export function formatINR(amount: number): string {
  const rounded = toRupees(toPaise(amount));

  return `₹${rounded.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
