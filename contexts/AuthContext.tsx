import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { router } from 'expo-router';
import { supabase } from "@/lib/supabase";
import { Session, User } from "@supabase/supabase-js";
import { invalidateCache, setCacheUserId } from "@/utils/cache";
import { logger } from "@/utils/logger";

interface AppUser {
  id: string;
  email: string;
  name: string;
}

export interface StaffMemberData {
  id: string;
  name: string;
  organizationUserId: string;
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
  weeklySchedule?: Record<string, any>;
}

interface AuthContextType {
  user: AppUser | null;
  businessProfile: BusinessProfile | null;
  loading: boolean;
  authLoading: boolean;
  isStaffAccount: boolean;
  staffMemberData: StaffMemberData | null;
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
  const [isStaffAccount, setIsStaffAccount] = useState(false);
  const [staffMemberData, setStaffMemberData] = useState<StaffMemberData | null>(null);

  // FIX race condition: los dos listeners (onAuthStateChange + getSession) podían
  // cargar datos dos veces al arranque. Este ref detecta si ya cargamos para el usuario actual.
  const loadedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      logger.log("[Auth] State change:", event);
      if (event === "USER_UPDATED") return;

      if (session?.user) {
        // Si ya cargamos este usuario, no volvemos a cargar (evita double-fetch al arranque)
        if (loadedUserIdRef.current === session.user.id) return;
        loadedUserIdRef.current = session.user.id;
        // PERF+SEC (Abr 2026): registrar userId en el cache para aislamiento automático
        setCacheUserId(session.user.id);
        await loadUserData(session.user);
      } else {
        loadedUserIdRef.current = null;
        setCacheUserId(null);
        setUser(null);
        setBusinessProfile(null);
        setIsStaffAccount(false);
        setStaffMemberData(null);
        setLoading(false);
      }
    });

    // Carga inicial: solo si onAuthStateChange no se disparó primero
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        if (loadedUserIdRef.current === session.user.id) return;
        loadedUserIdRef.current = session.user.id;
        // PERF+SEC: registrar userId en el cache al arranque con sesión existente
        setCacheUserId(session.user.id);
        await loadUserData(session.user);
      } else {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const trackSession = async (userId: string) => {
    try {
      await supabase.from('user_sessions').upsert(
        { user_id: userId, last_seen_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
    } catch (e) {
      logger.warn('[Auth] trackSession failed:', e);
    }
  };

  const checkStaffAccount = async (userId: string): Promise<StaffMemberData | null> => {
    try {
      const { data } = await supabase
        .from('staff_accounts')
        .select('staff_member_id, organization_user_id, staff_members(name)')
        .eq('user_id', userId)
        .single();
      if (!data) return null;
      return {
        id: data.staff_member_id,
        name: (data.staff_members as any)?.name ?? '',
        organizationUserId: data.organization_user_id,
      };
    } catch {
      return null;
    }
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

      // Detectar si es una cuenta de colaborador (en paralelo con el perfil)
      const [staffData] = await Promise.all([
        checkStaffAccount(supabaseUser.id),
        loadBusinessProfile(supabaseUser.id),
      ]);

      if (staffData) {
        setIsStaffAccount(true);
        setStaffMemberData(staffData);
      } else {
        setIsStaffAccount(false);
        setStaffMemberData(null);
      }
    } catch (error) {
      logger.error('[Auth] Error loading user data:', error);
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
      logger.error('[Auth] Error loading business profile:', error);
      setBusinessProfile(null);
    }
  };

  const register = async (params: { email: string; password: string; name: string; businessName: string; businessType: string }) => {
    try {
      setAuthLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email: params.email,
        password: params.password,
        options: {
          data: { name: params.name, businessName: params.businessName, businessType: params.businessType },
        },
      });
      if (error) throw error;
      if (!data.user) throw new Error('No user returned');
    } catch (error) {
      logger.error('[Auth] Registration error:', error);
      throw error;
    } finally {
      setAuthLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setAuthLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (error) {
      logger.error('[Auth] Login error:', error);
      throw error;
    } finally {
      setAuthLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setAuthLoading(true);
      invalidateCache();
      setCacheUserId(null); // Limpiar el userId registrado en el cache
      loadedUserIdRef.current = null;
      setIsStaffAccount(false);
      setStaffMemberData(null);
      await supabase.auth.signOut();
      router.replace('/auth/login');
    } catch (error) {
      logger.error('[Auth] Sign out error:', error);
    } finally {
      setAuthLoading(false);
    }
  };

  const fetchUser = async () => {
    const { data: { user: supabaseUser } } = await supabase.auth.getUser();
    if (supabaseUser) {
      // Forzar recarga
      loadedUserIdRef.current = null;
      setCacheUserId(supabaseUser.id);
      await loadUserData(supabaseUser);
      loadedUserIdRef.current = supabaseUser.id;
    }
  };

  const refreshBusinessProfile = async () => {
    const { data: { user: supabaseUser } } = await supabase.auth.getUser();
    if (supabaseUser) await loadBusinessProfile(supabaseUser.id);
  };

  return (
    <AuthContext.Provider value={{
      user, businessProfile, loading, authLoading,
      isStaffAccount, staffMemberData,
      register, login, signOut, fetchUser, refreshBusinessProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
