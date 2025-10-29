import { IsEnum, IsOptional, IsString, IsArray } from 'class-validator';

export enum CoachReviewStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  COMPLETELY_REJECTED = 'completely_rejected',
}

export class ReviewCoachDto {
  @IsEnum(CoachReviewStatus)
  status: CoachReviewStatus;

  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @IsOptional()
  @IsArray()
  rejectedFields?: string[];
}

