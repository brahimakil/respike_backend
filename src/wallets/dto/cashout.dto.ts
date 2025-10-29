import { IsNumber, IsString, IsNotEmpty, Min } from 'class-validator';

export class CashoutDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsNotEmpty()
  walletAddress: string;

  @IsString()
  @IsNotEmpty()
  currency: string; // e.g., 'USDTTRC20', 'btc', 'eth'
}

