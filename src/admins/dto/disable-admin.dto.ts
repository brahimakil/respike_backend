import { IsString, IsNotEmpty } from 'class-validator';

export class DisableAdminDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}






