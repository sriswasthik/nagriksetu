import type { WorkOrder } from '@/types/workOrder';

const now = new Date();
const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

export const mockWorkOrders: WorkOrder[] = [
  {
    id: 'WO-1024',
    complaintId: 'CMP-2026-001',
    complaintTitle: 'Large water leakage near government hospital',
    category: 'water_leakage',
    departmentId: 'dept-water',
    departmentName: 'Water Supply',
    officerId: 'usr_officer_1',
    officerName: 'Priya Patel',
    status: 'assigned',
    priorityScore: 92,
    priorityLevel: 'critical',
    location: {
      latitude: 12.9716,
      longitude: 77.5946,
      address: 'Near District Hospital Main Gate, MG Road',
      ward: 'w-01'
    },
    citizenEvidence: [
      {
        id: 'med_1',
        url: 'https://images.unsplash.com/photo-1542385151-efd9000785a0?q=80&w=600&auto=format&fit=crop',
        type: 'image',
        uploadedAt: twoDaysAgo.toISOString()
      }
    ],
    resolutionEvidence: [],
    slaDeadline: new Date(now.getTime() + 18 * 60 * 60 * 1000).toISOString(),
    slaHoursRemaining: 18,
    assignedAt: twoDaysAgo.toISOString(),
    createdAt: twoDaysAgo.toISOString(),
    updatedAt: twoDaysAgo.toISOString()
  }
];
