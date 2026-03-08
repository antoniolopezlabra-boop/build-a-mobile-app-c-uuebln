import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { Session, User } from "@supabase/supabase-js";

interface AppUser {
  id: string;
  email: string;
  name: string;
}

interface BusinessProfile {
  id: string;
  userId: string;
  businessName: string;
  businessType: string;
  address?: string | null;
  phone?: string | null;
  alternativePhone?: string | null;
  logoUrl?: string | null;
  weeklySchedule?: any;
}

interface AuthContextType {
  user: AppUser | null;
  businessProfile: BusinessProfile | null;
  loading: boolean;
  authLoading: boolean;
  register: (params: { email: string; password: string; name: string; businessName: string; businessType: string }) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  fetchUser: () => Promise<void>;
  refreshBusinessProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    // Escuchar cambios de sesión
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("[Auth] State change:", event);
      if (event === "USER_UPDATED") return;
      if (session?.user) {
        await loadUserData(session.user);
      } else {
        setUser(null);
        setBusinessProfile(null);
        setLoading(false);
      }
    });

    // Verificar sesión inicial
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await loadUserData(session.user);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const trackSession = async (userId: string) => {
    try {
      await supabase.from('user_sessions').upsert(
        { user_id: userId, last_seen_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
    } catch (e) {}
  };

  const loadUserData = async (supabaseUser: User) => {
    try {
      trackSession(supabaseUser.id);
      const appUser: AppUser = {
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        name: supabaseUser.user_metadata?.name || supabaseUser.email || '',
      };
      setUser(appUser);
      await loadBusinessProfile(supabaseUser.id);
    } catch (error) {
      console.error('[Auth] Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBusinessProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        setBusinessProfile(null);
        return;
      }

      setBusinessProfile({
        id: data.id,
        userId: data.user_id,
        businessName: data.business_name,
        businessType: data.business_type,
        address: data.address,
        phone: data.phone,
        alternativePhone: data.alternative_phone,
        logoUrl: data.logo_url,
        weeklySchedule: data.weekly_schedule,
      });
    } catch (error) {
      console.error('[Auth] Error loading business profile:', error);
      setBusinessProfile(null);
    }
  };

  const register = async (params: { email: string; password: string; name: string; businessName: string; businessType: string }) => {
    try {
      setAuthLoading(true);
      console.log('[Auth] Registering user:', params.email);

      const { data, error } = await supabase.auth.signUp({
        email: params.email,
        password: params.password,
        options: {
          data: { name: params.name, businessName: params.businessName, businessType: params.businessType },
        },
      });

      if (error) throw error;
      if (!data.user) throw new Error('No user returned');


      console.log('[Auth] Registration successful');
    } catch (error) {
      console.error('[Auth] Registration error:', error);
      throw error;
    } finally {
      setAuthLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setAuthLoading(true);
      console.log('[Auth] Logging in:', email);

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      console.log('[Auth] Login successful');
    } catch (error) {
      console.error('[Auth] Login error:', error);
      throw error;
    } finally {
      setAuthLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setAuthLoading(true);
      await supabase.auth.signOut();
      const { router } = await import('expo-router');
      router.replace('/auth/login');
    } catch (error) {
      console.error('[Auth] Sign out error:', error);
    } finally {
      setAuthLoading(false);
    }
  };

  const fetchUser = async () => {
    const { data: { user: supabaseUser } } = await supabase.auth.getUser();
    if (supabaseUser) await loadUserData(supabaseUser);
  };

  const refreshBusinessProfile = async () => {
    const { data: { user: supabaseUser } } = await supabase.auth.getUser();
    if (supabaseUser) await loadBusinessProfile(supabaseUser.id);
  };

  return (
    <AuthContext.Provider value={{ user, businessProfile, loading, authLoading, register, login, signOut, fetchUser, refreshBusinessProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
