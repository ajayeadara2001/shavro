import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import type {
  CustomCategory,
  CustomPaymentMethod,
} from "../services/customOptionsStorage";

// =========================================
// STORAGE KEYS
// =========================================

const CATEGORY_KEY = "shavro_custom_categories_v1";

const PAYMENT_METHOD_KEY = "shavro_custom_payment_methods_v1";

const MAX_NAME_LENGTH = 40;

// =========================================
// TYPES
// =========================================

export interface CustomOptionsSourceSnapshot {
  rawCategories: string | null;
  rawPaymentMethods: string | null;
}

export interface ValidatedCustomOptionsSource {
  snapshot: CustomOptionsSourceSnapshot;
  categories: CustomCategory[];
  paymentMethods: CustomPaymentMethod[];
}

export interface CustomOptionsPreflightResult {
  ready: true;
  categoryCount: number;
  paymentMethodCount: number;
  totalCount: number;
}

// =========================================
// PLATFORM SAFETY
// =========================================

function assertNativePlatform(): void {
  if (Platform.OS === "web") {
    throw new Error("Native SQLite migration is unavailable on web.");
  }
}

// =========================================
// VALIDATION HELPERS
// =========================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertValidId(
  value: unknown,
  collection: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${collection}: invalid record ID.`);
  }
}

function assertValidName(
  value: unknown,
  collection: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > MAX_NAME_LENGTH
  ) {
    throw new Error(`${collection}: invalid option name.`);
  }
}

function assertValidArchived(value: unknown, collection: string): void {
  // Older records legitimately omit archived.
  if (value !== undefined && typeof value !== "boolean") {
    throw new Error(`${collection}: invalid archived flag.`);
  }
}

function assertKnownFields(
  record: Record<string, unknown>,
  permitted: readonly string[],
  collection: string,
): void {
  for (const key of Object.keys(record)) {
    if (!permitted.includes(key)) {
      // Unknown fields must not be silently lost.
      throw new Error(`${collection}: unsupported field "${key}".`);
    }
  }
}

// =========================================
// JSON PARSING
// =========================================

function parseCollection(raw: string | null, collection: string): unknown[] {
  if (raw === null) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${collection}: saved JSON could not be parsed.`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${collection}: expected an array of records.`);
  }

  return parsed;
}

// =========================================
// CATEGORY VALIDATION
// =========================================

function validateCategories(raw: string | null): CustomCategory[] {
  const records = parseCollection(raw, "Categories");

  const ids = new Set<string>();

  return records.map((value, index) => {
    const collection = `Categories: record ${index + 1}`;

    if (!isRecord(value)) {
      throw new Error(`${collection}: invalid record.`);
    }

    assertKnownFields(value, ["id", "name", "scope", "archived"], collection);

    assertValidId(value.id, collection);
    assertValidName(value.name, collection);
    assertValidArchived(value.archived, collection);

    if (value.scope !== "INCOME" && value.scope !== "EXPENSE") {
      throw new Error(`${collection}: invalid category scope.`);
    }

    if (ids.has(value.id)) {
      throw new Error("Categories: duplicate record ID.");
    }

    ids.add(value.id);

    // Preserve the source object, including
    // the absence of its optional archived field.
    return value as unknown as CustomCategory;
  });
}

// =========================================
// PAYMENT METHOD VALIDATION
// =========================================

function validatePaymentMethods(raw: string | null): CustomPaymentMethod[] {
  const records = parseCollection(raw, "Payment methods");

  const ids = new Set<string>();

  return records.map((value, index) => {
    const collection = `Payment methods: record ${index + 1}`;

    if (!isRecord(value)) {
      throw new Error(`${collection}: invalid record.`);
    }

    assertKnownFields(value, ["id", "name", "archived"], collection);

    assertValidId(value.id, collection);
    assertValidName(value.name, collection);
    assertValidArchived(value.archived, collection);

    if (ids.has(value.id)) {
      throw new Error("Payment methods: duplicate record ID.");
    }

    ids.add(value.id);

    return value as unknown as CustomPaymentMethod;
  });
}

// =========================================
// SOURCE SNAPSHOT
// =========================================

export async function readCustomOptionsSnapshot(): Promise<CustomOptionsSourceSnapshot> {
  assertNativePlatform();

  const [rawCategories, rawPaymentMethods] = await Promise.all([
    AsyncStorage.getItem(CATEGORY_KEY),
    AsyncStorage.getItem(PAYMENT_METHOD_KEY),
  ]);

  return {
    rawCategories,
    rawPaymentMethods,
  };
}

export function customOptionsSnapshotsMatch(
  first: CustomOptionsSourceSnapshot,
  second: CustomOptionsSourceSnapshot,
): boolean {
  return (
    first.rawCategories === second.rawCategories &&
    first.rawPaymentMethods === second.rawPaymentMethods
  );
}

// =========================================
// VALIDATED SOURCE
// =========================================

/**
 * Read and validate both custom-option
 * collections without modifying storage.
 *
 * The returned arrays retain source order.
 *
 * This function does not independently
 * acquire the financial-storage lock.
 * The future migration coordinator must
 * call it inside the exclusive operation.
 */
export async function readValidatedCustomOptionsSource(): Promise<ValidatedCustomOptionsSource> {
  const snapshot = await readCustomOptionsSnapshot();

  const categories = validateCategories(snapshot.rawCategories);

  const paymentMethods = validatePaymentMethods(snapshot.rawPaymentMethods);

  // Detect changes during validation.
  const afterValidation = await readCustomOptionsSnapshot();

  if (!customOptionsSnapshotsMatch(snapshot, afterValidation)) {
    throw new Error("Custom options changed during migration validation.");
  }

  return {
    snapshot,
    categories,
    paymentMethods,
  };
}

// =========================================
// PREFLIGHT ENTRY POINT
// =========================================

/**
 * Read-only migration readiness validation.
 *
 * Does not:
 * - Insert SQLite rows
 * - Modify AsyncStorage
 * - Change archived values
 * - Rename or delete custom options
 */
export async function runCustomOptionsPreflight(): Promise<CustomOptionsPreflightResult> {
  const source = await readValidatedCustomOptionsSource();

  return {
    ready: true,
    categoryCount: source.categories.length,
    paymentMethodCount: source.paymentMethods.length,
    totalCount: source.categories.length + source.paymentMethods.length,
  };
}
