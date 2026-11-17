import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  Income,
  CreateIncomeInput,
  UpdateIncomeInput,
} from "../types/income";

import { runFinancialWrite } from "./storageOperationGuard";

const STORAGE_KEY = "shavro_income_v1";

/**
 * Validate income records.
 *
 * Older income records may not contain
 * paymentMethodId or otherMethodName.
 */
function isIncome(value: unknown): value is Income {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;

  const validPaymentMethod =
    item.paymentMethodId === undefined ||
    item.paymentMethodId === null ||
    (typeof item.paymentMethodId === "string" &&
      item.paymentMethodId.trim().length > 0);

  const validOtherMethodName =
    item.otherMethodName === undefined ||
    item.otherMethodName === null ||
    typeof item.otherMethodName === "string";

  return (
    typeof item.id === "string" &&
    item.id.trim().length > 0 &&
    typeof item.amount === "number" &&
    Number.isFinite(item.amount) &&
    item.amount > 0 &&
    typeof item.categoryId === "string" &&
    item.categoryId.trim().length > 0 &&
    (item.incomeName === null || typeof item.incomeName === "string") &&
    validPaymentMethod &&
    validOtherMethodName &&
    typeof item.transactionDate === "string" &&
    typeof item.notes === "string" &&
    typeof item.createdAt === "string"
  );
}

/**
 * Allow a missing payment method for
 * compatibility with older income records.
 */
function validatePaymentMethod(input: CreateIncomeInput): void {
  const methodId = input.paymentMethodId;

  if (methodId === undefined || methodId === null) {
    return;
  }

  if (typeof methodId !== "string" || !methodId.trim()) {
    throw new Error("Invalid payment method.");
  }

  if (methodId === "other" && !input.otherMethodName?.trim()) {
    throw new Error("Enter a name for the payment method.");
  }
}

/**
 * Normalize income values without
 * modifying custom payment method IDs.
 */
function normalizeIncomeInput(input: CreateIncomeInput): CreateIncomeInput {
  validatePaymentMethod(input);

  return {
    ...input,

    incomeName: input.incomeName?.trim() || null,

    paymentMethodId: input.paymentMethodId ?? null,

    otherMethodName:
      input.paymentMethodId === "other"
        ? input.otherMethodName?.trim() || null
        : null,

    notes: input.notes.trim(),
  };
}

function generateId(): string {
  return (
    `${Date.now()}-` +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  );
}

/**
 * Read income records without acquiring
 * a second financial write lock.
 */
export async function getIncomes(): Promise<Income[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);

    if (stored === null) {
      return [];
    }

    const parsed: unknown = JSON.parse(stored);

    if (!Array.isArray(parsed) || !parsed.every(isIncome)) {
      throw new Error("Stored income data is invalid.");
    }

    return parsed;
  } catch (error) {
    console.error("Failed to read incomes:", error);

    throw new Error("Unable to load saved incomes.");
  }
}

/**
 * Save income using the shared,
 * serialized write queue.
 */
export async function saveIncome(input: CreateIncomeInput): Promise<Income> {
  return runFinancialWrite(async () => {
    const incomes = await getIncomes();

    const normalizedInput = normalizeIncomeInput(input);

    const income: Income = {
      ...normalizedInput,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };

    if (!isIncome(income)) {
      throw new Error("Invalid income data.");
    }

    try {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([income, ...incomes]),
      );

      return income;
    } catch (error) {
      console.error("Failed to save income:", error);

      throw new Error("Unable to save income.");
    }
  });
}

/**
 * Update income without changing its
 * original ID or creation timestamp.
 */
export async function updateIncome(
  id: string,
  changes: UpdateIncomeInput,
): Promise<Income> {
  return runFinancialWrite(async () => {
    const incomes = await getIncomes();

    const index = incomes.findIndex((income) => income.id === id);

    if (index === -1) {
      throw new Error("Income not found.");
    }

    const existingIncome = incomes[index];

    /**
     * Preserve existing Received Via
     * information if the edit does not
     * explicitly replace it.
     */
    const effectiveChanges: CreateIncomeInput = {
      ...changes,

      paymentMethodId:
        changes.paymentMethodId === undefined
          ? existingIncome.paymentMethodId
          : changes.paymentMethodId,

      otherMethodName:
        changes.otherMethodName === undefined
          ? existingIncome.otherMethodName
          : changes.otherMethodName,
    };

    const normalizedChanges = normalizeIncomeInput(effectiveChanges);

    const updatedIncome: Income = {
      ...existingIncome,
      ...normalizedChanges,

      id: existingIncome.id,
      createdAt: existingIncome.createdAt,
    };

    if (!isIncome(updatedIncome)) {
      throw new Error("Invalid income data.");
    }

    const updatedIncomes = [...incomes];

    updatedIncomes[index] = updatedIncome;

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedIncomes));

      return updatedIncome;
    } catch (error) {
      console.error("Failed to update income:", error);

      throw new Error("Unable to update income.");
    }
  });
}

/**
 * Delete income using the financial
 * write coordinator.
 */
export async function deleteIncome(id: string): Promise<void> {
  return runFinancialWrite(async () => {
    const incomes = await getIncomes();

    if (!incomes.some((income) => income.id === id)) {
      throw new Error("Income not found.");
    }

    const remaining = incomes.filter((income) => income.id !== id);

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
    } catch (error) {
      console.error("Failed to delete income:", error);

      throw new Error("Unable to delete income.");
    }
  });
}
