import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  canRoleAccessWorkspace,
  homeForRole,
  isAppRole,
  isAuthPath,
  workspaceForPath,
} from "@/lib/auth/roles";

/**
 * ============================================================
 * SESSION REFRESH + ROUTE AUTHORIZATION
 * ============================================================
 *
 * This used to call getClaims() purely to refresh the session and then
 * return, so `/officer` and `/government` were reachable by anyone with
 * the URL — including signed-out visitors. Row-level security meant they
 * saw empty panels rather than other people's data, but a stranger
 * walking into the municipal operations centre and watching it render is
 * not the intended behaviour.
 *
 * Two things happen here now:
 *
 *   1. The session is refreshed, exactly as before. Every cookie the
 *      Supabase client sets has to be copied onto the response or the
 *      refreshed token is lost, which is why the response is rebuilt
 *      inside setAll rather than mutated afterwards.
 *
 *   2. Protected routes are gated. No session → the login page. Wrong
 *      role → that user's own workspace. Already signed in and asking
 *      for the login page → their workspace.
 *
 * This is not the security boundary. Row-level security is, and it holds
 * regardless of how a request arrives — a direct PostgREST call bypasses
 * this file completely. What this adds is that the wrong person never
 * gets as far as a protected shell, and that redirects happen before any
 * of it renders.
 */

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const { pathname } = request.nextUrl;
  const workspace = workspaceForPath(pathname);

  /*
   * Misconfigured deployment. createServerClient() throws on undefined
   * credentials, which would turn every route — public ones included —
   * into a 500. Fail closed instead: protected routes go to the login
   * page, public routes still render. No session can be verified without
   * these, so nothing may be admitted.
   */
  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "Supabase environment variables are missing; refusing all protected routes."
    );

    return workspace
      ? NextResponse.redirect(new URL("/auth/login", request.url))
      : response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },

      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  /*
   * getClaims() both refreshes an expiring session and tells us whether
   * there is one. A stale or tampered token yields no claims, so an
   * expired session is treated as signed out rather than trusted.
   */
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub ?? null;

  // Public route with no session: nothing to decide.
  if (!workspace && !isAuthPath(pathname)) {
    return response;
  }

  if (!userId) {
    if (!workspace) {
      // Signed-out visitor on an auth page — where they should be.
      return response;
    }

    /*
     * Remember where they were headed so signing in can return them
     * there. Only in-app paths are carried, so the parameter cannot be
     * used to bounce someone to another origin after login.
     */
    const login = new URL("/auth/login", request.url);
    const target = `${pathname}${request.nextUrl.search}`;

    if (target.startsWith("/") && !target.startsWith("//")) {
      login.searchParams.set("next", target);
    }

    return redirectPreservingCookies(login, response);
  }

  /*
   * The role lives in public.profiles, not in the JWT, so it costs one
   * primary-key lookup per protected navigation. Reading it from
   * user_metadata would be free and wrong: that object is writable by
   * the user at sign-up, so a self-declared "government_admin" would
   * walk straight through this check.
   */
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const role = isAppRole(profile?.role) ? profile.role : null;

  if (!role) {
    /*
     * Authenticated but with no readable profile, or a role this build
     * does not recognise. Fail closed: send them to the login page
     * rather than guessing at citizen access.
     */
    if (isAuthPath(pathname)) {
      return response;
    }

    const login = new URL("/auth/login", request.url);
    login.searchParams.set("error", "profile-unavailable");
    return redirectPreservingCookies(login, response);
  }

  // Signed in, so the auth pages are behind them.
  if (isAuthPath(pathname)) {
    return redirectPreservingCookies(
      new URL(homeForRole(role), request.url),
      response
    );
  }

  if (workspace && !canRoleAccessWorkspace(role, workspace)) {
    return redirectPreservingCookies(
      new URL(homeForRole(role), request.url),
      response
    );
  }

  return response;
}

/**
 * Redirects without dropping a refreshed session.
 *
 * NextResponse.redirect() starts from a blank response, so any cookie
 * the Supabase client just set on `response` — including a rotated
 * refresh token — would be discarded, signing the user out on the very
 * request that renewed them.
 */
function redirectPreservingCookies(
  destination: URL,
  carrying: NextResponse
): NextResponse {
  const redirect = NextResponse.redirect(destination);

  carrying.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie);
  });

  return redirect;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
