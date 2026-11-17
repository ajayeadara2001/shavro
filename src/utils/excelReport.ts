import * as XLSX from "@redoper1/xlsx-js-style";

import type { Transaction } from "../types/transaction";

import {
  getReportTransactions,
  validateReportDateRange,
  type ReportDateRange,
} from "./reportDateRange";

import {
  EMPTY_CUSTOM_OPTION_LABELS,
  getTransactionCategoryLabel,
  getTransactionPaymentLabel,
  type CustomOptionLabels,
} from "./customOptionLabels";

import { toPaise, toRupees } from "./money";

export interface ExcelReportResult {
  base64: string;
  fileName: string;
  transactionCount: number;
  incomeCount: number;
  expenseCount: number;
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
}

type CellValue = string | number;
type ReportRow = CellValue[];

interface MonthlyTotals {
  incomePaise: number;
  expensePaise: number;
  incomeCount: number;
  expenseCount: number;
}

interface ExpenseCategoryTotals {
  name: string;
  totalPaise: number;
  transactionCount: number;
}

// Preserve the existing numeric formatting.
const MONEY_FORMAT = "#,##0.00;[Red](#,##0.00)";

// Only bold headings.
// No fills, borders or alignment changes.
const HEADING_STYLE = {
  font: {
    bold: true,
  },
};

function boldHeadingRow(
  sheet: XLSX.WorkSheet,
  rowIndex: number,
  columnCount: number,
): void {
  for (let column = 0; column < columnCount; column++) {
    const address = XLSX.utils.encode_cell({
      r: rowIndex,
      c: column,
    });

    const cell = sheet[address];

    if (cell) {
      cell.s = HEADING_STYLE;
    }
  }
}

// Prevent user-entered text from being
// interpreted as an Excel formula.
function safeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const text = value.trim();

  if (/^[=+\-@\t\r\n]/.test(text)) {
    return `'${text}`;
  }

  return text;
}

function optionalText(data: object, field: string): string {
  const record = data as Record<string, unknown>;

  return safeText(record[field]);
}

// Resolve built-in and custom categories
// using the existing shared utility.
function getCategory(
  transaction: Transaction,
  labels: CustomOptionLabels,
): string {
  return safeText(getTransactionCategoryLabel(transaction, labels));
}

// Phase 16: Resolve income Received Via.
//
// Older income records may not contain
// paymentMethodId or otherMethodName.
//
// Saved custom method IDs are resolved
// using the same shared payment-method map
// used for expenses.
function getIncomeReceivedVia(
  transaction: Extract<Transaction, { type: "INCOME" }>,
  labels: CustomOptionLabels,
): string {
  const income = transaction.data;

  const methodId = income.paymentMethodId;

  // Historical income transactions.
  if (!methodId?.trim()) {
    return "Not recorded";
  }

  // Built-in Other with a manual name.
  if (methodId === "other") {
    return safeText(income.otherMethodName?.trim() || "Other");
  }

  // Built-in UPI abbreviation.
  if (methodId === "upi") {
    return "UPI";
  }

  // User-created payment method.
  const customMethodName = labels.paymentMethods[methodId];

  if (customMethodName) {
    return safeText(customMethodName);
  }

  // Other built-in methods:
  // bank_transfer -> Bank Transfer
  // debit_card -> Debit Card
  // credit_card -> Credit Card
  return safeText(
    methodId
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase()),
  );
}

// Payment Method column for both income
// and expense transactions.
//
// Expense logic is unchanged.
// Income now displays Received Via.
function getPaymentMethod(
  transaction: Transaction,
  labels: CustomOptionLabels,
): string {
  if (transaction.type === "INCOME") {
    return getIncomeReceivedVia(transaction, labels);
  }

  return safeText(getTransactionPaymentLabel(transaction, labels));
}

function getNotes(transaction: Transaction): string {
  return optionalText(transaction.data, "notes");
}

function getAmount(transaction: Transaction): number {
  return toRupees(toPaise(transaction.data.amount));
}

// Shared transaction row format.
// Preserve the existing six columns.
function transactionToRow(
  transaction: Transaction,
  labels: CustomOptionLabels,
): ReportRow {
  return [
    transaction.data.transactionDate,
    transaction.type === "INCOME" ? "Income" : "Expense",
    getCategory(transaction, labels),
    getPaymentMethod(transaction, labels),
    getAmount(transaction),
    getNotes(transaction),
  ];
}

function sortTransactions(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) =>
    a.data.transactionDate.localeCompare(b.data.transactionDate),
  );
}

