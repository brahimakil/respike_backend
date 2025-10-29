import { IsString, IsEmail, IsOptional } from 'class-validator';

export class UpdateAdminDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}






