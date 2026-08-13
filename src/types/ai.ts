import type { ComplaintCategory, PriorityLevel } from './complaint';

export interface AIAnalysis {
  id: string;
  complaintId: string;
  category: ComplaintCategory;
  categoryConfidence: number;
  recommendedDepartment: string;
  departmentConfidence: number;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  priorityFactors: PriorityFactor[];
  duplicateCheck: DuplicateCheck;
  sentiment: 'urgent' | 'frustrated' | 'neutral' | 'informative';
  keywords: string[];
  processedAt: string;
  isHumanReviewed: boolean;
}

export interface PriorityFactor {
  factor: string;
  impact: 'high' | 'medium' | 'low';
  description: string;
  score: number;
}

export interface DuplicateCheck {
  hasDuplicates: boolean;
  similarCount: number;
  nearbyDistance?: number;
  existingWorkOrderId?: string;
  similarComplaints: DuplicateMatch[];
}

export interface DuplicateMatch {
  complaintId: string;
  title: string;
  similarity: number;
  distance: number;
  status: string;
  workOrderId?: string;
}

export interface AIProcessingStep {
  id: string;
  label: string;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  result?: string;
}
