import { IsString, IsOptional, IsNumber, IsBoolean, Min } from 'class-validator';

export class UpdateVideoDto {
  @IsNumber()
  @Min(1)
  @IsOptional()
  order?: number;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  videoUrl?: string;

  @IsString()
  @IsOptional()
  bunnyVideoId?: string;

  @IsString()
  @IsOptional()
  coverPhotoUrl?: string;

  @IsBoolean()
  @IsOptional()
  isVisible?: boolean;
}

