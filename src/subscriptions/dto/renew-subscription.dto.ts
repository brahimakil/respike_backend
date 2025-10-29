import { IsString, IsNumber, IsOptional, Min } from 'class-validator';

export class RenewSubscriptionDto {
  @IsNumber()
  @IsOptional()
  @Min(1, { message: 'Duration must be at least 1 day' })
  duration?: number; // Default 30 days

  @IsString()
  @IsOptional()
  newStrategyId?: string; // For switching strategies

  @IsNumber()
  @IsOptional()
  @Min(0, { message: 'Amount must be 0 or greater' })
  customAmount?: number; // Custom renewal amount set by admin
}

