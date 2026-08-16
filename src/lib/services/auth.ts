import { createClient } from "@/lib/supabase/client";
import { isAppRole } from "@/lib/auth/roles";
import type { UserRole } from "@/types/user";

/**
 * ============================================================
 * AUTHENTICATION
 * ============================================================
 *
 * WHAT WAS REMOVED, AND WHY
 *
 * `authService.login` and `authService.register` are gone. They were
 * dead — nothing imported them; the login and registration pages use
 * signIn/signUp — but they were also a working authentication bypass, so
 * deleting them matters more than the line count suggests:
 *
 *   * `login({ identifier, otp })` ignored `otp` entirely and called
 *     signInWithPassword with the literal
 *     "placeholder-no-passwords-in-citytrace". `register` created
 *     accounts with that same constant when no password was supplied.
 *     Any account made that way could be signed into by anyone who knew
 *     the email or mobile number — the string is in the client bundle.
 *
 *   * `register` copied a caller-supplied `role` into user_metadata,
 *     which is user-writable at sign-up.
 *
 *   * Role resolution then read
 *     `profile?.role || user.user_metadata?.role`, so a failed or empty
 *     profile read promoted the user to whatever role they had declared
 *     for themselves. Registering with `role: "government_admin"` and
 *     arranging for the profile lookup to come back empty was a complete
 *     privilege escalation.
 *
 * The same constant-password fallback lived in `signIn`, dressed as a
 * compatibility shim for accounts predating the CityTrace rename. It
 * retried failed logins against `@nagriksetu.*` addresses with
 * "placeholder-no-passwords-in-nagriksetu", which made the bypass
 * reachable from the real login form. Also removed.
 *
 * Role now comes from public.profiles and nowhere else. A profile that
 * cannot be read is an error, not a citizen.
 */

export interface SignUpInput {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export async function signUp({
  fullName,
  email,
  password,
  phone,
}: SignUpInput) {
  const supabase = createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      /*
       * Deliberately no `role` here. handle_new_user() creates every
       * profile as a citizen, and staff are appointed with
       * public.set_user_role(); anything sent in this object is
       * attacker-controlled and must never influence authorization.
       */
      data: {
        full_name: fullName,
        phone: phone ?? null,
      },
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signIn({ email, password }: SignInInput) {
  const supabase = createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signOut() {
  const supabase = createClient();

  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function getCurrentUser() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function getCurrentProfile() {
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/** The shape the header menu and profile view render. */
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: UserRole;
  department?: string;
  mobile: string;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export const authService = {
  /**
   * The signed-in user, or null.
   *
   * Returns null rather than a partially-populated object when the
   * profile cannot be read. The previous version defaulted the role to
   * "citizen" in that case, which read as a safe fallback but was not:
   * combined with the user_metadata fallback it silently decided
   * authorization from data the user controlled. A missing profile is a
   * real failure and the caller should treat the visitor as signed out.
   */
  getCurrentUser: async (): Promise<CurrentUser | null> => {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, role, avatar_url, created_at, updated_at")
      .eq("id", user.id)
      .maybeSingle();

    if (error || !profile || !isAppRole(profile.role)) {
      console.error("Profile unavailable for signed-in user", error?.message);
      return null;
    }

    return {
      id: user.id,
      name: profile.full_name || "User",
      email: profile.email || user.email || "",
      avatar: profile.avatar_url || "",
      role: profile.role,
      mobile: profile.phone || "",
      isVerified: Boolean(user.email_confirmed_at),
      createdAt: profile.created_at || user.created_at,
      updatedAt: profile.updated_at || profile.created_at || user.created_at,
    };
  },

  logout: async () => {
    const supabase = createClient();

    const { error } = await supabase.auth.signOut();

    if (error) throw error;
  },
};
