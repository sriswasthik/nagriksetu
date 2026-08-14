import { createClient } from "@/lib/supabase/client";

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

export async function signIn({
  email,
  password,
}: SignInInput) {
  const supabase = createClient();

  let authResult = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  // Fallback for legacy database accounts created before project rename
  if (authResult.error && authResult.error.message.includes("Invalid login credentials")) {
    const legacyEmail = email
      .replace("@citytrace.gov.in", "@nagriksetu.gov.in")
      .replace("@citytrace.temp", "@nagriksetu.temp");
      
    const legacyPassword = password === "placeholder-no-passwords-in-citytrace" 
      ? "placeholder-no-passwords-in-nagriksetu" 
      : password;

    if (legacyEmail !== email || legacyPassword !== password) {
      authResult = await supabase.auth.signInWithPassword({
        email: legacyEmail,
        password: legacyPassword,
      });
    }
  }

  const { data, error } = authResult;

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

export const authService = {
  login: async (credentials: { identifier: string; otp: string }) => {
    const supabase = createClient();
    const email = credentials.identifier.includes('@') ? credentials.identifier : `${credentials.identifier}@citytrace.temp`;
    
    let authResult = await supabase.auth.signInWithPassword({
      email,
      password: "placeholder-no-passwords-in-citytrace",
    });

    // Fallback for legacy database accounts created before project rename
    if (authResult.error && authResult.error.message.includes("Invalid login credentials")) {
      const legacyEmail = email
        .replace("@citytrace.gov.in", "@nagriksetu.gov.in")
        .replace("@citytrace.temp", "@nagriksetu.temp");

      if (legacyEmail !== email) {
        authResult = await supabase.auth.signInWithPassword({
          email: legacyEmail,
          password: "placeholder-no-passwords-in-nagriksetu",
        });
      }
    }

    const { data, error } = authResult;
    if (error) throw error;
    
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single();
      
    return {
      ...data,
      user: {
        ...data.user,
        role: profile?.role || data.user.user_metadata?.role || "citizen"
      }
    };
  },
  
  register: async (userData: { name: string; mobile: string; email: string; password?: string; role: string }) => {
    const supabase = createClient();
    const email = userData.email || `${userData.mobile}@citytrace.temp`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password: userData.password || "placeholder-no-passwords-in-citytrace",
      options: {
        data: {
          full_name: userData.name,
          phone: userData.mobile,
          role: userData.role
        }
      }
    });
    
    if (error) throw error;
    return data;
  },

  getCurrentUser: async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return null;
    
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
      
    return {
      id: user.id,
      name: profile?.full_name || user.user_metadata?.full_name || "User",
      email: user.email || "",
      avatar: profile?.avatar_url || "",
      role: profile?.role || user.user_metadata?.role || "citizen",
      department: profile?.department,
      mobile: profile?.phone || "",
      isVerified: true,
      createdAt: user.created_at || new Date().toISOString(),
      updatedAt: user.updated_at || user.created_at || new Date().toISOString(),
    } as any;
  },
  
  logout: async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }
};