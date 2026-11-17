import { Platform } from "react-native";

/**
 * Shavro Browser Financial Storage Lock
 *
 * Coordinates participating browser tabs
 * using the Web Locks API.
 *
 * The same lock name must be used for:
 * - Expense writes
 * - Income writes
 * - Custom option writes
 * - Backup restoration
 * - Interrupted restore recovery
 *
 * Native platforms continue using the
 * existing in-process storage coordinator.
 */

export const SHAVRO_BROWSER_LOCK_NAME = "shavro-financial-storage-v1";

/**
 * Check Web Locks API availability.
 *
 * The API requires a supported browser
 * and a secure context.
 */
export function isBrowserFinancialLockSupported(): boolean {
  if (Platform.OS !== "web") {
    return true;
  }

  return (
    typeof navigator !== "undefined" &&
    typeof navigator.locks?.request === "function"
  );
}

/**
 * Execute an operation while holding the
 * browser-wide exclusive financial lock.
 *
 * Lock is released automatically when
 * the operation completes or throws.
 *
 * Do not call this recursively using
 * the same lock name: nested requests
 * may deadlock.
 *
 * Fail closed on unsupported browsers.
 */
export async function runWithBrowserFinancialLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  // Native platforms use the existing
  // JavaScript storage coordinator.
  if (Platform.OS !== "web") {
    return operation();
  }

  if (!isBrowserFinancialLockSupported()) {
    throw new Error(
      "Your browser does not support the secure storage coordination required by Shavro. Please use a supported browser or secure connection.",
    );
  }

  return navigator.locks.request(
    SHAVRO_BROWSER_LOCK_NAME,
    { mode: "exclusive" },
    async (lock) => {
      if (!lock) {
        throw new Error("Shavro could not acquire the financial storage lock.");
      }

      // The lock remains held until this
      // promise resolves or rejects.
      return operation();
    },
  );
}
