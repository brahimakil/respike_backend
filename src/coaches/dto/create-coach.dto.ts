import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsEnum,
  IsDateString,
  IsNumber,
  Min,
} from 'class-validator';

export class CreateCoachDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsNotEmpty()
  @IsString()
  phoneNumber: string;

  @IsNotEmpty()
  @IsString()
  fullName: string;

  @IsDateString()
  @IsNotEmpty()
  dateOfBirth: string;

  @IsNotEmpty()
  @IsString()
  postalCode: string;

  @IsNotEmpty()
  @IsString()
  city: string;

  @IsNotEmpty()
  @IsString()
  country: string;

  @IsNotEmpty()
  @IsString()
  address: string;

  @IsEnum(['passport', 'national_id'])
  @IsNotEmpty()
  idType: 'passport' | 'national_id';

  @IsNotEmpty()
  @IsString()
  yearsOfExperience: string;

  @IsNotEmpty()
  @IsString()
  description: string;
}

