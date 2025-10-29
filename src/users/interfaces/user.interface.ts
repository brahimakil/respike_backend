export enum UserStatus {
  ACTIVE = 'active',
  BANNED = 'banned',
}

export interface User {
  id: string;
  uid: string; // Firebase Auth UID
  email: string;
  displayName?: string;
  phoneNumber?: string;
  photoURL?: string;
  status: UserStatus;
  
  // Coach assignment
  assignedCoachId?: string;
  assignedCoachName?: string;
  coachCommissionOverride?: number; // Override commission % for this specific user
  
  // Ban info
  banReason?: string;
  bannedAt?: Date;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDto {
  email: string;
  password: string;
  displayName?: string;
  phoneNumber?: string;
  photoURL?: string;
}

export interface AssignCoachDto {
  coachId: string | null;
}

