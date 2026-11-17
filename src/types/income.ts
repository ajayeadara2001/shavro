export interface Income {
  id: string;

  amount: number;

  categoryId: string;

  incomeName: string | null;

  // How the income was received.
  // Optional for compatibility with
  // income records saved before Phase 16.
  paymentMethodId?: string | null;

  // Custom name when paymentMethodId
  // is the built-in "other" option.
  otherMethodName?: string | null;

  transactionDate: string;

  notes: string;

  createdAt: string;
}

export type CreateIncomeInput = Omit<Income, "id" | "createdAt">;

export type UpdateIncomeInput = CreateIncomeInput;