// Preserve existing worksheet layout,
// column widths and monetary formatting.
function createSheet(
  rows: ReportRow[],
  columnWidths: number[],
  moneyColumns: number[] = [],
): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet(rows);

  sheet["!cols"] = columnWidths.map((width) => ({
    wch: width,
  }));

  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");

  for (const column of moneyColumns) {
    for (let row = 1; row <= range.e.r; row++) {
      const address = XLSX.utils.encode_cell({
        r: row,
        c: column,
      });

      const cell = sheet[address];

      if (cell && cell.t === "n") {
        cell.z = MONEY_FORMAT;
      }
    }
  }

  boldHeadingRow(sheet, 0, columnWidths.length);

  return sheet;
}

function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);

  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

// Preserve the readable expense category
// breakdown and grouping behavior.
//
// Different Other expense names remain
// separate categories.
function buildExpenseCategoryRows(
  expenseTransactions: Transaction[],
  labels: CustomOptionLabels,
  totalExpensePaise: number,
): ReportRow[] {
  const rows: ReportRow[] = [
    ["Expense Category", "Total Spent (INR)", "Transactions", "Percentage (%)"],
  ];

  const categoryMap = new Map<string, ExpenseCategoryTotals>();

  for (const transaction of expenseTransactions) {
    if (transaction.type !== "EXPENSE") {
      continue;
    }

    const categoryName = getCategory(transaction, labels);

    // Match category names without
    // differentiating letter case.
    const key = categoryName.trim().toLocaleLowerCase();

    const amountPaise = toPaise(transaction.data.amount);

    const existing = categoryMap.get(key);

    if (existing) {
      existing.totalPaise += amountPaise;
      existing.transactionCount++;
    } else {
      categoryMap.set(key, {
        name: categoryName,
        totalPaise: amountPaise,
        transactionCount: 1,
      });
    }
  }

  const categories = Array.from(categoryMap.values()).sort(
    (first, second) =>
      second.totalPaise - first.totalPaise ||
      first.name.localeCompare(second.name),
  );

  for (const category of categories) {
    const percentage =
      totalExpensePaise > 0
        ? (category.totalPaise / totalExpensePaise) * 100
        : 0;

    rows.push([
      safeText(category.name),
      toRupees(category.totalPaise),
      category.transactionCount,
      Number(percentage.toFixed(2)),
    ]);
  }

  return rows;
}

