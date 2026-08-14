export const APP_NAME = 'NagrikSetu';
export const APP_TAGLINE = 'From Citizen Voices to Smarter Governance';
export const APP_DESCRIPTION = 'Transform civic complaints into intelligent, prioritized, trackable and verifiable civic operations.';

export const COLORS = {
  primary: '#7EC151',
  secondary: '#1C3318',
  foreground: '#182816',
  background: '#F9FBF6',
} as const;

export const DEPARTMENTS = [
  { id: 'dept-eng', name: 'Engineering', code: 'ENG' },
  { id: 'dept-san', name: 'Sanitation', code: 'SAN' },
  { id: 'dept-elec', name: 'Electrical', code: 'ELEC' },
  { id: 'dept-water', name: 'Water Supply', code: 'WTR' },
  { id: 'dept-roads', name: 'Roads & Infrastructure', code: 'RDS' },
] as const;

export const SLA_HOURS: Record<string, number> = {
  critical: 24,
  high: 48,
  medium: 72,
  low: 120,
};

export const COMPLAINT_CATEGORIES = [
  { value: 'water_leakage', label: 'Water Leakage', icon: 'Droplets' },
  { value: 'pothole', label: 'Pothole', icon: 'Circle' },
  { value: 'garbage', label: 'Garbage Collection', icon: 'Trash2' },
  { value: 'drainage', label: 'Drainage Issue', icon: 'Waves' },
  { value: 'streetlight', label: 'Streetlight', icon: 'Lightbulb' },
  { value: 'road_damage', label: 'Road Damage', icon: 'Construction' },
  { value: 'sewage', label: 'Sewage Problem', icon: 'Pipette' },
  { value: 'noise', label: 'Noise Pollution', icon: 'Volume2' },
  { value: 'encroachment', label: 'Encroachment', icon: 'ShieldAlert' },
  { value: 'other', label: 'Other', icon: 'HelpCircle' },
] as const;

export const DEFAULT_MAP_CENTER = {
  lat: 12.9716,
  lng: 77.5946,
} as const;

export const DEFAULT_MAP_ZOOM = 13;
