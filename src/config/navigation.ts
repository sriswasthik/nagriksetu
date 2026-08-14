import {
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  FileText,
  Grid3X3,
  LayoutDashboard,
  Map,
  MapPin,
  PlusCircle,
  ShieldCheck,
  User,
  type LucideIcon,
} from 'lucide-react';

export type NavType = 'citizen' | 'officer' | 'government';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
  /** Short hint shown in the mobile drawer. */
  hint?: string;
  /** Surfaced in the mobile bottom bar (max 4 per role + More). */
  primary?: boolean;
  /** Rendered as the emphasised call-to-action in the sidebar. */
  emphasis?: boolean;
  /** Match only on exact pathname, for section index routes. */
  exact?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/**
 * ============================================================
 * CITIZEN
 * ============================================================
 * Ordered by how often a citizen needs it: see status, report,
 * track, explore, then account.
 */
export const citizenNav: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/citizen',
    icon: LayoutDashboard,
    hint: 'Your reports at a glance',
    primary: true,
    exact: true,
  },
  {
    label: 'Report Issue',
    href: '/citizen/report',
    icon: PlusCircle,
    hint: 'Report a civic problem',
    primary: true,
    emphasis: true,
  },
  {
    label: 'My Issues',
    href: '/citizen/complaints',
    icon: FileText,
    hint: 'Track everything you have reported',
    primary: true,
  },
  {
    label: 'Nearby Issues',
    href: '/citizen/map',
    icon: Map,
    hint: 'See what is happening around you',
    primary: true,
  },
  {
    label: 'Notifications',
    href: '/citizen/notifications',
    icon: Bell,
    hint: 'Updates on your reports',
  },
  {
    label: 'Profile',
    href: '/citizen/profile',
    icon: User,
    hint: 'Account and preferences',
  },
];

/**
 * ============================================================
 * OFFICER — field operations
 * ============================================================
 */
export const officerNav: NavItem[] = [
  {
    label: 'Overview',
    href: '/officer',
    icon: LayoutDashboard,
    hint: 'Today’s workload',
    primary: true,
    exact: true,
  },
  {
    label: 'Work Orders',
    href: '/officer/work-orders',
    icon: ClipboardList,
    hint: 'Your assigned tasks',
    primary: true,
  },
  {
    label: 'Profile',
    href: '/officer/profile',
    icon: User,
    hint: 'Account and preferences',
    primary: true,
  },
];

/**
 * ============================================================
 * AUTHORITY — city operations centre
 * ============================================================
 * Grouped because this role has genuinely distinct concerns:
 * running the queue vs. analysing performance.
 */
export const governmentNavSections: NavSection[] = [
  {
    label: 'Operations',
    items: [
      {
        label: 'Overview',
        href: '/government',
        icon: LayoutDashboard,
        hint: 'City-wide operational picture',
        primary: true,
        exact: true,
      },
      {
        label: 'Issue Queue',
        href: '/government/complaints',
        icon: ClipboardList,
        hint: 'Triage and assign incoming reports',
        primary: true,
      },
      {
        label: 'Map View',
        href: '/government/map',
        icon: MapPin,
        hint: 'Geographic hotspots',
        primary: true,
      },
    ],
  },
  {
    label: 'Insight',
    items: [
      {
        label: 'Analytics',
        href: '/government/analytics',
        icon: BarChart3,
        hint: 'Resolution and SLA performance',
        primary: true,
      },
      {
        label: 'Departments',
        href: '/government/departments',
        icon: Building2,
        hint: 'Workload by department',
      },
      {
        label: 'Wards',
        href: '/government/wards',
        icon: Grid3X3,
        hint: 'Ward-level health',
      },
    ],
  },
];

/** Flattened authority nav, for the mobile bar and active matching. */
export const governmentNav: NavItem[] = governmentNavSections.flatMap(
  (section) => section.items
);

/** Sectioned view of any role's navigation. */
export function getNavSections(navType: NavType): NavSection[] {
  if (navType === 'government') return governmentNavSections;
  if (navType === 'officer') return [{ label: 'Field Operations', items: officerNav }];
  return [{ label: 'Menu', items: citizenNav }];
}

export function getNavItems(navType: NavType): NavItem[] {
  if (navType === 'government') return governmentNav;
  if (navType === 'officer') return officerNav;
  return citizenNav;
}

/** Items promoted into the mobile bottom bar. */
export function getPrimaryNavItems(navType: NavType): NavItem[] {
  return getNavItems(navType).filter((item) => item.primary);
}

/**
 * Active-state resolver shared by every navigation surface, so the
 * sidebar, mobile drawer and bottom bar always agree.
 *
 * Deliberately pathname-only: nav items never carry query strings,
 * because reading them (useSearchParams) would opt every page out
 * of static prerendering just to style the chrome. Status/priority
 * filtering belongs to the page it filters, not the navigation.
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === pathname) return true;

  // A section stays active for its child routes, unless it is an
  // exact-match index route (e.g. /citizen vs /citizen/report).
  if (!item.exact && item.href !== '/' && pathname.startsWith(`${item.href}/`)) {
    return true;
  }

  return false;
}
