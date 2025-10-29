import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateVideoDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  videoUrl: string;

  @IsString()
  @IsOptional()
  coverPhotoUrl?: string;
}

