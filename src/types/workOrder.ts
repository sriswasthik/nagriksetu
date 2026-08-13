import type { ComplaintMedia, PriorityLevel } from './complaint';

export type WorkOrderStatus =
  | 'created'
  | 'assigned'
  | 'accepted'
  | 'in_progress'
  | 'proof_submitted'
  | 'supervisor_review'
  | 'approved'
  | 'rework_requested'
  | 'completed'
  | 'cancelled';

export type VerificationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'rework_requested';

export interface WorkOrder {
  id: string;
  complaintId: string;
  complaintTitle: string;
  category: string;
  departmentId: string;
  departmentName: string;
  officerId: string;
  officerName: string;
  supervisorId?: string;
  supervisorName?: string;
  status: WorkOrderStatus;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  location: {
    latitude: number;
    longitude: number;
    address: string;
    ward?: string;
  };
  citizenEvidence: ComplaintMedia[];
  resolutionEvidence: ComplaintMedia[];
  resolutionNotes?: string;
  slaDeadline: string;
  slaHoursRemaining: number;
  assignedAt: string;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderUpdate {
  workOrderId: string;
  status: WorkOrderStatus;
  notes?: string;
  media?: ComplaintMedia[];
  updatedBy: string;
  timestamp: string;
}

export interface Verification {
  id: string;
  workOrderId: string;
  complaintId: string;
  supervisorId: string;
  supervisorName: string;
  status: VerificationStatus;
  beforeEvidence: ComplaintMedia[];
  afterEvidence: ComplaintMedia[];
  officerNotes: string;
  supervisorNotes?: string;
  citizenConfirmed?: boolean;
  citizenFeedback?: string;
  verifiedAt?: string;
  createdAt: string;
}

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  created: 'Created',
  assigned: 'Assigned',
  accepted: 'Accepted',
  in_progress: 'In Progress',
  proof_submitted: 'Proof Submitted',
  supervisor_review: 'Under Review',
  approved: 'Approved',
  rework_requested: 'Rework Requested',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
