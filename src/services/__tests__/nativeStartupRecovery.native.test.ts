import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import {
  recoverInterruptedRestore,
  assertShavroStorageWritable,
} from "../backupRestoreWrite";

import { assertNoPendingRestoreRecovery } from "../restoreRecoveryState";

import {
  getPersistedShavroStorageMode,
  getShavroStorageMode,
} from "../../database/sqliteStorageMode.native";

import { assertNoPendingSQLiteRestoreRecovery } from "../../database/sqliteRestoreRecovery.native";

import { reconcilePendingSQLiteRestore } from "../../database/sqliteRestoreReconciliation.native";

import { verifyNativeStartupRecovery } from "../nativeStartupRecovery.native";

// =========================================
// MOCKS
// =========================================

jest.mock("../backupRestoreWrite", () => {
  const j = require("@jest/globals").jest;

  return {
    recoverInterruptedRestore: j.fn(),
    assertShavroStorageWritable: j.fn(),
  };
});

jest.mock("../restoreRecoveryState", () => ({
  assertNoPendingRestoreRecovery: require("@jest/globals").jest.fn(),
}));

jest.mock("../../database/sqliteStorageMode.native", () => {
  const j = require("@jest/globals").jest;

  return {
    getPersistedShavroStorageMode: j.fn(),
    getShavroStorageMode: j.fn(),
  };
});

jest.mock("../../database/sqliteRestoreRecovery.native", () => ({
  assertNoPendingSQLiteRestoreRecovery: require("@jest/globals").jest.fn(),
}));

jest.mock("../../database/sqliteRestoreReconciliation.native", () => ({
  reconcilePendingSQLiteRestore: require("@jest/globals").jest.fn(),
}));

// =========================================
// TEST SUITE
// =========================================