export function generateExcelReport(
  transactions: Transaction[],
  range: ReportDateRange,
  labels: CustomOptionLabels = EMPTY_CUSTOM_OPTION_LABELS,
): ExcelReportResult {
  const validation = validateReportDateRange(range);

  if (!validation.valid) {
    throw new Error(validation.error ?? "Invalid date range.");
  }

  // Inclusive filtering.
  // Both income and expenses are included.
  const filtered = sortTransactions(getReportTransactions(transactions, range));

  const incomeTransactions = filtered.filter(
    (transaction) => transaction.type === "INCOME",
  );

  const expenseTransactions = filtered.filter(
    (transaction) => transaction.type === "EXPENSE",
  );

  let incomePaise = 0;
  let expensePaise = 0;

  for (const transaction of filtered) {
    const amountPaise = toPaise(transaction.data.amount);

    if (transaction.type === "INCOME") {
      incomePaise += amountPaise;
    } else {
      expensePaise += amountPaise;
    }
  }

  const totalIncome = toRupees(incomePaise);

  const totalExpenses = toRupees(expensePaise);

  const netBalance = toRupees(incomePaise - expensePaise);

  const workbook = XLSX.utils.book_new();

  // ======================================
  // SHEET 1: FINANCIAL SUMMARY
  // ======================================

  const summaryRows: ReportRow[] = [
    ["SHAVRO FINANCIAL REPORT", ""],
    ["From Date", range.fromDate],
    ["To Date", range.toDate],
    ["", ""],
    ["Total Income", totalIncome],
    ["Total Expenses", totalExpenses],
    ["Net Balance", netBalance],
    ["", ""],
    ["Income Transactions", incomeTransactions.length],
    ["Expense Transactions", expenseTransactions.length],
    ["Total Transactions", filtered.length],
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);

  summarySheet["!cols"] = [{ wch: 28 }, { wch: 24 }];

  for (const row of [4, 5, 6]) {
    const address = XLSX.utils.encode_cell({
      r: row,
      c: 1,
    });

    const cell = summarySheet[address];

    if (cell && cell.t === "n") {
      cell.z = MONEY_FORMAT;
    }
  }

  boldHeadingRow(summarySheet, 0, 2);

  XLSX.utils.book_append_sheet(workbook, summarySheet, "Financial Summary");

  // Shared table headings.
  //
  // "Payment Method" is preserved so the
  // existing Excel format does not change.
  // For income, it contains Received Via.
  const transactionHeader: ReportRow = [
    "Date",
    "Type",
    "Category",
    "Payment Method",
    "Amount (INR)",
    "Notes",
  ];

  // ======================================
  // SHEET 2: ALL TRANSACTIONS
  // ======================================

  const allRows: ReportRow[] = [
    transactionHeader,
    ...filtered.map((transaction) => transactionToRow(transaction, labels)),
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    createSheet(allRows, [16, 14, 24, 22, 20, 40], [4]),
    "All Transactions",
  );

  // ======================================
  // SHEET 3: INCOME DETAILS
  // ======================================

  // Income Received Via now appears in
  // column D, including custom methods.
  const incomeRows: ReportRow[] = [
    transactionHeader,
    ...incomeTransactions.map((transaction) =>
      transactionToRow(transaction, labels),
    ),
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    createSheet(incomeRows, [16, 14, 24, 22, 20, 40], [4]),
    "Income Details",
  );

  // ======================================
  // SHEET 4: EXPENSE DETAILS
  // ======================================

  // Existing expense payment-method logic
  // remains unchanged.
  const expenseRows: ReportRow[] = [
    transactionHeader,
    ...expenseTransactions.map((transaction) =>
      transactionToRow(transaction, labels),
    ),
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    createSheet(expenseRows, [16, 14, 24, 22, 20, 40], [4]),
    "Expense Details",
  );

  // ======================================
  // SHEET 5: MONTHLY COMPARISON
  // ======================================

  const monthlyMap = new Map<string, MonthlyTotals>();

  const firstMonth = range.fromDate.slice(0, 7);

  const lastMonth = range.toDate.slice(0, 7);

  let monthKey = firstMonth;

  // Include months even when no
  // transactions were recorded.
  while (monthKey <= lastMonth) {
    monthlyMap.set(monthKey, {
      incomePaise: 0,
      expensePaise: 0,
      incomeCount: 0,
      expenseCount: 0,
    });

    const [year, month] = monthKey.split("-").map(Number);

    const nextYear = month === 12 ? year + 1 : year;

    const nextMonth = month === 12 ? 1 : month + 1;

    monthKey = `${nextYear}-` + String(nextMonth).padStart(2, "0");
  }

  for (const transaction of filtered) {
    const key = transaction.data.transactionDate.slice(0, 7);

    const totals = monthlyMap.get(key);

    if (!totals) {
      continue;
    }

    const amountPaise = toPaise(transaction.data.amount);

    if (transaction.type === "INCOME") {
      totals.incomePaise += amountPaise;
      totals.incomeCount++;
    } else {
      totals.expensePaise += amountPaise;
      totals.expenseCount++;
    }
  }

  const monthlyRows: ReportRow[] = [
    [
      "Month",
      "Income (INR)",
      "Expenses (INR)",
      "Net Balance (INR)",
      "Income Count",
      "Expense Count",
    ],
  ];

  for (const [key, totals] of monthlyMap) {
    monthlyRows.push([
      getMonthLabel(key),
      toRupees(totals.incomePaise),
      toRupees(totals.expensePaise),
      toRupees(totals.incomePaise - totals.expensePaise),
      totals.incomeCount,
      totals.expenseCount,
    ]);
  }

  XLSX.utils.book_append_sheet(
    workbook,
    createSheet(monthlyRows, [18, 20, 20, 22, 18, 18], [1, 2, 3]),
    "Monthly Comparison",
  );

  // ======================================
  // SHEET 6: CATEGORY BREAKDOWN
  // ======================================

  // Preserve expense-only category
  // breakdown using readable labels.
  const categoryRows = buildExpenseCategoryRows(
    expenseTransactions,
    labels,
    expensePaise,
  );

  XLSX.utils.book_append_sheet(
    workbook,
    createSheet(categoryRows, [28, 24, 18, 20], [1]),
    "Category Breakdown",
  );

  // Preserve Base64 export and formatting.
  const base64 = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "base64",
    compression: true,
    cellStyles: true,
  });

  const fileName =
    `Shavro_Report_` + `${range.fromDate}_to_` + `${range.toDate}.xlsx`;

  return {
    base64,
    fileName,
    transactionCount: filtered.length,
    incomeCount: incomeTransactions.length,
    expenseCount: expenseTransactions.length,
    totalIncome,
    totalExpenses,
    netBalance,
  };
}
