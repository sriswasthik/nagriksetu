import { mockWorkOrders } from '../mock/workOrders';
import type { WorkOrder, WorkOrderStatus, WorkOrderUpdate } from '@/types/workOrder';


const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const workOrdersStore = [...mockWorkOrders];

export const workOrderService = {
  async getWorkOrders(filters?: { status?: WorkOrderStatus, priority?: string, officerId?: string }): Promise<WorkOrder[]> {
    await delay(600);
    
    let filtered = [...workOrdersStore];
    if (filters?.status) {
      filtered = filtered.filter(wo => wo.status === filters.status);
    }
    if (filters?.priority) {
      filtered = filtered.filter(wo => wo.priorityLevel === filters.priority);
    }
    if (filters?.officerId) {
      filtered = filtered.filter(wo => wo.officerId === filters.officerId);
    }
    
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async getWorkOrderById(id: string): Promise<WorkOrder | null> {
    await delay(400);
    return workOrdersStore.find(wo => wo.id === id) || null;
  },

  async getWorkOrdersByComplaintId(complaintId: string): Promise<WorkOrder[]> {
    await delay(300);
    return workOrdersStore.filter(wo => wo.complaintId === complaintId);
  },

  async updateWorkOrderStatus(update: WorkOrderUpdate): Promise<WorkOrder> {
    await delay(800);
    
    const index = workOrdersStore.findIndex(wo => wo.id === update.workOrderId);
    if (index === -1) throw new Error('Work order not found');
    
    const current = workOrdersStore[index];
    const updated: WorkOrder = {
      ...current,
      status: update.status,
      resolutionNotes: update.notes ? update.notes : current.resolutionNotes,
      resolutionEvidence: update.media ? [...current.resolutionEvidence, ...update.media] : current.resolutionEvidence,
      updatedAt: update.timestamp,
      ...(update.status === 'accepted' ? { acceptedAt: update.timestamp } : {}),
      ...(update.status === 'in_progress' && !current.startedAt ? { startedAt: update.timestamp } : {}),
      ...(update.status === 'completed' ? { completedAt: update.timestamp } : {}),
    };
    
    workOrdersStore[index] = updated;

    // Sync with complaint status (temporarily disabled while moving to Supabase)
    if (update.status === 'proof_submitted') {
      // await complaintService.updateComplaintStatus(current.complaintId, 'proof_submitted');
    } else if (update.status === 'completed') {
       // await complaintService.updateComplaintStatus(current.complaintId, 'resolved');
    } else if (update.status === 'accepted') {
      // await complaintService.updateComplaintStatus(current.complaintId, 'accepted');
    } else if (update.status === 'in_progress') {
       // await complaintService.updateComplaintStatus(current.complaintId, 'in_progress');
    }

    return updated;
  }
};
