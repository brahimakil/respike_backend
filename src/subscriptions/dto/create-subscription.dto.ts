import { IsString, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  strategyId: string;

  @IsNumber()
  @IsOptional()
  @Min(0.0001, { message: 'Duration must be positive' })
  duration?: number; // Default 30 days, supports fractional days for testing (1 minute = 0.000694 days)

  @IsNumber()
  @IsOptional()
  @Min(0)
  amountPaid?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  coachCommissionPercentage?: number; // 0-100

  @IsString()
  @IsOptional()
  paymentMethod?: string; // manual, bank_transfer, cash, paypal, promo, other

  @IsString()
  @IsOptional()
  notes?: string; // Admin notes for manual subscriptions
}

