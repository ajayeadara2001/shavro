
import type { Expense } from "./expense";
import type { Income } from "./income";

import type {
  CustomCategory,
  CustomPaymentMethod,
} from "../services/customOptionsStorage";

/**
 * Identifier used to recognize an official
 * Shavro backup file.
 */
export const BACKUP_FORMAT = "shavro-backup" as const;

/**
 * Version of the backup file structure.
 *
 * Increment this when introducing breaking
 * changes to the backup format.
 */
export const BACKUP_VERSION = 1 as const;

/**
 * All financial data included in a backup.
 *
 * Archived custom options must be included
 * because historical transactions may
 * still reference their IDs.
 */
export interface ShavroBackupData {
  expenses: Expense[];
  incomes: Income[];
  customCategories: CustomCategory[];
  customPaymentMethods: CustomPaymentMethod[];
}

/**
 * Complete versioned JSON backup.
 *
 * Original transaction IDs and createdAt
 * values must remain unchanged.
 */
export interface ShavroBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  data: ShavroBackupData;
}

/**
 * Optional counts for confirmation screens
 * and backup previews.
 */
export interface ShavroBackupSummary {
  createdAt: string;
  expenseCount: number;
  incomeCount: number;
  customCategoryCount: number;
  customPaymentMethodCount: number;
}
