import { mockSession, mockCurrentUser } from '../mock/users';
import type { LoginCredentials, RegisterData, AuthSession, User } from '@/types/user';

// Simulate network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthSession> {
    await delay(1000);
    
    // Accept any login for demo purposes
    return {
      ...mockSession,
      user: {
        ...mockSession.user,
        email: credentials.identifier.includes('@') ? credentials.identifier : mockSession.user.email,
        mobile: !credentials.identifier.includes('@') ? credentials.identifier : mockSession.user.mobile,
      }
    };
  },

  async register(data: RegisterData): Promise<User> {
    await delay(1000);
    
    return {
      id: `usr_${Date.now()}`,
      name: data.name,
      email: data.email,
      mobile: data.mobile,
      role: data.role,
      isVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  },

  async verifyOtp(mobile: string, otp: string): Promise<AuthSession> {
    await delay(800);
    
    if (otp !== '123456') {
      throw new Error('Invalid OTP');
    }

    return mockSession;
  },

  async getCurrentUser(): Promise<User | null> {
    await delay(300);
    // In a real app, check token from cookies/localStorage
    return mockCurrentUser;
  },

  async logout(): Promise<void> {
    await delay(500);
    // Clear cookies/localStorage in real app
  }
};
