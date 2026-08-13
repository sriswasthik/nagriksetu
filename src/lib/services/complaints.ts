import { mockComplaints } from '../mock/complaints';
import type { Complaint, ComplaintFormData, ComplaintStatus } from '@/types/complaint';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Keep an in-memory store for the session to show updates working
let complaintsStore = [...mockComplaints];

export const complaintService = {
  async getComplaints(filters?: { status?: ComplaintStatus, category?: string }): Promise<Complaint[]> {
    await delay(600);
    
    let filtered = [...complaintsStore];
    if (filters?.status) {
      filtered = filtered.filter(c => c.status === filters.status);
    }
    if (filters?.category) {
      filtered = filtered.filter(c => c.category === filters.category);
    }
    
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async getComplaintById(id: string): Promise<Complaint | null> {
    await delay(400);
    return complaintsStore.find(c => c.id === id) || null;
  },

  async createComplaint(data: ComplaintFormData): Promise<Complaint> {
    await delay(1500);
    
    const newComplaint: Complaint = {
      id: `CMP-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
      title: data.title,
      description: data.description,
      category: data.category || 'other',
      status: 'submitted',
      priorityScore: 0, // Will be set by AI processing
      priorityLevel: 'medium',
      location: data.location,
      media: [], // In real app, upload files to storage and get URLs
      citizenId: 'usr_citizen_1', // Mock current user
      citizenName: 'Rahul Sharma',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    complaintsStore = [newComplaint, ...complaintsStore];
    return newComplaint;
  },

  async updateComplaintStatus(id: string, status: ComplaintStatus): Promise<Complaint> {
    await delay(800);
    
    const index = complaintsStore.findIndex(c => c.id === id);
    if (index === -1) throw new Error('Complaint not found');
    
    const updated = {
      ...complaintsStore[index],
      status,
      updatedAt: new Date().toISOString()
    };
    
    complaintsStore[index] = updated;
    return updated;
  },
  
  // Simulate the AI processing step for the demo flow
  async triggerAIAnalysis(id: string): Promise<Complaint> {
    await delay(2500);
    
    const index = complaintsStore.findIndex(c => c.id === id);
    if (index === -1) throw new Error('Complaint not found');
    
    const updated: Complaint = {
      ...complaintsStore[index],
      status: 'triaged',
      priorityScore: 92,
      priorityLevel: 'critical',
      category: 'water_leakage',
      departmentId: 'dept-water',
      departmentName: 'Water Supply',
      aiAnalysis: {
        id: `ai_${Math.random().toString(36).substring(2, 9)}`,
        complaintId: id,
        category: 'water_leakage',
        categoryConfidence: 94,
        recommendedDepartment: 'dept-water',
        departmentConfidence: 98,
        priorityScore: 92,
        priorityLevel: 'critical',
        priorityFactors: [
          { factor: 'Location', impact: 'high', description: 'Critical infrastructure nearby', score: 40 },
          { factor: 'Duplicate Volume', impact: 'high', description: 'Multiple similar reports', score: 30 }
        ],
        duplicateCheck: {
          hasDuplicates: true,
          similarCount: 4,
          similarComplaints: []
        },
        sentiment: 'urgent',
        keywords: ['water', 'leakage', 'urgent'],
        processedAt: new Date().toISOString(),
        isHumanReviewed: false
      },
      updatedAt: new Date().toISOString()
    };
    
    complaintsStore[index] = updated;
    return updated;
  }
};
