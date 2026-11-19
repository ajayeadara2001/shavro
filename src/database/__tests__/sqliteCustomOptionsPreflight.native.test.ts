import AsyncStorage from "@react-native-async-storage/async-storage";

import { jest, describe, it, expect, beforeEach } from "@jest/globals";

import {
  runCustomOptionsPreflight,
  readValidatedCustomOptionsSource,
} from "../sqliteCustomOptionsPreflight.native";

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

// Obtain Jest inside the factory to avoid
// the mock-hoisting issue encountered earlier.
jest.mock("@react-native-async-storage/async-storage", () => {
  const mockJest = require("@jest/globals").jest;

  return {
    __esModule: true,
    default: {
      getItem: mockJest.fn(),
    },
  };
});

const CATEGORY_KEY = "shavro_custom_categories_v1";
const PAYMENT_KEY = "shavro_custom_payment_methods_v1";

const category = {
  id: "category-001",
  name: "Freelancing",
  scope: "INCOME",
  archived: false,
};

const paymentMethod = {
  id: "payment-001",
  name: "Gift Card",
  archived: false,
};

function mockCollections(categories: unknown, paymentMethods: unknown): void {
  jest.mocked(AsyncStorage.getItem).mockImplementation(async (key: string) => {
    if (key === CATEGORY_KEY) {
      return JSON.stringify(categories);
    }

    if (key === PAYMENT_KEY) {
      return JSON.stringify(paymentMethods);
    }

    return null;
  });
}

describe("SQLite custom options preflight", () => {
  beforeEach(() => {
    jest.resetAllMocks();

    mockCollections([category], [paymentMethod]);
  });

  it("accepts valid custom options", async () => {
    const result = await runCustomOptionsPreflight();

    expect(result).toEqual({
      ready: true,
      categoryCount: 1,
      paymentMethodCount: 1,
      totalCount: 2,
    });
  });

  it("accepts empty collections", async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);

    const result = await runCustomOptionsPreflight();

    expect(result).toEqual({
      ready: true,
      categoryCount: 0,
      paymentMethodCount: 0,
      totalCount: 0,
    });
  });

  it("preserves missing archived fields", async () => {
    const legacyCategory = {
      id: "category-old",
      name: "Old Category",
      scope: "EXPENSE",
    };

    const legacyMethod = {
      id: "payment-old",
      name: "Old Method",
    };

    mockCollections([legacyCategory], [legacyMethod]);

    const result = await readValidatedCustomOptionsSource();

    expect(result.categories[0]).toEqual(legacyCategory);

    expect(result.paymentMethods[0]).toEqual(legacyMethod);

    expect(
      Object.prototype.hasOwnProperty.call(result.categories[0], "archived"),
    ).toBe(false);
  });

  it("preserves archived true and false values", async () => {
    mockCollections(
      [
        { ...category, archived: true },
        {
          id: "category-002",
          name: "Second",
          scope: "EXPENSE",
          archived: false,
        },
      ],
      [paymentMethod],
    );

    const result = await readValidatedCustomOptionsSource();

    expect(result.categories[0].archived).toBe(true);
    expect(result.categories[1].archived).toBe(false);
  });

  it("rejects duplicate category IDs", async () => {
    mockCollections([category, { ...category }], [paymentMethod]);

    await expect(runCustomOptionsPreflight()).rejects.toThrow(
      "duplicate record ID",
    );
  });

  it("rejects duplicate payment-method IDs", async () => {
    mockCollections([category], [paymentMethod, { ...paymentMethod }]);

    await expect(runCustomOptionsPreflight()).rejects.toThrow(
      "duplicate record ID",
    );
  });

  it("rejects invalid category scopes", async () => {
    mockCollections([{ ...category, scope: "OTHER" }], [paymentMethod]);

    await expect(runCustomOptionsPreflight()).rejects.toThrow(
      "invalid category scope",
    );
  });

  it("rejects invalid archived fields", async () => {
    mockCollections([{ ...category, archived: "false" }], [paymentMethod]);

    await expect(runCustomOptionsPreflight()).rejects.toThrow(
      "invalid archived flag",
    );
  });

  it("rejects empty names", async () => {
    mockCollections([{ ...category, name: "   " }], [paymentMethod]);

    await expect(runCustomOptionsPreflight()).rejects.toThrow(
      "invalid option name",
    );
  });

  it("rejects names longer than 40 characters", async () => {
    mockCollections([category], [{ ...paymentMethod, name: "A".repeat(41) }]);

    await expect(runCustomOptionsPreflight()).rejects.toThrow(
      "invalid option name",
    );
  });

  it("rejects unsupported fields", async () => {
    mockCollections([{ ...category, unexpected: "value" }], [paymentMethod]);

    await expect(runCustomOptionsPreflight()).rejects.toThrow(
      "unsupported field",
    );
  });

  it("rejects invalid collection structures", async () => {
    mockCollections({ items: [category] }, [paymentMethod]);

    await expect(runCustomOptionsPreflight()).rejects.toThrow(
      "expected an array",
    );
  });

  it("rejects corrupted JSON", async () => {
    jest
      .mocked(AsyncStorage.getItem)
      .mockImplementation(async (key: string) => {
        if (key === CATEGORY_KEY) {
          return "{invalid-json";
        }

        if (key === PAYMENT_KEY) {
          return JSON.stringify([paymentMethod]);
        }

        return null;
      });

    await expect(runCustomOptionsPreflight()).rejects.toThrow(
      "saved JSON could not be parsed",
    );
  });

  it("detects source changes during validation", async () => {
    let categoryReads = 0;

    jest
      .mocked(AsyncStorage.getItem)
      .mockImplementation(async (key: string) => {
        if (key === CATEGORY_KEY) {
          categoryReads += 1;

          return JSON.stringify(
            categoryReads === 1
              ? [category]
              : [{ ...category, name: "Changed" }],
          );
        }

        if (key === PAYMENT_KEY) {
          return JSON.stringify([paymentMethod]);
        }

        return null;
      });

    await expect(runCustomOptionsPreflight()).rejects.toThrow(
      "Custom options changed during migration validation",
    );
  });

  it("preserves original array ordering", async () => {
    const first = {
      id: "category-first",
      name: "First",
      scope: "EXPENSE",
    };

    const second = {
      id: "category-second",
      name: "Second",
      scope: "INCOME",
    };

    mockCollections([second, first], [paymentMethod]);

    const result = await readValidatedCustomOptionsSource();

    expect(result.categories.map((item) => item.id)).toEqual([
      "category-second",
      "category-first",
    ]);
  });
});
