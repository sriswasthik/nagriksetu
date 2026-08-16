import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/user";
import { homeForRole, isAppRole } from "@/lib/auth/roles";

/**
 * ============================================================
 * SERVER-SIDE WORKSPACE GUARD
 * ============================================================
 *
 * Called from each workspace layout. The proxy already gates these
 * routes, so in normal operation this never redirects — it is here
 * because a single check in a single file is a single point of failure,
 * and the matcher is the kind of thing that gets edited.
 *
 * It also has a second, less obvious effect worth keeping: reading
 * cookies makes the layout dynamic. Before this, `/citizen`, `/officer`
 * and `/government` were statically prerendered (`○` in the build
 * output), so their shells could be served straight from a CDN edge
 * without any request ever reaching the proxy. The data was still safe —
 * it is fetched client-side under RLS — but the workspace chrome
 * rendered for anyone who asked. Now they are `ƒ`, and every hit is
 * authenticated.
 *
 * getUser() rather than getClaims(): this is the last check before
 * protected chrome renders, so it is worth the round trip to the auth
 * server to confirm the token has not been revoked.
 */
export interface SessionContext {
  userId: string;
  role: UserRole;
}

export async function requireWorkspace(
  allowed: readonly UserRole[]
): Promise<SessionContext> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  /*
   * Never fall back to user.user_metadata.role. It is writable by the
   * user at sign-up, so trusting it here would let anyone mint
   * themselves an administrator by passing a role during registration.
   */
  if (!isAppRole(profile?.role)) {
    redirect("/auth/login?error=profile-unavailable");
  }

  const role = profile.role;

  if (!allowed.includes(role)) {
    redirect(homeForRole(role));
  }

  return { userId: user.id, role };
}
