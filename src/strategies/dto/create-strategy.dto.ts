import { IsString, IsNotEmpty, IsNumber, IsArray, Min, IsOptional } from 'class-validator';

export class CreateStrategyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsArray()
  @IsString({ each: true })
  tags: string[];

  @IsString()
  @IsOptional()
  coverPhotoUrl?: string;

  @IsNumber()
  @IsOptional()
  @Min(1, { message: 'Expected weeks must be at least 1 week' })
  expectedWeeks?: number;
}

