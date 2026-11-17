import {
  beforeEach,
  afterEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";

// =========================================
// MOCK STORAGE
// =========================================

const mockStore = new Map<string, string>();

let mockFailReadKey: string | null = null;

// =========================================
// STORAGE KEYS
// =========================================

const RESTORE_INTEGRITY_KEY = "shavro_restore_integrity_v1";

const TEST_DATE = "2026-11-17T06:00:00.000Z";

// =========================================
// PLATFORM MOCKS
// =========================================

jest.mock("react-native", () => ({
  Platform: {
    OS: "android",
  },
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,

  default: {
    getItem: jest.fn(async (key: string) => {
      if (key === mockFailReadKey) {
        throw new Error("Simulated storage read failure");
      }

      return mockStore.get(key) ?? null;
    }),

    setItem: jest.fn(async (key: string, value: string) => {
      mockStore.set(key, value);
    }),

    removeItem: jest.fn(async (key: string) => {
      mockStore.delete(key);
    }),
  },
}));

// =========================================
// SERVICE IMPORTS
// =========================================

import {
  RESTORE_RECOVERY_STORAGE_KEY,
  getRestoreRecoveryJournalRaw,
  isRestoreRecoveryPending,
  assertNoPendingRestoreRecovery,
} from "../restoreRecoveryState";

import { RESTORE_COMPLETION_KEY } from "../restoreCompletionState";

// =========================================
// TEST DATA HELPERS
// =========================================

function createRecoveryJournal(): void {
  mockStore.set(
    RESTORE_RECOVERY_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      createdAt: TEST_DATE,

      snapshot: {
        expenses: "[]",
        incomes: "[]",
        customCategories: "[]",
        customPaymentMethods: "[]",
      },
    }),
  );
}

function createCompletionMarker(): void {
  mockStore.set(
    RESTORE_COMPLETION_KEY,
    JSON.stringify({
      version: 1,
      createdAt: TEST_DATE,
      backupCreatedAt: TEST_DATE,
      status: "finalizing",
    }),
  );
}

/**
 * Create an independent persistent
 * restore integrity record.
 *
 * This record remains separate from
 * the recovery journal and completion marker.
 */
function createIntegrityState(status: "finalizing" | "committed"): void {
  mockStore.set(
    RESTORE_INTEGRITY_KEY,
    JSON.stringify({
      version: 1,
      createdAt: TEST_DATE,
      backupCreatedAt: TEST_DATE,
      status,
    }),
  );
}

// =========================================
// RESTORE SAFETY TEST SUITE
// =========================================

