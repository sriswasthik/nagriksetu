import {
  LayoutDashboard,
  FileText,
  MapPin,
  BarChart3,
  Building2,
  Grid3X3,
  ClipboardList,
  AlertTriangle,
  CheckCircle2,
  User,
  Bell,
  PlusCircle,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const citizenNav: NavItem[] = [
  { label: 'Dashboard', href: '/citizen', icon: LayoutDashboard },
  { label: 'Report Issue', href: '/citizen/report', icon: PlusCircle },
  { label: 'My Complaints', href: '/citizen/complaints', icon: FileText },
  { label: 'Notifications', href: '#notifications', icon: Bell },
  { label: 'Profile', href: '/citizen/profile', icon: User },
];

export const officerNav: NavItem[] = [
  { label: 'Overview', href: '/officer', icon: LayoutDashboard },
  { label: 'Work Orders', href: '/officer/work-orders', icon: ClipboardList },
  { label: 'Critical Issues', href: '/officer/work-orders?priority=critical', icon: AlertTriangle },
  { label: 'Verification', href: '/officer/work-orders?status=supervisor_review', icon: CheckCircle2 },
  { label: 'Profile', href: '/officer/profile', icon: User },
];

export const governmentNav: NavItem[] = [
  { label: 'Dashboard', href: '/government', icon: LayoutDashboard },
  { label: 'Complaints', href: '/government/complaints', icon: FileText },
  { label: 'Map View', href: '/government/map', icon: MapPin },
  { label: 'Analytics', href: '/government/analytics', icon: BarChart3 },
  { label: 'Departments', href: '/government/departments', icon: Building2 },
  { label: 'Wards', href: '/government/wards', icon: Grid3X3 },
];
