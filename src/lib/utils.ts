import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const target = new Date(date);
  const diffMs = now.getTime() - target.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

export function generateId(prefix: string = ''): string {
  const id = Math.random().toString(36).substring(2, 9).toUpperCase();
  return prefix ? `${prefix}-${id}` : id;
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trimEnd() + '…';
}

export function getPriorityColor(level: string): string {
  switch (level) {
    case 'critical': return 'text-red-700 bg-red-50 border-red-200';
    case 'high': return 'text-orange-700 bg-orange-50 border-orange-200';
    case 'medium': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'low': return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    default: return 'text-gray-700 bg-gray-50 border-gray-200';
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'resolved':
    case 'verified':
      return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'in_progress':
    case 'accepted':
      return 'text-blue-700 bg-blue-50 border-blue-200';
    case 'submitted':
    case 'assigned':
      return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'rejected':
    case 'reopened':
      return 'text-red-700 bg-red-50 border-red-200';
    case 'supervisor_review':
    case 'proof_submitted':
    case 'citizen_confirmation':
      return 'text-purple-700 bg-purple-50 border-purple-200';
    default:
      return 'text-gray-700 bg-gray-50 border-gray-200';
  }
}

export function formatSLATime(hours: number): string {
  if (hours <= 0) return 'Breached';
  if (hours < 1) return `${Math.round(hours * 60)}m remaining`;
  if (hours < 24) return `${Math.round(hours)}h remaining`;
  return `${Math.round(hours / 24)}d remaining`;
}

export function getSLAUrgency(hours: number): 'safe' | 'warning' | 'danger' {
  if (hours <= 0) return 'danger';
  if (hours <= 6) return 'warning';
  return 'safe';
}
