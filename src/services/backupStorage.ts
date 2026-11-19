import { getExpenses } from "./expenseStorage";
import { getIncomes } from "./incomeStorage";

import {
  getCustomCategories,
  getCustomPaymentMethods,
} from "./customOptionsStorage";

import { runExclusiveStorageOperation } from "./storageOperationGuard";

import { BACKUP_FORMAT, BACKUP_VERSION } from "../types/backup";

import type { ShavroBackup, ShavroBackupSummary } from "../types/backup";

import {
  validateShavroBackup,
  getShavroBackupSummary,
} from "../utils/backupValidation";

/**
 * Build a complete Shavro backup using
 * the application's active storage services.
 *
 * Read all four collections while holding
 * the exclusive storage-operation guard.
 *
 * This prevents ordinary financial writes
 * from interleaving with backup creation.
 *
 * Existing web and native storage routing
 * remains unchanged.
 *
 * This operation is read-only.
 */
export async function createShavroBackup(): Promise<ShavroBackup> {
  return runExclusiveStorageOperation(async () => {
    const [expenses, incomes, customCategories, customPaymentMethods] =
      await Promise.all([
        getExpenses(),
        getIncomes(),
        getCustomCategories(),
        getCustomPaymentMethods(),
      ]);

    const backup: ShavroBackup = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),

      data: {
        expenses,
        incomes,
        customCategories,
        customPaymentMethods,
      },
    };

    // Validate the entire snapshot
    // before returning it.
    return validateShavroBackup(backup);
  });
}

/**
 * Serialize all saved financial data
 * into the existing Shavro JSON format.
 *
 * No storage mutation occurs.
 */
export async function createShavroBackupJson(): Promise<string> {
  const backup = await createShavroBackup();

  return JSON.stringify(backup, null, 2);
}

/**
 * Generate a readable backup filename.
 *
 * Example:
 * Shavro_Backup_2026-11-18_1130.json
 */
export function createShavroBackupFilename(date: Date = new Date()): string {
  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  const hour = String(date.getHours()).padStart(2, "0");

  const minute = String(date.getMinutes()).padStart(2, "0");

  return `Shavro_Backup_${year}-${month}-${day}_` + `${hour}${minute}.json`;
}

/**
 * Preview the record counts in the
 * current storage provider.
 */
export async function getCurrentBackupSummary(): Promise<ShavroBackupSummary> {
  const backup = await createShavroBackup();

  return getShavroBackupSummary(backup);
}
