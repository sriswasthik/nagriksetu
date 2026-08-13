export interface Department {
  id: string;
  name: string;
  code: string;
  head: string;
  contactEmail: string;
  contactPhone: string;
  totalOfficers: number;
  activeWorkOrders: number;
  resolvedThisMonth: number;
  slaComplianceRate: number;
  avgResolutionHours: number;
}

export interface Ward {
  id: string;
  name: string;
  code: string;
  zone: string;
  population: number;
  area: string;
  openComplaints: number;
  criticalComplaints: number;
  resolvedComplaints: number;
  slaCompliance: number;
  avgResolutionHours: number;
  healthScore: 'good' | 'moderate' | 'poor' | 'critical';
}
