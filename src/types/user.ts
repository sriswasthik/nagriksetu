export type UserRole = 'citizen' | 'officer' | 'supervisor' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: UserRole;
  avatar?: string;
  department?: string;
  ward?: string;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  user: User;
  token: string;
  expiresAt: string;
}

export interface LoginCredentials {
  identifier: string; // email or mobile
  password?: string;
  otp?: string;
}

export interface RegisterData {
  name: string;
  email: string;
  mobile: string;
  password: string;
  role: UserRole;
}

export interface OTPVerification {
  mobile: string;
  otp: string;
}
