import { Platform } from "react-native";

import type * as SQLite from "expo-sqlite";

import { getPendingSQLiteRestoreRecovery } from "./sqliteRestoreRecovery.native";

import { validateShavroBackup } from "../utils/backupValidation";

import {
  encodeAllCollections,
  decodeAllCollections,
  type SQLiteV4Collections,
  type ExpenseV4Row,
  type IncomeV4Row,
  type CategoryV4Row,
  type PaymentMethodV4Row,
} from "./sqliteFinancialCodec.native";

import { SQLITE_V4_MIGRATION_ID } from "./sqliteV4ImportTransaction.native";

import { runExclusiveStorageOperation } from "../services/storageOperationGuard";

// =========================================
// RESULT TYPES
// =========================================

export type SQLiteReconciliationStatus =
  | "no_pending_restore"
  | "verified_committed"
  | "unresolved";

export interface SQLiteReconciliationResult {
  status: SQLiteReconciliationStatus;
  operationId: string | null;
  reason: string;
}

interface VersionRow {
  user_version: number;
}

interface IntegrityRow {
  integrity_check: string;
}

interface MigrationRow {
  migration_id: string;
  status: string;
  completed_at: string | null;
}

// =========================================
// STRUCTURAL COMPARISON
// =========================================

function sameData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }

  if (Array.isArray(left) !== Array.isArray(right)) {
    return false;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => sameData(value, right[index]))
    );
  }

  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;

  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();

  if (
    aKeys.length !== bKeys.length ||
    aKeys.some((key, index) => key !== bKeys[index])
  ) {
    return false;
  }

  return aKeys.every((key) => sameData(a[key], b[key]));
}

// =========================================
// DATABASE READINESS
// =========================================

async function verifyDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  const version = await db.getFirstAsync<VersionRow>("PRAGMA user_version");

  if (version?.user_version !== 4) {
    throw new Error("SQLite schema version 4 is required.");
  }

  const migration = await db.getAllAsync<MigrationRow>(
    `SELECT migration_id, status, completed_at
       FROM migration_state`,
  );

  if (
    migration.length !== 1 ||
    migration[0].migration_id !== SQLITE_V4_MIGRATION_ID ||
    migration[0].status !== "completed" ||
    !migration[0].completed_at
  ) {
    throw new Error("SQLite migration verification failed.");
  }

  const integrity = await db.getFirstAsync<IntegrityRow>(
    "PRAGMA integrity_check",
  );

  if (integrity?.integrity_check !== "ok") {
    throw new Error("SQLite database integrity verification failed.");
  }
}

// =========================================
// READ ALL FOUR COLLECTIONS
// =========================================

async function readDatabaseCollections(
  db: SQLite.SQLiteDatabase,
): Promise<SQLiteV4Collections> {
  const expenses = await db.getAllAsync<ExpenseV4Row>(
    "SELECT * FROM expenses ORDER BY position ASC",
  );

  const incomes = await db.getAllAsync<IncomeV4Row>(
    "SELECT * FROM incomes ORDER BY position ASC",
  );

  const categories = await db.getAllAsync<CategoryV4Row>(
    "SELECT * FROM custom_categories ORDER BY position ASC",
  );

  const paymentMethods = await db.getAllAsync<PaymentMethodV4Row>(
    "SELECT * FROM custom_payment_methods ORDER BY position ASC",
  );

  return {
    expenses,
    incomes,
    categories,
    paymentMethods,
  };
}

// =========================================
// READ-ONLY RECONCILIATION
// =========================================

/**
 * Investigates an interrupted SQLite restore.
 *
 * IMPORTANT:
 * - Does not modify financial records.
 * - Does not clear recovery markers.
 * - Does not change the active provider.
 * - Does not automatically retry a restore.
 *
 * Do not call while already holding
 * runExclusiveStorageOperation().
 */