describe("Shavro combined restore safety checks", () => {
  beforeEach(() => {
    mockStore.clear();

    mockFailReadKey = null;

    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =======================================
  // TEST 1
  // NO SAFETY RECORDS
  // =======================================

  test("allows financial writes when all restore safety records are absent", async () => {
    await expect(isRestoreRecoveryPending()).resolves.toBe(false);

    await expect(assertNoPendingRestoreRecovery()).resolves.toBeUndefined();
  });

  // =======================================
  // TEST 2
  // RECOVERY JOURNAL EXISTS
  // =======================================

  test("blocks financial writes when recovery journal exists", async () => {
    createRecoveryJournal();

    await expect(isRestoreRecoveryPending()).resolves.toBe(true);

    await expect(assertNoPendingRestoreRecovery()).rejects.toThrow(
      /unfinished backup recovery/i,
    );
  });

  // =======================================
  // TEST 3
  // COMPLETION MARKER EXISTS
  // =======================================

  test("blocks financial writes when only completion marker exists", async () => {
    createCompletionMarker();

    await expect(isRestoreRecoveryPending()).resolves.toBe(false);

    await expect(assertNoPendingRestoreRecovery()).rejects.toThrow();

    expect(mockStore.has(RESTORE_COMPLETION_KEY)).toBe(true);
  });

  // =======================================
  // TEST 4
  // JOURNAL AND COMPLETION MARKER
  // =======================================

  test("blocks financial writes when both safety records exist", async () => {
    createRecoveryJournal();

    createCompletionMarker();

    await expect(assertNoPendingRestoreRecovery()).rejects.toThrow();

    expect(mockStore.has(RESTORE_RECOVERY_STORAGE_KEY)).toBe(true);

    expect(mockStore.has(RESTORE_COMPLETION_KEY)).toBe(true);
  });

  // =======================================
  // TEST 5
  // CORRUPTED COMPLETION MARKER
  // =======================================

  test("blocks financial writes when completion marker is corrupted", async () => {
    mockStore.set(RESTORE_COMPLETION_KEY, "{invalid-json");

    await expect(assertNoPendingRestoreRecovery()).rejects.toThrow();

    // Corrupted safety data must never
    // be removed automatically.
    expect(mockStore.get(RESTORE_COMPLETION_KEY)).toBe("{invalid-json");
  });

  // =======================================
  // TEST 6
  // RECOVERY STORAGE READ FAILURE
  // =======================================

  test("blocks financial writes when recovery storage cannot be read", async () => {
    mockFailReadKey = RESTORE_RECOVERY_STORAGE_KEY;

    await expect(getRestoreRecoveryJournalRaw()).rejects.toThrow(
      /simulated storage read failure/i,
    );

    await expect(assertNoPendingRestoreRecovery()).rejects.toThrow(
      /cannot verify/i,
    );
  });

  // =======================================
  // TEST 7 — NEW
  // UNRESOLVED INTEGRITY STATE
  // =======================================

  test("blocks financial writes when integrity is finalizing without journal or completion marker", async () => {
    createIntegrityState("finalizing");

    // Older safety records are absent.
    expect(mockStore.has(RESTORE_RECOVERY_STORAGE_KEY)).toBe(false);

    expect(mockStore.has(RESTORE_COMPLETION_KEY)).toBe(false);

    // Independent finalization evidence
    // must block financial writes.
    await expect(assertNoPendingRestoreRecovery()).rejects.toThrow(
      /unresolved restore integrity/i,
    );

    // Preserve the integrity record.
    expect(mockStore.has(RESTORE_INTEGRITY_KEY)).toBe(true);

    const state = JSON.parse(mockStore.get(RESTORE_INTEGRITY_KEY)!);

    expect(state.status).toBe("finalizing");
  });

  // =======================================
  // TEST 8 — NEW
  // COMMITTED INTEGRITY STATE
  // =======================================

  test("allows financial writes when integrity is committed and no other safety records exist", async () => {
    createIntegrityState("committed");

    await expect(assertNoPendingRestoreRecovery()).resolves.toBeUndefined();

    // Committed evidence is retained.
    expect(mockStore.has(RESTORE_INTEGRITY_KEY)).toBe(true);

    const state = JSON.parse(mockStore.get(RESTORE_INTEGRITY_KEY)!);

    expect(state.status).toBe("committed");
  });

  // =======================================
  // TEST 9 — NEW
  // CORRUPTED INTEGRITY STATE
  // =======================================

  test("blocks financial writes when restore integrity state is corrupted", async () => {
    mockStore.set(RESTORE_INTEGRITY_KEY, "{invalid-json");

    await expect(assertNoPendingRestoreRecovery()).rejects.toThrow(
      /cannot verify restore integrity/i,
    );

    // Preserve corrupted evidence.
    expect(mockStore.get(RESTORE_INTEGRITY_KEY)).toBe("{invalid-json");
  });

  // =======================================
  // TEST 10 — NEW
  // INTEGRITY READ FAILURE
  // =======================================

  test("blocks financial writes when restore integrity storage cannot be inspected", async () => {
    createIntegrityState("finalizing");

    mockFailReadKey = RESTORE_INTEGRITY_KEY;

    await expect(assertNoPendingRestoreRecovery()).rejects.toThrow(
      /cannot verify restore integrity/i,
    );

    // Unresolved evidence must remain.
    expect(mockStore.has(RESTORE_INTEGRITY_KEY)).toBe(true);
  });
});
