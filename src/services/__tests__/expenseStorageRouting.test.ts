import { describe, expect, jest, test, beforeEach } from "@jest/globals";

// =========================================
// PLATFORM MOCK
// =========================================

jest.mock("react-native", () => ({
  Platform: {
    OS: "android",
  },
}));

// =========================================
// STORAGE IMPLEMENTATION MOCKS
// =========================================

jest.mock("../expenseStorage.native", () => ({
  getExpenses: jest.fn(),
  saveExpense: jest.fn(),
  updateExpense: jest.fn(),
  deleteExpense: jest.fn(),
}));

jest.mock("../expenseStorage.web", () => ({
  getExpenses: jest.fn(),
  saveExpense: jest.fn(),
  updateExpense: jest.fn(),
  deleteExpense: jest.fn(),
}));

// =========================================
// MODULE TYPES
// =========================================

type ExpenseStorageModule = typeof import("../expenseStorage");

type NativeExpenseModule = typeof import("../expenseStorage.native");

type WebExpenseModule = typeof import("../expenseStorage.web");

type TestPlatform = "android" | "ios" | "web";

// =========================================
// ISOLATED MODULE LOADING
// =========================================

/**
 * Load the expense storage entry point
 * inside a fresh Jest module registry.
 *
 * IMPORTANT:
 * Platform.OS must be configured inside
 * jest.isolateModules().
 *
 * Changing an imported Platform object
 * outside this callback may modify a
 * different module instance.
 */
function loadExpenseStorage(platform: TestPlatform): {
  entry: ExpenseStorageModule;
  native: NativeExpenseModule;
  web: WebExpenseModule;
} {
  let entry!: ExpenseStorageModule;
  let native!: NativeExpenseModule;
  let web!: WebExpenseModule;

  jest.isolateModules(() => {
    // =====================================
    // STEP 1: CONFIGURE ISOLATED PLATFORM
    // =====================================

    const { Platform } = require("react-native") as {
      Platform: {
        OS: TestPlatform;
      };
    };

    Platform.OS = platform;

    // Confirm the test environment is
    // configured before loading services.
    expect(Platform.OS).toBe(platform);

    // =====================================
    // STEP 2: LOAD PLATFORM IMPLEMENTATIONS
    // =====================================

    native = require("../expenseStorage.native") as NativeExpenseModule;

    web = require("../expenseStorage.web") as WebExpenseModule;

    // =====================================
    // STEP 3: LOAD THE STORAGE ENTRY POINT
    // =====================================

    entry = require("../expenseStorage.ts") as ExpenseStorageModule;
  });

  return {
    entry,
    native,
    web,
  };
}

// =========================================
// TEST SUITE
// =========================================

describe("Shavro expense storage platform routing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =====================================
  // TEST 1 — ANDROID
  // =====================================

  test("routes Android expense functions to native storage", () => {
    const { entry, native, web } = loadExpenseStorage("android");

    expect(entry.getExpenses).toBe(native.getExpenses);

    expect(entry.saveExpense).toBe(native.saveExpense);

    expect(entry.updateExpense).toBe(native.updateExpense);

    expect(entry.deleteExpense).toBe(native.deleteExpense);

    expect(entry.saveExpense).not.toBe(web.saveExpense);
  });

  // =====================================
  // TEST 2 — IOS
  // =====================================

  test("routes iOS expense functions to native storage", () => {
    const { entry, native, web } = loadExpenseStorage("ios");

    expect(entry.getExpenses).toBe(native.getExpenses);

    expect(entry.saveExpense).toBe(native.saveExpense);

    expect(entry.updateExpense).toBe(native.updateExpense);

    expect(entry.deleteExpense).toBe(native.deleteExpense);

    expect(entry.saveExpense).not.toBe(web.saveExpense);
  });

  // =====================================
  // TEST 3 — WEB
  // =====================================

  test("routes Web expense functions to browser storage", () => {
    const { entry, web } = loadExpenseStorage("web");

    expect(entry.getExpenses).toBe(web.getExpenses);

    expect(entry.saveExpense).toBe(web.saveExpense);

    expect(entry.updateExpense).toBe(web.updateExpense);

    expect(entry.deleteExpense).toBe(web.deleteExpense);
  });

  // =====================================
  // TEST 4 — PLATFORM SEPARATION
  // =====================================

  test("does not route Web expense functions to native storage", () => {
    const { entry, native, web } = loadExpenseStorage("web");

    expect(entry.getExpenses).toBe(web.getExpenses);

    expect(entry.getExpenses).not.toBe(native.getExpenses);

    expect(entry.saveExpense).toBe(web.saveExpense);

    expect(entry.saveExpense).not.toBe(native.saveExpense);

    expect(entry.updateExpense).toBe(web.updateExpense);

    expect(entry.updateExpense).not.toBe(native.updateExpense);

    expect(entry.deleteExpense).toBe(web.deleteExpense);

    expect(entry.deleteExpense).not.toBe(native.deleteExpense);
  });
});