export async function reconcilePendingSQLiteRestore(): Promise<SQLiteReconciliationResult> {
  if (Platform.OS === "web") {
    throw new Error("SQLite reconciliation is native-only.");
  }

  return runExclusiveStorageOperation(async () => {
    let operationId: string | null = null;

    try {
      // -----------------------------------
      // 1. READ PENDING JOURNAL
      // -----------------------------------

      const pending = await getPendingSQLiteRestoreRecovery();

      if (pending === null) {
        return {
          status: "no_pending_restore",
          operationId: null,
          reason: "No pending SQLite restore journal.",
        };
      }

      operationId = pending.operationId;

      // -----------------------------------
      // 2. REQUIRE RECOVERY SNAPSHOT
      // -----------------------------------

      if (pending.expectedSnapshot === undefined) {
        return {
          status: "unresolved",
          operationId,
          reason:
            "Legacy recovery journal has no " + "expected restore snapshot.",
        };
      }

      const snapshot = pending.expectedSnapshot;

      const validated = validateShavroBackup({
        format: "shavro-backup",
        version: 1,
        createdAt: pending.startedAt,
        data: {
          expenses: snapshot.expenses,
          incomes: snapshot.incomes,
          customCategories: snapshot.categories,
          customPaymentMethods: snapshot.paymentMethods,
        },
      });

      const validatedSnapshot = {
        expenses: validated.data.expenses,
        incomes: validated.data.incomes,
        categories: validated.data.customCategories,
        paymentMethods: validated.data.customPaymentMethods,
      };

      // Reject any validation that changes financial data.
      // Missing fields, null values and ordering matter.
      if (!sameData(validatedSnapshot, snapshot)) {
        throw new Error("Recovery snapshot validation changed financial data.");
      }

      // -----------------------------------
      // 3. VALIDATE LOSSLESS ENCODING
      // -----------------------------------

      const expected = encodeAllCollections(snapshot);

      const roundTrip = decodeAllCollections(expected);

      if (!sameData(roundTrip, snapshot)) {
        throw new Error("Recovery snapshot cannot be converted losslessly.");
      }

      // -----------------------------------
      // 4. OPEN SQLITE DIRECTLY
      // -----------------------------------
      //
      // Do not call getShavroStorageMode()
      // here. That function intentionally
      // rejects pending SQLite recovery.

      const { getShavroDatabase } =
        require("./shavroDatabase.native") as typeof import("./shavroDatabase.native");

      const db = await getShavroDatabase();

      // -----------------------------------
      // 5. VERIFY DATABASE
      // -----------------------------------

      await verifyDatabase(db);

      // -----------------------------------
      // 6. READ COMMITTED ROWS
      // -----------------------------------

      const actual = await readDatabaseCollections(db);

      // -----------------------------------
      // 7. COMPARE ALL SQL COLUMNS
      // -----------------------------------

      if (!sameData(actual, expected)) {
        return {
          status: "unresolved",
          operationId,
          reason:
            "SQLite records do not match " + "the intended restore snapshot.",
        };
      }

      // -----------------------------------
      // 8. VERIFY FINANCIAL ROUND TRIP
      // -----------------------------------

      const restored = decodeAllCollections(actual);

      if (!sameData(restored, snapshot)) {
        return {
          status: "unresolved",
          operationId,
          reason:
            "SQLite financial data does not " + "match the recovery snapshot.",
        };
      }

      const latestPending = await getPendingSQLiteRestoreRecovery();

      if (
        latestPending === null ||
        latestPending.operationId !== operationId ||
        !sameData(latestPending.expectedSnapshot, snapshot)
      ) {
        return {
          status: "unresolved",
          operationId,
          reason: "SQLite recovery journal changed during verification.",
        };
      }

      // -----------------------------------
      // 9. SUCCESS — REPORT ONLY
      // -----------------------------------

      return {
        status: "verified_committed",
        operationId,
        reason:
          "SQLite data matches the recovery " +
          "snapshot and integrity checks passed. " +
          "Recovery marker remains pending.",
      };
    } catch (error) {
      // Fail closed. Do not delete the journal.
      // Do not attempt to modify SQLite.

      return {
        status: "unresolved",
        operationId,
        reason:
          error instanceof Error
            ? error.message
            : "SQLite recovery verification failed.",
      };
    }
  });
}
