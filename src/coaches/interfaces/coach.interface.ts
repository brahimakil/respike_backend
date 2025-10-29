export enum CoachStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  COMPLETELY_REJECTED = 'completely_rejected',
  BANNED = 'banned',
}

export interface CoachKYC {
  // Personal Information
  email: string;
  phoneNumber: string;
  fullName: string;
  dateOfBirth: string; // ISO date string
  
  // Address Information
  postalCode: string;
  city: string;
  country: string;
  address: string;
  
  // Professional Information
  yearsOfExperience: string;
  description: string;
  
  // ID Document Information
  idType: 'passport' | 'national_id';
  
  // File URLs (Firebase Storage)
  profilePhotoUrl: string;
  idFrontPhotoUrl: string;
  idBackPhotoUrl: string;
}

export interface Coach extends CoachKYC {
  id: string;
  uid?: string; // Firebase Auth UID if coach has login access
  status: CoachStatus;
  
  // Commission settings
  defaultCommissionPercentage?: number; // Default commission % for all users (default 30%)
  
  // Metadata
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string; // Admin UID who reviewed
  rejectionReason?: string;
  rejectedFields?: string[];
  
  // Ban info
  banReason?: string;
  bannedBy?: string;
  bannedAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCoachDto {
  email: string;
  phoneNumber: string;
  fullName: string;
  dateOfBirth: string;
  postalCode: string;
  city: string;
  country: string;
  address: string;
  idType: 'passport' | 'national_id';
  yearsOfExperience: string;
  description: string;
}

export interface UpdateCoachDto {
  phoneNumber?: string;
  fullName?: string;
  dateOfBirth?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  address?: string;
  idType?: 'passport' | 'national_id';
  yearsOfExperience?: string;
  description?: string;
  defaultCommissionPercentage?: number;
}

export interface ReviewCoachDto {
  status: CoachStatus.PENDING | CoachStatus.APPROVED | CoachStatus.REJECTED | CoachStatus.COMPLETELY_REJECTED;
  rejectionReason?: string;
  rejectedFields?: string[];
}

