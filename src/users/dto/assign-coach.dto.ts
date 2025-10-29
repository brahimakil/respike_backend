import { IsOptional, IsString } from 'class-validator';

export class AssignCoachDto {
  @IsOptional()
  @IsString()
  coachId: string | null;
}

