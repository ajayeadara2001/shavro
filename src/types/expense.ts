export interface Expense {
  id: string;

  amount: number;

  categoryId: string;

  expenseName: string | null;

  paymentMethodId: string;

  otherMethodName: string | null;

  transactionDate: string;

  notes: string;

  createdAt: string;
}
export type UpdateExpenseInput = CreateExpenseInput;

export type CreateExpenseInput = Omit<Expense, "id" | "createdAt">;
