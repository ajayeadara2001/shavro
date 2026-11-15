
import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  Expense,
  CreateExpenseInput,
  UpdateExpenseInput,
} from '../types/expense';

const STORAGE_KEY = 'expenseflow_expenses_v1';

function isExpense(value: unknown): value is Expense {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as Record<string, unknown>;

  return (
    typeof item.id === 'string' &&
    typeof item.amount === 'number' &&
    Number.isFinite(item.amount) &&
    item.amount > 0 &&
    typeof item.categoryId === 'string' &&
    (item.expenseName === null ||
      typeof item.expenseName === 'string') &&
    typeof item.paymentMethodId === 'string' &&
    (item.otherMethodName === null ||
      typeof item.otherMethodName === 'string') &&
    typeof item.transactionDate === 'string' &&
    typeof item.notes === 'string' &&
    typeof item.createdAt === 'string'
  );
}

function generateId(): string {
  return (
    `${Date.now()}-` +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  );
}

export async function getExpenses(): Promise<Expense[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return [];
    }

    const parsed: unknown = JSON.parse(stored);

    if (!Array.isArray(parsed)) {
      throw new Error('Stored expenses must be an array.');
    }

    if (!parsed.every(isExpense)) {
      throw new Error('Stored expenses contain invalid data.');
    }

    return parsed;
  } catch (error) {
    console.error('Failed to read expenses:', error);
    throw new Error('Unable to load saved expenses.');
  }
}

export async function saveExpense(
  input: CreateExpenseInput
): Promise<Expense> {
  const expenses = await getExpenses();

  const expense: Expense = {
    ...input,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };

  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([expense, ...expenses])
    );

    return expense;
  } catch (error) {
    console.error('Failed to save expense:', error);
    throw new Error('Unable to save expense.');
  }
}


export async function updateExpense(
  id: string,
  changes: UpdateExpenseInput
): Promise<Expense> {
  const expenses = await getExpenses();

  const index = expenses.findIndex(
    (expense) => expense.id === id
  );

  if (index === -1) {
    throw new Error('Expense not found.');
  }

  const updatedExpense: Expense = {
    ...expenses[index],
    ...changes,
    id: expenses[index].id,
    createdAt: expenses[index].createdAt,
  };

  const updatedExpenses = [...expenses];
  updatedExpenses[index] = updatedExpense;

  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(updatedExpenses)
    );

    return updatedExpense;
  } catch (error) {
    console.error('Failed to update expense:', error);
    throw new Error('Unable to update expense.');
  }
}

export async function deleteExpense(
  id: string
): Promise<void> {
  const expenses = await getExpenses();

  const exists = expenses.some(
    (expense) => expense.id === id
  );

  if (!exists) {
    throw new Error('Expense not found.');
  }

  const remainingExpenses = expenses.filter(
    (expense) => expense.id !== id
  );

  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(remainingExpenses)
    );
  } catch (error) {
    console.error('Failed to delete expense:', error);
    throw new Error('Unable to delete expense.');
  }
}