export interface Wallet {
  id: string;
  ownerId: string; // userId or 'system' for system wallet
  ownerType: WalletOwnerType;
  ownerName: string;
  balance: number;
  totalEarned: number; // Lifetime earnings
  currency: string; // Default 'USD'
  status: WalletStatus;
  createdAt: Date;
  updatedAt: Date;
}

export enum WalletOwnerType {
  COACH = 'coach',
  USER = 'user',
  SYSTEM = 'system',
}

export enum WalletStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CLOSED = 'closed',
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  type: TransactionType;
  amount: number;
  description: string;
  referenceId?: string; // subscription ID, payment ID, etc.
  referenceType?: string; // 'subscription', 'payment', 'commission'
  balanceBefore: number;
  balanceAfter: number;
  metadata?: any; // Additional transaction data
  createdAt: Date;
}

export enum TransactionType {
  CREDIT = 'credit', // Money in
  DEBIT = 'debit', // Money out
}

export interface CoachCommission {
  subscriptionId: string;
  coachId: string;
  coachName: string;
  userId: string;
  userName: string;
  strategyName: string;
  totalAmount: number;
  commissionPercentage: number;
  commissionAmount: number;
  systemAmount: number;
  createdAt: Date;
}

export interface CommissionSplit {
  coachAmount: number;
  systemAmount: number;
  percentage: number;
}

