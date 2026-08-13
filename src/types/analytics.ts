export interface AnalyticsSummary {
  totalComplaints: number;
  openComplaints: number;
  criticalComplaints: number;
  resolvedComplaints: number;
  slaCompliance: number;
  avgResolutionHours: number;
  complaintsToday: number;
  resolvedToday: number;
}

export interface TrendDataPoint {
  date: string;
  complaints: number;
  resolved: number;
}

export interface CategoryDistribution {
  category: string;
  count: number;
  percentage: number;
}

export interface DepartmentPerformance {
  department: string;
  total: number;
  open: number;
  resolved: number;
  critical: number;
  slaCompliance: number;
  avgResolutionHours: number;
}

export interface SLAData {
  withinSLA: number;
  atRisk: number;
  breached: number;
}

export interface WardHealth {
  ward: string;
  openComplaints: number;
  critical: number;
  resolved: number;
  slaCompliance: number;
  avgResolutionHours: number;
  healthScore: 'good' | 'moderate' | 'poor' | 'critical';
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isRead: boolean;
  link?: string;
  createdAt: string;
}
