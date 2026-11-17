import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

/**
 * Shavro Restore Completion State
 *
 * Records that backup restoration entered
 * its final commit stage.
 *
 * The marker must be persisted BEFORE
 * removing the recovery journal.
 *
 * If the app crashes during finalization,
 * the marker allows startup checks to
 * detect an unresolved completion state.
 *
 * This module never deletes or modifies
 * financial transactions.
 */

export const RESTORE_COMPLETION_KEY = "shavro_restore_completion_v1";

const COMPLETION_VERSION = 1 as const;

export interface RestoreCompletionMarker {
  version: typeof COMPLETION_VERSION;
  createdAt: string;
  backupCreatedAt: string;
  status: "finalizing";
}

// -----------------------------------------
// STORAGE HELPERS
// -----------------------------------------

async function readRaw(): Promise<string | null> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") {
      throw new Error("Browser storage is unavailable.");
    }

    return window.localStorage.getItem(RESTORE_COMPLETION_KEY);
  }

  return AsyncStorage.getItem(RESTORE_COMPLETION_KEY);
}

async function writeRaw(value: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") {
      throw new Error("Browser storage is unavailable.");
    }

    window.localStorage.setItem(RESTORE_COMPLETION_KEY, value);

    return;
  }

  await AsyncStorage.setItem(RESTORE_COMPLETION_KEY, value);
}

async function removeRaw(): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") {
      throw new Error("Browser storage is unavailable.");
    }

    window.localStorage.removeItem(RESTORE_COMPLETION_KEY);

    return;
  }

  await AsyncStorage.removeItem(RESTORE_COMPLETION_KEY);
}

// -----------------------------------------
// MARKER VALIDATION
// -----------------------------------------

function parseCompletionMarker(raw: string): RestoreCompletionMarker {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Restore completion state is unreadable.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Restore completion state is invalid.");
  }

  const value = parsed as Record<string, unknown>;

  if (
    value.version !== COMPLETION_VERSION ||
    value.status !== "finalizing" ||
    typeof value.createdAt !== "string" ||
    typeof value.backupCreatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !Number.isFinite(Date.parse(value.backupCreatedAt))
  ) {
    throw new Error("Restore completion state is incompatible.");
  }

  return parsed as RestoreCompletionMarker;
}

// -----------------------------------------
// READ COMPLETION STATE
// -----------------------------------------

/**
 * Return true if any completion marker
 * exists, including malformed data.
 *
 * Read errors propagate to the caller,
 * which must fail closed.
 */
export async function hasPendingRestoreCompletion(): Promise<boolean> {
  return (await readRaw()) !== null;
}

/**
 * Read and validate the completion marker.
 *
 * Never silently discard corrupted data.
 */
export async function getRestoreCompletionMarker(): Promise<RestoreCompletionMarker | null> {
  const raw = await readRaw();

  if (raw === null) {
    return null;
  }

  return parseCompletionMarker(raw);
}

// -----------------------------------------
// CREATE COMPLETION MARKER
// -----------------------------------------

/**
 * Mark restoration as entering its
 * final commit stage.
 *
 * Must be called while holding the
 * exclusive financial storage lock.
 *
 * This refuses to overwrite an existing
 * unresolved completion marker.
 */
export async function createRestoreCompletionMarker(
  backupCreatedAt: string,
): Promise<void> {
  if (!Number.isFinite(Date.parse(backupCreatedAt))) {
    throw new Error("Invalid backup creation date.");
  }

  if ((await readRaw()) !== null) {
    throw new Error("An unresolved restore completion state already exists.");
  }

  const marker: RestoreCompletionMarker = {
    version: COMPLETION_VERSION,
    createdAt: new Date().toISOString(),
    backupCreatedAt,
    status: "finalizing",
  };

  const serialized = JSON.stringify(marker);

  await writeRaw(serialized);

  const stored = await readRaw();

  if (stored !== serialized) {
    throw new Error("Restore completion marker verification failed.");
  }
}

// -----------------------------------------
// CLEAR COMPLETION MARKER
// -----------------------------------------

/**
 * Clear the completion marker only after
 * the caller has established a safe,
 * verified final storage state.
 *
 * This function performs no independent
 * financial data validation.
 *
 * It must not be exposed directly through
 * a general UI action.
 */
export async function clearRestoreCompletionMarker(): Promise<void> {
  await removeRaw();

  if ((await readRaw()) !== null) {
    throw new Error("Restore completion marker cleanup failed.");
  }
}

// -----------------------------------------
// WRITE SAFETY CHECK
// -----------------------------------------

/**
 * Reject financial modifications when
 * an unresolved completion state exists.
 *
 * Storage read failures are also treated
 * as unsafe.
 */
export async function assertNoPendingRestoreCompletion(): Promise<void> {
  let pending: boolean;

  try {
    pending = await hasPendingRestoreCompletion();
  } catch (error) {
    console.error("Unable to inspect restore completion state:", error);

    throw new Error(
      "Shavro cannot verify the restore completion state. Financial changes are temporarily unavailable.",
    );
  }

  if (pending) {
    throw new Error(
      "Shavro has an unresolved backup restoration. Financial changes are blocked until the restore state is verified.",
    );
  }
}
