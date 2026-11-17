import type { Transaction } from "../types/transaction";

export interface ReportDateRange {
  fromDate: string;
  toDate: string;
}

export interface DateRangeValidation {
  valid: boolean;
  error: string | null;
}

// Validate an exact YYYY-MM-DD date.
export function isValidReportDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(0);

  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

// Validate the selected export period.
export function validateReportDateRange(
  range: ReportDateRange,
): DateRangeValidation {
  if (!range.fromDate || !range.toDate) {
    return {
      valid: false,
      error: "Please select both dates.",
    };
  }

  if (!isValidReportDate(range.fromDate) || !isValidReportDate(range.toDate)) {
    return {
      valid: false,
      error: "Please select valid dates.",
    };
  }

  if (range.fromDate > range.toDate) {
    return {
      valid: false,
      error: "From Date cannot be after To Date.",
    };
  }

  return {
    valid: true,
    error: null,
  };
}

// Return both income and expense transactions
// within the selected dates, inclusive.
export function getReportTransactions(
  transactions: Transaction[],
  range: ReportDateRange,
): Transaction[] {
  const validation = validateReportDateRange(range);

  if (!validation.valid) {
    throw new Error(validation.error ?? "Invalid report date range.");
  }

  return transactions.filter((transaction) => {
    const date = transaction.data.transactionDate;

    return date >= range.fromDate && date <= range.toDate;
  });
}

// Build a default range for the current year.
export function getCurrentYearReportRange(
  today: Date = new Date(),
): ReportDateRange {
  const year = today.getFullYear();

  const todayString = [
    year,
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  return {
    fromDate: `${year}-01-01`,
    toDate: todayString,
  };
}

// Create a safe filename for the report.
export function createReportFileName(range: ReportDateRange): string {
  const validation = validateReportDateRange(range);

  if (!validation.valid) {
    throw new Error(validation.error ?? "Invalid report date range.");
  }

  return `Shavro_Report_` + `${range.fromDate}_to_` + `${range.toDate}.xlsx`;
}
