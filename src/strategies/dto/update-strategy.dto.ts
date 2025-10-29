import { IsString, IsOptional, IsNumber, IsArray, Min } from 'class-validator';

export class UpdateStrategyDto {
  @IsNumber()
  @Min(1)
  @IsOptional()
  number?: number;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsString()
  @IsOptional()
  coverPhotoUrl?: string;

  @IsNumber()
  @Min(1, { message: 'Expected weeks must be at least 1 week' })
  @IsOptional()
  expectedWeeks?: number;
}

