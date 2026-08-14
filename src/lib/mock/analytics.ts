import type { AnalyticsSummary, CategoryDistribution, DepartmentPerformance, SLAData, TrendDataPoint, WardHealth } from '@/types/analytics';
import { mockDepartments, mockWards } from './departments';

export const mockAnalyticsSummary: AnalyticsSummary = {
  totalComplaints: 12450,
  openComplaints: 845,
  criticalComplaints: 42,
  resolvedComplaints: 11605,
  slaCompliance: 84.5,
  avgResolutionHours: 46.2,
  complaintsToday: 124,
  resolvedToday: 98
};

/*
 * Deterministic pseudo-random generator.
 *
 * Math.random() at module scope produced different values on the
 * server and the client, which risks a hydration mismatch and made
 * the demo charts change shape on every reload. A fixed seed keeps
 * the sample data stable and reproducible.
 */
function seededRandom(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const trendRandom = seededRandom(20260813);

export const mockTrendData: TrendDataPoint[] = Array.from({ length: 30 }).map((_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (29 - i));
  return {
    date: date.toISOString().split('T')[0],
    complaints: Math.floor(trendRandom() * 50) + 100,
    resolved: Math.floor(trendRandom() * 60) + 90
  };
});

export const mockCategoryDistribution: CategoryDistribution[] = [
  { category: 'Sanitation & Garbage', count: 4250, percentage: 34.1 },
  { category: 'Roads & Potholes', count: 3120, percentage: 25.0 },
  { category: 'Water Supply', count: 2150, percentage: 17.2 },
  { category: 'Streetlights', count: 1840, percentage: 14.7 },
  { category: 'Drainage & Sewage', count: 1090, percentage: 9.0 }
];

export const mockDepartmentPerformance: DepartmentPerformance[] = mockDepartments.map(dept => ({
  department: dept.name,
  total: dept.resolvedThisMonth + dept.activeWorkOrders,
  open: dept.activeWorkOrders,
  resolved: dept.resolvedThisMonth,
  critical: Math.floor(dept.activeWorkOrders * 0.1),
  slaCompliance: dept.slaComplianceRate,
  avgResolutionHours: dept.avgResolutionHours
}));

export const mockSLAData: SLAData = {
  withinSLA: 10520,
  atRisk: 1450,
  breached: 480
};

export const mockWardHealth: WardHealth[] = mockWards.map(ward => ({
  ward: ward.name,
  openComplaints: ward.openComplaints,
  critical: ward.criticalComplaints,
  resolved: ward.resolvedComplaints,
  slaCompliance: ward.slaCompliance,
  avgResolutionHours: ward.avgResolutionHours,
  healthScore: ward.healthScore
}));
