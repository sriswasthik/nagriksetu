export const APP_NAME = 'CityTrace';
export const APP_TAGLINE = 'From Citizen Voices to Smarter Governance';
export const APP_DESCRIPTION = 'Transform civic complaints into intelligent, prioritized, trackable and verifiable civic operations.';

/**
 * Brand palette, mirroring the design tokens in app/globals.css.
 *
 * The merge auto-resolved this to main's zinc values, which would have
 * left it silently contradicting the actual CityTrace tokens. Nothing
 * imports it today (components read the CSS variables), so it is kept
 * only as documentation — and it must agree with globals.css.
 */
export const COLORS = {
  primary: '#853953',
  secondary: '#612D53',
  foreground: '#2C2C2C',
  background: '#F3F4F4',
} as const;

/*
 * DEPARTMENTS was removed.
 *
 * It listed five departments keyed by the literals 'dept-eng',
 * 'dept-san', 'dept-elec', 'dept-water' and 'dept-roads' with codes
 * ENG/SAN/ELEC/WTR/RDS. None of that matched the database:
 * public.departments is keyed by uuid, and the codes ai.ts resolves
 * against are ROADS/SANITATION/WATER/DRAINAGE/ELECTRICAL/TRAFFIC/
 * SAFETY/OTHER. Filtering a real work order by one of these ids could
 * never match, so the authority queue's department filter silently
 * returned nothing.
 *
 * Read departments from the database instead:
 * referenceService.getDepartments() in src/lib/services/reference.ts.
 */

/**
 * Service-level targets per priority, in hours.
 *
 * Kept in step with set_complaint_sla_due_at() in
 * supabase/migrations/20260814120100_workflow_integrity_and_reference_data.sql,
 * which is what actually stamps complaints.sla_due_at. This copy is for
 * display only — changing it here does not change any deadline.
 */
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
