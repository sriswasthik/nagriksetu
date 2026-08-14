import type { User, AuthSession } from '@/types/user';

// Mock current user
export const mockCurrentUser: User = {
  id: 'usr_citizen_1',
  name: 'Rahul Sharma',
  email: 'rahul.s@example.com',
  mobile: '+91 9876543210',
  role: 'citizen',
  isVerified: true,
  createdAt: new Date('2025-01-15T10:00:00Z').toISOString(),
  updatedAt: new Date('2025-01-15T10:00:00Z').toISOString(),
};

export const mockOfficerUser: User = {
  id: 'usr_officer_1',
  name: 'Priya Patel',
  email: 'priya.p@citytrace.gov.in',
  mobile: '+91 9876543211',
  role: 'officer',
  department: 'dept-water',
  ward: 'w-01',
  isVerified: true,
  createdAt: new Date('2024-11-20T09:30:00Z').toISOString(),
  updatedAt: new Date('2024-11-20T09:30:00Z').toISOString(),
};

export const mockSupervisorUser: User = {
  id: 'usr_sup_1',
  name: 'Vikram Singh',
  email: 'vikram.s@citytrace.gov.in',
  mobile: '+91 9876543212',
  role: 'supervisor',
  department: 'dept-water',
  isVerified: true,
  createdAt: new Date('2024-06-10T08:15:00Z').toISOString(),
  updatedAt: new Date('2024-06-10T08:15:00Z').toISOString(),
};

export const mockAdminUser: User = {
  id: 'usr_admin_1',
  name: 'Admin User',
  email: 'admin@citytrace.gov.in',
  mobile: '+91 9999999999',
  role: 'admin',
  isVerified: true,
  createdAt: new Date('2024-01-01T00:00:00Z').toISOString(),
  updatedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
};

export const mockSession: AuthSession = {
  user: mockCurrentUser,
  token: 'mock_jwt_token_123',
  expiresAt: new Date(Date.now() + 86400000).toISOString(), // +24 hours
};
