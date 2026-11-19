import { getShavroDatabase } from "./shavroDatabase.native";

import { runMigrationPreflight } from "./sqliteMigrationPreflight.native";

import { runExclusiveStorageOperation } from "../services/storageOperationGuard";

import { assertNoPendingRestoreRecovery } from "../services/restoreRecoveryState";

export interface SQLiteMigrationReadiness {
  ready: true;
  expenseCount: number;
  incomeCount: number;
  totalCount: number;
  databaseEmpty: true;
}

/**
 * Phase 19.5.3
 *
 * Check whether financial data is ready
 * for a future SQLite migration.
 *
 * This function does NOT copy or delete
 * any expense or income records.
 */
export async function checkSQLiteMigrationReadiness(): Promise<SQLiteMigrationReadiness> {
  return runExclusiveStorageOperation(async () => {
    // Stop if a backup restoration is
    // unfinished or its integrity is uncertain.
    await assertNoPendingRestoreRecovery();

    // Validate existing AsyncStorage data.
    const preflight = await runMigrationPreflight();

    // Open the already-created SQLite database.
    const db = await getShavroDatabase();

    // Do not proceed if the destination
    // already contains financial records.
    const expenseRows = await db.getFirstAsync<{
      count: number;
    }>("SELECT COUNT(*) AS count FROM expenses");

    const incomeRows = await db.getFirstAsync<{
      count: number;
    }>("SELECT COUNT(*) AS count FROM incomes");

    const migrationRows = await db.getFirstAsync<{
      count: number;
    }>("SELECT COUNT(*) AS count FROM migration_state");

    if (!expenseRows || !incomeRows || !migrationRows) {
      throw new Error("Unable to verify SQLite migration readiness.");
    }

    if (
      expenseRows.count !== 0 ||
      incomeRows.count !== 0 ||
      migrationRows.count !== 0
    ) {
      throw new Error(
        "SQLite already contains financial records or migration state. Manual investigation is required.",
      );
    }

    console.log("[Shavro Migration] Readiness verified.", {
      expenses: preflight.expenseCount,
      incomes: preflight.incomeCount,
      total: preflight.totalCount,
    });

    return {
      ready: true,
      expenseCount: preflight.expenseCount,
      incomeCount: preflight.incomeCount,
      totalCount: preflight.totalCount,
      databaseEmpty: true,
    };
  });
}
