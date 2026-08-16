import type { UserRole } from "@/types/user";

/**
 * ============================================================
 * ROLE → WORKSPACE
 * ============================================================
 *
 * One table, used by everything that has to decide where a signed-in
 * user belongs: the proxy, each workspace layout, and the post-login
 * redirect. Three copies of this mapping would eventually disagree, and
 * the disagreement would be an authorization bug rather than a cosmetic
 * one.
 *
 * These are UI boundaries. They are not the security boundary — row-level
 * security is, and it applies whatever route a request came from. What
 * this gives is that an officer cannot sit on the government dashboard
 * watching every panel render its error state, and an unauthenticated
 * visitor never sees a protected shell at all.
 */

/** The four roles in the public.user_role enum. */
export const APP_ROLES = [
  "citizen",
  "officer",
  "supervisor",
  "government_admin",
] as const satisfies readonly UserRole[];

export function isAppRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" && APP_ROLES.includes(value as (typeof APP_ROLES)[number])
  );
}

/**
 * Where each role lands after signing in, and the route prefix it owns.
 *
 * Supervisors share the officer workspace: they do field oversight, and
 * `is_oversight()` already gives them the wider read in the database.
 */
export const WORKSPACE_FOR_ROLE: Record<UserRole, string> = {
  citizen: "/citizen",
  officer: "/officer",
  supervisor: "/officer",
  government_admin: "/government",
};

/**
 * Which roles may enter each workspace.
 *
 * `/government` admits supervisors as well as administrators, because
 * verification and the analytics they oversee live there. It is the
 * database that decides what they can actually read once inside.
 */
const WORKSPACE_ROLES: Record<string, readonly UserRole[]> = {
  "/citizen": ["citizen"],
  "/officer": ["officer", "supervisor", "government_admin"],
  "/government": ["supervisor", "government_admin"],
};

/** Route prefixes that require a session, longest first so matching is unambiguous. */
export const PROTECTED_PREFIXES = Object.keys(WORKSPACE_ROLES).sort(
  (a, b) => b.length - a.length
);

/** The workspace prefix a path belongs to, or null if the path is public. */
export function workspaceForPath(pathname: string): string | null {
  return (
    PROTECTED_PREFIXES.find(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    ) ?? null
  );
}

export function canRoleAccessWorkspace(
  role: UserRole,
  workspace: string
): boolean {
  return WORKSPACE_ROLES[workspace]?.includes(role) ?? false;
}

/**
 * Where to send a signed-in user who asked for a workspace that is not
 * theirs. Their own workspace, never an error page: a citizen who taps a
 * stale `/officer` link should land somewhere useful.
 */
export function homeForRole(role: UserRole): string {
  return WORKSPACE_FOR_ROLE[role] ?? "/citizen";
}

/** Auth pages a signed-in user has no reason to see. */
export function isAuthPath(pathname: string): boolean {
  return pathname === "/auth/login" || pathname === "/auth/register";
}
