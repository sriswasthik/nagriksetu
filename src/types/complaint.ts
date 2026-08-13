export type ComplaintCategory =
  | 'water_leakage'
  | 'pothole'
  | 'garbage'
  | 'drainage'
  | 'streetlight'
  | 'road_damage'
  | 'sewage'
  | 'noise'
  | 'encroachment'
  | 'other';

export type ComplaintStatus =
  | 'submitted'
  | 'ai_processing'
  | 'triaged'
  | 'assigned'
  | 'accepted'
  | 'in_progress'
  | 'proof_submitted'
  | 'supervisor_review'
  | 'verified'
  | 'citizen_confirmation'
  | 'resolved'
  | 'reopened'
  | 'rejected';

export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

export interface GeoLocation {
  latitude: number;
  longitude: number;
  address: string;
  ward?: string;
  pincode?: string;
}

export interface ComplaintMedia {
  id: string;
  url: string;
  type: 'image' | 'video' | 'audio';
  caption?: string;
  uploadedAt: string;
}

export interface Complaint {
  id: string;
  title: string;
  description: string;
  category: ComplaintCategory;
  status: ComplaintStatus;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  location: GeoLocation;
  media: ComplaintMedia[];
  citizenId: string;
  citizenName: string;
  departmentId?: string;
  departmentName?: string;
  officerId?: string;
  officerName?: string;
  workOrderId?: string;
  aiAnalysis?: import('@/types/ai').AIAnalysis;
  slaDeadline?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplaintFormData {
  title: string;
  description: string;
  category?: ComplaintCategory;
  location: GeoLocation;
  media?: File[];
  voiceNote?: Blob;
}

export interface ComplaintUpdate {
  id: string;
  message: string;
  status: ComplaintStatus;
  updatedBy: string;
  updatedByRole: string;
  media?: ComplaintMedia[];
  timestamp: string;
}

export const CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  water_leakage: 'Water Leakage',
  pothole: 'Pothole',
  garbage: 'Garbage Collection',
  drainage: 'Drainage Issue',
  streetlight: 'Streetlight',
  road_damage: 'Road Damage',
  sewage: 'Sewage Problem',
  noise: 'Noise Pollution',
  encroachment: 'Encroachment',
  other: 'Other',
};

export const STATUS_LABELS: Record<ComplaintStatus, string> = {
  submitted: 'Submitted',
  ai_processing: 'AI Processing',
  triaged: 'Triaged',
  assigned: 'Assigned',
  accepted: 'Accepted',
  in_progress: 'In Progress',
  proof_submitted: 'Proof Submitted',
  supervisor_review: 'Under Review',
  verified: 'Verified',
  citizen_confirmation: 'Awaiting Confirmation',
  resolved: 'Resolved',
  reopened: 'Reopened',
  rejected: 'Rejected',
};

export const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};
