export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  displayName?: string;
}

export interface AuthResponse {
  user: UserData;
  token: string;
}

export interface UserData {
  uid: string;
  email: string | null;
  displayName?: string | null;
  emailVerified: boolean;
  createdAt?: Date;
}

export interface ValidateTokenResponse {
  valid: boolean;
  user?: UserData;
}