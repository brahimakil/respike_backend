export interface Admin {
  uid: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  role: string;
  status: AdminStatus;
  createdAt: Date;
  updatedAt: Date;
  disabledAt?: Date;
  disabledBy?: string;
  disabledReason?: string;
}

export enum AdminStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

export interface UpdateAdminDto {
  displayName?: string;
  email?: string;
}

export interface DisableAdminDto {
  reason: string;
}






