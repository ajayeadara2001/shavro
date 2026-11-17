import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import type { ShavroBackup, ShavroBackupSummary } from "../types/backup";

import {
  parseShavroBackup,
  getShavroBackupSummary,
} from "../utils/backupValidation";

// Keep these keys identical to the
// existing Shavro storage services.
export const BACKUP_STORAGE_KEYS = {
  expenses: "shavro_expenses_v1",
  incomes: "shavro_income_v1",
  customCategories: "shavro_custom_categories_v1",
  customPaymentMethods: "shavro_custom_payment_methods_v1",
} as const;

export type BackupCollectionName = keyof typeof BACKUP_STORAGE_KEYS;

/**
 * The exact stored values before restoring.
 *
 * null means that the key did not exist.
 *
 * These values must be preserved exactly
 * for future rollback operations.
 */
export type RestoreStorageSnapshot = Record<
  BackupCollectionName,
  string | null
>;

/**
 * Result of validating an imported backup.
 *
 * No data is written during preparation.
 */
export interface PreparedShavroRestore {
  backup: ShavroBackup;
  summary: ShavroBackupSummary;
}

/**
 * Read a single storage key on either
 * web or Android/iOS.
 */
async function readStorageValue(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") {
      throw new Error("Browser storage is unavailable.");
    }

    return window.localStorage.getItem(key);
  }

  return AsyncStorage.getItem(key);
}

/**
 * Parse and validate a selected JSON backup.
 *
 * This function is safe to call before
 * showing the restore confirmation screen.
 *
 * It does not modify existing records.
 */
export function prepareShavroRestore(json: string): PreparedShavroRestore {
  if (!json.trim()) {
    throw new Error("The selected backup file is empty.");
  }

  const backup = parseShavroBackup(json);

  const summary = getShavroBackupSummary(backup);

  return {
    backup,
    summary,
  };
}

/**
 * Capture the current raw storage values.
 *
 * We keep the original serialized strings
 * rather than rebuilding records using
 * saveExpense() or saveIncome().
 *
 * This preserves the original IDs,
 * timestamps, optional fields and ordering.
 *
 * Important:
 * This is an in-memory snapshot only.
 * The next implementation step will persist
 * recovery data before any replacement.
 */
export async function captureRestoreStorageSnapshot(): Promise<RestoreStorageSnapshot> {
  const entries = Object.entries(BACKUP_STORAGE_KEYS) as Array<
    [BackupCollectionName, string]
  >;

  try {
    const values = await Promise.all(
      entries.map(([, storageKey]) => readStorageValue(storageKey)),
    );

    const snapshot = {} as RestoreStorageSnapshot;

    entries.forEach(([collection], index) => {
      snapshot[collection] = values[index];
    });

    return snapshot;
  } catch (error) {
    console.error("Failed to capture current Shavro storage:", error);

    throw new Error(
      "Unable to read existing records. Restore cannot continue.",
    );
  }
}

/**
 * Returns the names of the collections
 * that will eventually be replaced.
 *
 * This is used to explain the impact
 * of restoring data to the user.
 */
export function getRestoreCollectionNames(): BackupCollectionName[] {
  return ["expenses", "incomes", "customCategories", "customPaymentMethods"];
}

/**
 * Prepare a restore and read the existing
 * data before proceeding to confirmation.
 *
 * This function does not perform a restore.
 */
export async function inspectShavroRestore(json: string): Promise<{
  prepared: PreparedShavroRestore;
  existingSnapshot: RestoreStorageSnapshot;
}> {
  // Validate the imported file first.
  const prepared = prepareShavroRestore(json);

  // If validation fails, this step is
  // never reached.
  const existingSnapshot = await captureRestoreStorageSnapshot();

  return {
    prepared,
    existingSnapshot,
  };
}
