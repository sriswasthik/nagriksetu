/**
 * Mirrors the PostgreSQL `public.user_role` enum. The final value is
 * `government_admin`; the previous `admin` never existed in the
 * database, so any comparison against it silently failed and every
 * such user fell through to citizen-level access.
 */
export type UserRole =
  | 'citizen'
  | 'officer'
  | 'supervisor'
  | 'government_admin';

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
