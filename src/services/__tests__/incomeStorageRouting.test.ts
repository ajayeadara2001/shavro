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

jest.mock("../incomeStorage.native", () => ({
  getIncomes: jest.fn(),
  saveIncome: jest.fn(),
  updateIncome: jest.fn(),
  deleteIncome: jest.fn(),
}));

jest.mock("../incomeStorage.web", () => ({
  getIncomes: jest.fn(),
  saveIncome: jest.fn(),
  updateIncome: jest.fn(),
  deleteIncome: jest.fn(),
}));

// =========================================
// MODULE TYPES
// =========================================

type IncomeStorageModule = typeof import("../incomeStorage");

type NativeIncomeModule = typeof import("../incomeStorage.native");

type WebIncomeModule = typeof import("../incomeStorage.web");

type TestPlatform = "android" | "ios" | "web";

// =========================================
// ISOLATED MODULE LOADING
// =========================================

/**
 * Load the income storage entry point
 * with an independently configured
 * platform environment.
 *
 * All imports and Platform.OS changes
 * happen inside the same isolated
 * Jest module registry.
 */
function loadIncomeStorage(platform: TestPlatform): {
  entry: IncomeStorageModule;
  native: NativeIncomeModule;
  web: WebIncomeModule;
} {
  let entry!: IncomeStorageModule;
  let native!: NativeIncomeModule;
  let web!: WebIncomeModule;

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

    expect(Platform.OS).toBe(platform);

    // =====================================
    // STEP 2: LOAD BOTH IMPLEMENTATIONS
    // =====================================

    native = require("../incomeStorage.native") as NativeIncomeModule;

    web = require("../incomeStorage.web") as WebIncomeModule;

    // =====================================
    // STEP 3: LOAD PLATFORM ENTRY POINT
    // =====================================

    entry = require("../incomeStorage.ts") as IncomeStorageModule;
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

describe("Shavro income storage platform routing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =====================================
  // TEST 1 — ANDROID
  // =====================================

  test("routes Android income functions to native storage", () => {
    const { entry, native, web } = loadIncomeStorage("android");

    expect(entry.getIncomes).toBe(native.getIncomes);

    expect(entry.saveIncome).toBe(native.saveIncome);

    expect(entry.updateIncome).toBe(native.updateIncome);

    expect(entry.deleteIncome).toBe(native.deleteIncome);

    expect(entry.saveIncome).not.toBe(web.saveIncome);
  });

  // =====================================
  // TEST 2 — IOS
  // =====================================

  test("routes iOS income functions to native storage", () => {
    const { entry, native, web } = loadIncomeStorage("ios");

    expect(entry.getIncomes).toBe(native.getIncomes);

    expect(entry.saveIncome).toBe(native.saveIncome);

    expect(entry.updateIncome).toBe(native.updateIncome);

    expect(entry.deleteIncome).toBe(native.deleteIncome);

    expect(entry.saveIncome).not.toBe(web.saveIncome);
  });

  // =====================================
  // TEST 3 — WEB
  // =====================================

  test("routes Web income functions to browser storage", () => {
    const { entry, web } = loadIncomeStorage("web");

    expect(entry.getIncomes).toBe(web.getIncomes);

    expect(entry.saveIncome).toBe(web.saveIncome);

    expect(entry.updateIncome).toBe(web.updateIncome);

    expect(entry.deleteIncome).toBe(web.deleteIncome);
  });

  // =====================================
  // TEST 4 — PLATFORM SEPARATION
  // =====================================

  test("does not route Web income functions to native storage", () => {
    const { entry, native, web } = loadIncomeStorage("web");

    expect(entry.getIncomes).toBe(web.getIncomes);

    expect(entry.getIncomes).not.toBe(native.getIncomes);

    expect(entry.saveIncome).toBe(web.saveIncome);

    expect(entry.saveIncome).not.toBe(native.saveIncome);

    expect(entry.updateIncome).toBe(web.updateIncome);

    expect(entry.updateIncome).not.toBe(native.updateIncome);

    expect(entry.deleteIncome).toBe(web.deleteIncome);

    expect(entry.deleteIncome).not.toBe(native.deleteIncome);
  });
});
