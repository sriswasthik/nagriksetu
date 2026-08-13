import type { Department, Ward } from '@/types/department';

export const mockDepartments: Department[] = [
  {
    id: 'dept-eng',
    name: 'Engineering',
    code: 'ENG',
    head: 'Sanjay Kumar',
    contactEmail: 'engineering@nagriksetu.gov.in',
    contactPhone: '1800-111-2222',
    totalOfficers: 45,
    activeWorkOrders: 120,
    resolvedThisMonth: 345,
    slaComplianceRate: 85,
    avgResolutionHours: 42
  },
  {
    id: 'dept-san',
    name: 'Sanitation',
    code: 'SAN',
    head: 'Meera Reddy',
    contactEmail: 'sanitation@nagriksetu.gov.in',
    contactPhone: '1800-111-3333',
    totalOfficers: 150,
    activeWorkOrders: 230,
    resolvedThisMonth: 1250,
    slaComplianceRate: 92,
    avgResolutionHours: 24
  },
  {
    id: 'dept-elec',
    name: 'Electrical',
    code: 'ELEC',
    head: 'Rajesh Singh',
    contactEmail: 'electrical@nagriksetu.gov.in',
    contactPhone: '1800-111-4444',
    totalOfficers: 30,
    activeWorkOrders: 65,
    resolvedThisMonth: 210,
    slaComplianceRate: 78,
    avgResolutionHours: 56
  },
  {
    id: 'dept-water',
    name: 'Water Supply',
    code: 'WTR',
    head: 'Anita Desai',
    contactEmail: 'water@nagriksetu.gov.in',
    contactPhone: '1800-111-5555',
    totalOfficers: 40,
    activeWorkOrders: 85,
    resolvedThisMonth: 190,
    slaComplianceRate: 88,
    avgResolutionHours: 36
  },
  {
    id: 'dept-roads',
    name: 'Roads & Infrastructure',
    code: 'RDS',
    head: 'Vivek Sharma',
    contactEmail: 'roads@nagriksetu.gov.in',
    contactPhone: '1800-111-6666',
    totalOfficers: 55,
    activeWorkOrders: 140,
    resolvedThisMonth: 180,
    slaComplianceRate: 72,
    avgResolutionHours: 120
  }
];

export const mockWards: Ward[] = [
  {
    id: 'w-01',
    name: 'Central Ward',
    code: 'W01',
    zone: 'South',
    population: 125000,
    area: '15 sq km',
    openComplaints: 45,
    criticalComplaints: 8,
    resolvedComplaints: 890,
    slaCompliance: 82,
    avgResolutionHours: 48,
    healthScore: 'moderate'
  },
  {
    id: 'w-02',
    name: 'North-East Ward',
    code: 'W02',
    zone: 'North',
    population: 95000,
    area: '22 sq km',
    openComplaints: 12,
    criticalComplaints: 1,
    resolvedComplaints: 450,
    slaCompliance: 95,
    avgResolutionHours: 24,
    healthScore: 'good'
  },
  {
    id: 'w-03',
    name: 'Industrial Ward',
    code: 'W03',
    zone: 'West',
    population: 85000,
    area: '30 sq km',
    openComplaints: 85,
    criticalComplaints: 15,
    resolvedComplaints: 1120,
    slaCompliance: 65,
    avgResolutionHours: 96,
    healthScore: 'critical'
  },
  {
    id: 'w-04',
    name: 'Residential South',
    code: 'W04',
    zone: 'South',
    population: 150000,
    area: '18 sq km',
    openComplaints: 35,
    criticalComplaints: 4,
    resolvedComplaints: 1340,
    slaCompliance: 88,
    avgResolutionHours: 36,
    healthScore: 'good'
  },
  {
    id: 'w-05',
    name: 'Market District',
    code: 'W05',
    zone: 'East',
    population: 65000,
    area: '8 sq km',
    openComplaints: 62,
    criticalComplaints: 10,
    resolvedComplaints: 670,
    slaCompliance: 75,
    avgResolutionHours: 60,
    healthScore: 'poor'
  }
];
