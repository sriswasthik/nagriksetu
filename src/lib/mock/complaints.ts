import type { Complaint } from '@/types/complaint';

const now = new Date();
const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

export const mockComplaints: Complaint[] = [
  {
    id: 'CMP-2026-001',
    title: 'Large water leakage near government hospital',
    description: 'There is a massive water leak from the main pipe near the entrance of the district hospital. Water is flooding the road and making it difficult for ambulances to enter. This has been going on since yesterday evening.',
    category: 'water_leakage',
    status: 'assigned',
    priorityScore: 92,
    priorityLevel: 'critical',
    location: {
      latitude: 12.9716,
      longitude: 77.5946,
      address: 'Near District Hospital Main Gate, MG Road',
      ward: 'w-01'
    },
    media: [
      {
        id: 'med_1',
        url: 'https://images.unsplash.com/photo-1542385151-efd9000785a0?q=80&w=600&auto=format&fit=crop', // Placeholder for water leak
        type: 'image',
        uploadedAt: twoDaysAgo.toISOString()
      }
    ],
    citizenId: 'usr_citizen_1',
    citizenName: 'Rahul Sharma',
    departmentId: 'dept-water',
    departmentName: 'Water Supply',
    officerId: 'usr_officer_1',
    officerName: 'Priya Patel',
    workOrderId: 'WO-1024',
    aiAnalysis: {
      id: 'ai_001',
      complaintId: 'CMP-2026-001',
      category: 'water_leakage',
      categoryConfidence: 94,
      recommendedDepartment: 'dept-water',
      departmentConfidence: 98,
      priorityScore: 92,
      priorityLevel: 'critical',
      priorityFactors: [
        { factor: 'Location Proximity', impact: 'high', description: 'Near critical infrastructure (Hospital)', score: 35 },
        { factor: 'Hazard Level', impact: 'high', description: 'Flooding disrupting emergency access', score: 30 },
        { factor: 'Duplicate Volume', impact: 'medium', description: '4 similar reports in the last 12 hours', score: 15 },
        { factor: 'Time Pending', impact: 'medium', description: 'Reported 24+ hours ago', score: 12 }
      ],
      duplicateCheck: {
        hasDuplicates: true,
        similarCount: 4,
        nearbyDistance: 150,
        existingWorkOrderId: 'WO-1024',
        similarComplaints: [
          { complaintId: 'CMP-2026-002', title: 'Water pipe burst at MG Road', similarity: 89, distance: 45, status: 'assigned' },
          { complaintId: 'CMP-2026-005', title: 'Hospital road flooded', similarity: 85, distance: 120, status: 'triaged' }
        ]
      },
      sentiment: 'urgent',
      keywords: ['hospital', 'ambulance', 'flooding', 'leakage', 'main pipe'],
      processedAt: twoDaysAgo.toISOString(),
      isHumanReviewed: true
    },
    slaDeadline: new Date(now.getTime() + 18 * 60 * 60 * 1000).toISOString(),
    createdAt: twoDaysAgo.toISOString(),
    updatedAt: now.toISOString()
  },
  {
    id: 'CMP-2026-012',
    title: 'Large pothole causing traffic near college junction',
    description: 'A huge pothole has formed right in the middle of the college junction. Two-wheelers are skidding trying to avoid it. Traffic is moving very slowly as cars have to navigate around it.',
    category: 'pothole',
    status: 'citizen_confirmation',
    priorityScore: 78,
    priorityLevel: 'high',
    location: {
      latitude: 12.9650,
      longitude: 77.5850,
      address: 'College Junction, University Road',
      ward: 'w-03'
    },
    media: [],
    citizenId: 'usr_citizen_1',
    citizenName: 'Rahul Sharma',
    departmentId: 'dept-roads',
    departmentName: 'Roads & Infrastructure',
    workOrderId: 'WO-1015',
    slaDeadline: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    createdAt: fiveDaysAgo.toISOString(),
    updatedAt: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'CMP-2026-024',
    title: 'Garbage accumulation for four days',
    description: 'The garbage collection van hasn\'t come for the last four days in our sector. The communal bins are overflowing onto the street and stray animals are spreading it everywhere. The smell is unbearable.',
    category: 'garbage',
    status: 'in_progress',
    priorityScore: 65,
    priorityLevel: 'medium',
    location: {
      latitude: 12.9800,
      longitude: 77.6100,
      address: 'Sector 4, Market Area',
      ward: 'w-05'
    },
    media: [],
    citizenId: 'usr_citizen_1',
    citizenName: 'Rahul Sharma',
    departmentId: 'dept-san',
    departmentName: 'Sanitation',
    workOrderId: 'WO-1030',
    slaDeadline: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
    createdAt: threeDaysAgo.toISOString(),
    updatedAt: now.toISOString()
  },
  {
    id: 'CMP-2026-035',
    title: 'Streetlight not working near bus stop',
    description: 'The streetlight directly above the women\'s college bus stop has been dead for a week. It is completely pitch dark after 7 PM making it very unsafe for students waiting for buses.',
    category: 'streetlight',
    status: 'submitted',
    priorityScore: 85,
    priorityLevel: 'high',
    location: {
      latitude: 12.9550,
      longitude: 77.6050,
      address: 'Women\'s College Bus Stop, Ring Road',
      ward: 'w-02'
    },
    media: [],
    citizenId: 'usr_citizen_2',
    citizenName: 'Anjali Verma',
    createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
  }
];
