import { IsString, IsNotEmpty, IsBoolean } from 'class-validator';

export class UpdateVideoProgressDto {
  @IsString()
  @IsNotEmpty()
  videoId: string;

  @IsBoolean()
  isCompleted: boolean;
}

