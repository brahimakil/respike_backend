export interface PaymentSettings {
  id: string;
  provider: 'nowpayments'; // Can add more providers later
  apiKey: string;
  ipnSecret?: string; // For webhook verification
  nowPaymentsWallet?: string; // Admin's receiving wallet address
  isTestMode: boolean; // Toggle between test and production
  isActive: boolean;
  acceptedCurrencies: string[]; // ['usdttrc20', 'usdterc20', etc.]
  
  // Payment methods
  cryptoEnabled: boolean;
  cardEnabled: boolean;
  
  // Card payment settings (via NOWPayments partners)
  stripePublicKey?: string;
  stripeSecretKey?: string;
  
  createdAt: Date;
  updatedAt: Date;
  lastTestedAt?: Date;
  testStatus?: 'success' | 'failed';
  testMessage?: string;
}

export interface PaymentTransaction {
  id: string;
  userId: string;
  orderId: string;
  amount: number;
  currency: string; // 'usd', 'eur', etc.
  payCurrency: string; // 'usdttrc20', 'usdterc20', etc.
  payAmount: number;
  paymentMethod: 'crypto' | 'card'; // Payment method used
  status: PaymentStatus;
  paymentId?: string; // NOWPayments payment ID or Stripe payment intent ID
  payAddress?: string; // Crypto address to send to
  paymentUrl?: string; // Payment page URL
  actuallyPaid?: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  completedAt?: Date;
}

export interface PaymentStats {
  totalIncome: number;
  cryptoIncome: number;
  cardIncome: number;
  totalTransactions: number;
  cryptoTransactions: number;
  cardTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  pendingTransactions: number;
  totalExpenses: number; // Money paid out to coaches
  totalCashouts: number; // Number of cashout transactions
  netIncome: number; // Total income - total expenses
}

export enum PaymentStatus {
  PENDING = 'pending',
  WAITING = 'waiting', // Waiting for payment
  CONFIRMING = 'confirming', // Transaction found, confirming
  CONFIRMED = 'confirmed', // Payment confirmed
  SENDING = 'sending', // Sending to merchant
  PARTIALLY_PAID = 'partially_paid',
  FINISHED = 'finished', // Payment complete
  FAILED = 'failed',
  REFUNDED = 'refunded',
  EXPIRED = 'expired',
}

export interface CreatePaymentDto {
  amount: number;
  currency: string;
  payCurrency: string;
  orderId: string;
  description?: string;
}

export interface UpdatePaymentSettingsDto {
  apiKey?: string;
  ipnSecret?: string;
  nowPaymentsWallet?: string;
  isTestMode?: boolean;
  isActive?: boolean;
  acceptedCurrencies?: string[];
  cryptoEnabled?: boolean;
  cardEnabled?: boolean;
  stripePublicKey?: string;
  stripeSecretKey?: string;
}

export interface TestConnectionResponse {
  success: boolean;
  message: string;
  availableCurrencies?: string[];
  minAmount?: number;
}

