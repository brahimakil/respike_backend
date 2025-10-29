import { IsString, IsNumber, IsOptional, Min } from 'class-validator';

export class CreatePaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  currency: string; // 'usd', 'eur'

  @IsString()
  payCurrency: string; // 'usdttrc20', 'usdterc20'

  @IsString()
  orderId: string;

  @IsOptional()
  @IsString()
  description?: string;
}

