
import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
    Income,
    CreateIncomeInput,
    UpdateIncomeInput,
} from '../types/income';

const STORAGE_KEY = 'shavro_income_v1';

function isIncome(value: unknown): value is Income {
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
        (item.incomeName === null ||
            typeof item.incomeName === 'string') &&
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

export async function getIncomes(): Promise<Income[]> {
    try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);

        if (stored === null) {
            return [];
        }

        const parsed: unknown = JSON.parse(stored);

        if (!Array.isArray(parsed) || !parsed.every(isIncome)) {
            throw new Error('Stored income data is invalid.');
        }

        return parsed;
    } catch (error) {
        console.error('Failed to read incomes:', error);
        throw new Error('Unable to load saved incomes.');
    }
}

export async function saveIncome(
    input: CreateIncomeInput
): Promise<Income> {
    const incomes = await getIncomes();

    const income: Income = {
        ...input,
        id: generateId(),
        createdAt: new Date().toISOString(),
    };

    if (!isIncome(income)) {
        throw new Error('Invalid income data.');
    }

    try {
        await AsyncStorage.setItem(
            STORAGE_KEY,
            JSON.stringify([income, ...incomes])
        );

        return income;
    } catch (error) {
        console.error('Failed to save income:', error);
        throw new Error('Unable to save income.');
    }
}

export async function updateIncome(
    id: string,
    changes: UpdateIncomeInput
): Promise<Income> {
    const incomes = await getIncomes();

    const index = incomes.findIndex(
        (income) => income.id === id
    );

    if (index === -1) {
        throw new Error('Income not found.');
    }

    const updatedIncome: Income = {
        ...incomes[index],
        ...changes,
        id: incomes[index].id,
        createdAt: incomes[index].createdAt,
    };

    if (!isIncome(updatedIncome)) {
        throw new Error('Invalid income data.');
    }

    const updatedIncomes = [...incomes];
    updatedIncomes[index] = updatedIncome;

    try {
        await AsyncStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(updatedIncomes)
        );

        return updatedIncome;
    } catch (error) {
        console.error('Failed to update income:', error);
        throw new Error('Unable to update income.');
    }
}

export async function deleteIncome(
    id: string
): Promise<void> {
    const incomes = await getIncomes();

    if (!incomes.some((income) => income.id === id)) {
        throw new Error('Income not found.');
    }

    const remaining = incomes.filter(
        (income) => income.id !== id
    );

    try {
        await AsyncStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(remaining)
        );
    } catch (error) {
        console.error('Failed to delete income:', error);
        throw new Error('Unable to delete income.');
    }
}
