
export interface Income {
    id: string;
    amount: number;
    categoryId: string;
    incomeName: string | null;
    transactionDate: string;
    notes: string;
    createdAt: string;
}

export type CreateIncomeInput = Omit<
    Income,
    'id' | 'createdAt'
>;

export type UpdateIncomeInput = CreateIncomeInput;
