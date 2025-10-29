import { IsString, IsBoolean, IsArray, IsOptional } from 'class-validator';

export class UpdatePaymentSettingsDto {
  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  ipnSecret?: string;

  @IsOptional()
  @IsBoolean()
  isTestMode?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acceptedCurrencies?: string[];

  @IsOptional()
  @IsBoolean()
  cryptoEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  cardEnabled?: boolean;

  @IsOptional()
  @IsString()
  stripePublicKey?: string;

  @IsOptional()
  @IsString()
  stripeSecretKey?: string;
}

