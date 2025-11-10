export interface Subscription {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  strategyId: string;
  strategyName: string;
  strategyNumber: number;
  strategyPrice: number;
  status: SubscriptionStatus;
  startDate: Date;
  endDate: Date;
  duration: number; // Duration in days
  videoProgress: VideoProgress[];
  completedVideos: string[]; // Array of completed video IDs
  totalVideos: number;
  progressPercentage: number;
  currentVideoId?: string; // The next video to watch
  previousStrategyId?: string; // For upgrade tracking
  previousStrategyPrice?: number; // For calculating upgrade difference
  amountPaid: number; // Actual amount paid (could be difference for upgrades)
  coachCommissionPercentage?: number; // Coach commission percentage for this subscription
  paymentMethod?: string; // Payment method used
  notes?: string; // Admin notes
  renewalCount: number; // How many times renewed
  createdAt: Date;
  updatedAt: Date;
  expiredAt?: Date; // When it expired (if status is expired)
}

export interface VideoProgress {
  videoId: string;
  videoTitle: string;
  videoOrder: number;
  isCompleted: boolean;
  completedAt?: Date;
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  PENDING = 'pending', // Expired, waiting for renewal
  EXPIRED = 'expired', // Fully expired
  CANCELLED = 'cancelled',
}

export interface CreateSubscriptionDto {
  userId: string;
  strategyId: string;
  duration?: number; // Default 30 days
  amountPaid?: number; // Optional override
  coachCommissionPercentage?: number; // Coach commission percentage (0-100)
  paymentMethod?: string; // manual, bank_transfer, cash, paypal, promo, other
  notes?: string; // Admin notes for manual subscriptions
}

export interface RenewSubscriptionDto {
  duration?: number; // Default 30 days
  newStrategyId?: string; // For upgrades/downgrades
  customAmount?: number; // Custom renewal amount set by admin
  coachCommissionPercentage?: number; // Override coach commission percentage
  paymentMethod?: string; // manual, bank_transfer, cash, paypal, promo, other
  notes?: string; // Admin notes for manual renewals
}

export interface UpdateVideoProgressDto {
  videoId: string;
  isCompleted: boolean;
}

