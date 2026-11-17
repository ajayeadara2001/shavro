import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockStore = new Map<string, string>();

jest.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStore.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockStore.delete(key);
    }),
  },
}));

import {
  RESTORE_COMPLETION_KEY,
  createRestoreCompletionMarker,
  clearRestoreCompletionMarker,
  getRestoreCompletionMarker,
  hasPendingRestoreCompletion,
  assertNoPendingRestoreCompletion,
} from "../restoreCompletionState";

const BACKUP_DATE = "2026-11-17T06:00:00.000Z";

describe("Shavro restore completion state", () => {
  beforeEach(() => {
    mockStore.clear();
  });

  test("starts without a completion marker", async () => {
    await expect(hasPendingRestoreCompletion()).resolves.toBe(false);

    await expect(getRestoreCompletionMarker()).resolves.toBeNull();
  });

  test("creates a valid finalizing marker", async () => {
    await createRestoreCompletionMarker(BACKUP_DATE);

    const marker = await getRestoreCompletionMarker();

    expect(marker?.version).toBe(1);
    expect(marker?.status).toBe("finalizing");
    expect(marker?.backupCreatedAt).toBe(BACKUP_DATE);

    expect(mockStore.has(RESTORE_COMPLETION_KEY)).toBe(true);
  });

  test("prevents replacing an existing marker", async () => {
    await createRestoreCompletionMarker(BACKUP_DATE);

    const original = mockStore.get(RESTORE_COMPLETION_KEY);

    await expect(createRestoreCompletionMarker(BACKUP_DATE)).rejects.toThrow(
      /unresolved restore completion state/i,
    );

    expect(mockStore.get(RESTORE_COMPLETION_KEY)).toBe(original);
  });

  test("blocks financial writes when completion is pending", async () => {
    await createRestoreCompletionMarker(BACKUP_DATE);

    await expect(assertNoPendingRestoreCompletion()).rejects.toThrow(
      /unresolved backup restoration/i,
    );
  });

  test("rejects corrupted completion markers", async () => {
    mockStore.set(RESTORE_COMPLETION_KEY, "{invalid-json");

    await expect(getRestoreCompletionMarker()).rejects.toThrow(/unreadable/i);

    await expect(assertNoPendingRestoreCompletion()).rejects.toThrow(
      /unresolved backup restoration/i,
    );

    expect(mockStore.has(RESTORE_COMPLETION_KEY)).toBe(true);
  });

  test("clears completion marker after explicit finalization", async () => {
    await createRestoreCompletionMarker(BACKUP_DATE);

    await clearRestoreCompletionMarker();

    await expect(hasPendingRestoreCompletion()).resolves.toBe(false);

    await expect(assertNoPendingRestoreCompletion()).resolves.toBeUndefined();
  });

  test("rejects invalid backup dates", async () => {
    await expect(createRestoreCompletionMarker("not-a-date")).rejects.toThrow(
      /invalid backup creation date/i,
    );

    expect(mockStore.has(RESTORE_COMPLETION_KEY)).toBe(false);
  });
});
