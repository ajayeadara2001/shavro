import {
  BriefcaseBusiness,
  Gift,
  HandCoins,
  Landmark,
  MoreHorizontal,
  TrendingUp,
  Wallet,
  Banknote,
} from "lucide-react-native";

import type { ExpenseCategory } from "../components/CategorySelector";

export const defaultIncomeCategories: ExpenseCategory[] = [
  { id: "salary", name: "Salary", icon: Wallet },
  { id: "cash", name: "Cash", icon: Banknote },
  { id: "freelance", name: "Freelance", icon: BriefcaseBusiness },
  { id: "business", name: "Business", icon: HandCoins },
  { id: "investments", name: "Investments", icon: TrendingUp },
  { id: "gift", name: "Gift", icon: Gift },
  { id: "refund", name: "Refund", icon: Landmark },
  { id: "other", name: "Other", icon: MoreHorizontal },
];