describe("Native startup recovery safety", () => {
  beforeEach(() => {
    jest.resetAllMocks();

    jest
      .mocked(getPersistedShavroStorageMode)
      .mockResolvedValue("async-storage");

    jest.mocked(getShavroStorageMode).mockResolvedValue("sqlite");

    jest.mocked(reconcilePendingSQLiteRestore).mockResolvedValue({
      status: "no_pending_restore",
      operationId: null,
      reason: "No pending SQLite restore journal.",
    });
  });

  function selectSQLite(): void {
    jest.mocked(getPersistedShavroStorageMode).mockResolvedValue("sqlite");
  }

  // =====================================
  // TEST 1 — LEGACY RECOVERY
  // =====================================

  it("preserves legacy AsyncStorage recovery", async () => {
    await expect(verifyNativeStartupRecovery()).resolves.toBeUndefined();

    expect(recoverInterruptedRestore).toHaveBeenCalledTimes(1);

    expect(assertNoPendingRestoreRecovery).toHaveBeenCalledTimes(1);

    expect(reconcilePendingSQLiteRestore).not.toHaveBeenCalled();

    expect(getShavroStorageMode).not.toHaveBeenCalled();
  });

  // =====================================
  // TEST 2 — SQLITE READY
  // =====================================

  it("verifies SQLite when no recovery marker exists", async () => {
    selectSQLite();

    await expect(verifyNativeStartupRecovery()).resolves.toBeUndefined();

    expect(reconcilePendingSQLiteRestore).toHaveBeenCalledTimes(1);

    expect(getShavroStorageMode).toHaveBeenCalledTimes(1);

    expect(assertNoPendingSQLiteRestoreRecovery).toHaveBeenCalledTimes(1);

    expect(assertShavroStorageWritable).toHaveBeenCalledTimes(2);

    expect(recoverInterruptedRestore).not.toHaveBeenCalled();
  });

  // =====================================
  // TEST 3 — COMMITTED BUT PENDING
  // =====================================

  it("blocks verified committed data while finalization is pending", async () => {
    selectSQLite();

    jest.mocked(reconcilePendingSQLiteRestore).mockResolvedValue({
      status: "verified_committed",
      operationId: "restore-001",
      reason: "Records match but recovery remains pending.",
    });

    await expect(verifyNativeStartupRecovery()).rejects.toThrow(
      "restore finalization remains pending",
    );

    expect(getShavroStorageMode).not.toHaveBeenCalled();
  });

  // =====================================
  // TEST 4 — UNRESOLVED RESTORE
  // =====================================

  it("blocks unresolved SQLite restore", async () => {
    selectSQLite();

    jest.mocked(reconcilePendingSQLiteRestore).mockResolvedValue({
      status: "unresolved",
      operationId: "restore-002",
      reason: "SQLite records do not match.",
    });

    await expect(verifyNativeStartupRecovery()).rejects.toThrow(
      "SQLite restore recovery is unresolved",
    );

    expect(recoverInterruptedRestore).not.toHaveBeenCalled();

    expect(getShavroStorageMode).not.toHaveBeenCalled();
  });

  // =====================================
  // TEST 5 — PROVIDER CHANGE
  // =====================================

  it("blocks startup when provider changes during verification", async () => {
    selectSQLite();

    jest
      .mocked(getPersistedShavroStorageMode)
      .mockResolvedValueOnce("sqlite")
      .mockResolvedValueOnce("async-storage");

    await expect(verifyNativeStartupRecovery()).rejects.toThrow(
      "storage provider changed",
    );

    expect(assertNoPendingSQLiteRestoreRecovery).not.toHaveBeenCalled();
  });

  // =====================================
  // TEST 6 — REPEATED STARTUP CHECKS
  // =====================================

  it("rechecks recovery on every startup verification", async () => {
    selectSQLite();

    await verifyNativeStartupRecovery();

    await verifyNativeStartupRecovery();

    expect(reconcilePendingSQLiteRestore).toHaveBeenCalledTimes(2);

    expect(assertNoPendingSQLiteRestoreRecovery).toHaveBeenCalledTimes(2);

    expect(assertShavroStorageWritable).toHaveBeenCalledTimes(4);
  });

  // =====================================
  // TEST 7 — REPEATED FAILURE
  // =====================================

  it("does not bypass unresolved recovery on retry", async () => {
    selectSQLite();

    jest.mocked(reconcilePendingSQLiteRestore).mockResolvedValue({
      status: "unresolved",
      operationId: "restore-retry",
      reason: "Recovery remains pending.",
    });

    await expect(verifyNativeStartupRecovery()).rejects.toThrow(
      "SQLite restore recovery is unresolved",
    );

    await expect(verifyNativeStartupRecovery()).rejects.toThrow(
      "SQLite restore recovery is unresolved",
    );

    expect(reconcilePendingSQLiteRestore).toHaveBeenCalledTimes(2);

    expect(getShavroStorageMode).not.toHaveBeenCalled();

    expect(recoverInterruptedRestore).not.toHaveBeenCalled();
  });

  // =====================================
  // TEST 8 — LATE RECOVERY MARKER
  // =====================================

  it("blocks startup if a recovery marker appears during verification", async () => {
    selectSQLite();

    jest
      .mocked(assertNoPendingSQLiteRestoreRecovery)
      .mockRejectedValueOnce(new Error("An SQLite restore is unresolved."));

    await expect(verifyNativeStartupRecovery()).rejects.toThrow(
      "An SQLite restore is unresolved",
    );

    expect(reconcilePendingSQLiteRestore).toHaveBeenCalledTimes(1);

    expect(getShavroStorageMode).toHaveBeenCalledTimes(1);
  });

  // =====================================
  // TEST 9 — DATABASE READINESS FAILURE
  // =====================================

  it("blocks startup when SQLite readiness fails", async () => {
    selectSQLite();

    jest
      .mocked(getShavroStorageMode)
      .mockRejectedValueOnce(
        new Error("Shavro SQLite integrity check failed."),
      );

    await expect(verifyNativeStartupRecovery()).rejects.toThrow(
      "SQLite integrity check failed",
    );

    expect(assertNoPendingSQLiteRestoreRecovery).not.toHaveBeenCalled();
  });

  // =====================================
  // TEST 10 — FINAL LEGACY SAFETY
  // =====================================

  it("blocks startup when final restore safety verification fails", async () => {
    selectSQLite();

    jest
      .mocked(assertShavroStorageWritable)
      .mockImplementationOnce(async () => undefined)
      .mockRejectedValueOnce(new Error("Restore completion is unresolved."));

    await expect(verifyNativeStartupRecovery()).rejects.toThrow(
      "Restore completion is unresolved",
    );

    expect(assertShavroStorageWritable).toHaveBeenCalledTimes(2);
  });

  // =====================================
  // TEST 11 — LEGACY PROVIDER CHANGE
  // =====================================

  it("blocks legacy startup if the provider changes during recovery", async () => {
    jest
      .mocked(getPersistedShavroStorageMode)
      .mockResolvedValueOnce("async-storage")
      .mockResolvedValueOnce("sqlite");

    await expect(verifyNativeStartupRecovery()).rejects.toThrow(
      "storage mode changed during startup recovery",
    );

    expect(recoverInterruptedRestore).toHaveBeenCalledTimes(1);

    expect(reconcilePendingSQLiteRestore).not.toHaveBeenCalled();
  });
});
