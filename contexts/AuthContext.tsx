import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  // ⚡ FIX (May 23 2026): Campos de ubicación detallada agregados a la BD
  // en commit 9ea25f6c. Sin estos en la interface, el form de Ajustes y
  // el wizard de onboarding no podían leer los valores guardados de la
  // BD aunque los hubieran escrito correctamente.
  state?: string | null;
  city?: string | null;
  postalCode?: string | null;
  street?: string | null;
}

interface AuthContextType {
  user: AppUser | null;
  businessProfile: BusinessProfile | null;
  // ⚡ FIX (May 2026) anti-parpadeo de setup wizard:
  // businessProfileLoaded indica si YA terminó el primer fetch a Supabase para
  // saber si el usuario tiene perfil. true = ya sabemos (haya o no perfil);
  // false = aún cargando, NO se debe tomar decisiones de routing todavía.
  businessProfileLoaded: boolean;
  loading: boolean;
  authLoading: boolean;
  isStaffAccount: boolean;
  staffMemberData: StaffMemberData | null;
  register: (params: { email: string; password: string; name: string }) => Promise<any>;
  login: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  fetchUser: () => Promise<void>;
  refreshBusinessProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  // ⚡ FIX (May 2026): este flag se setea a true UNA VEZ que el primer fetch a
  // business_profiles termina, sin importar si encontró perfil o no. Esto
  // permite al NavigationGuard distinguir entre "aún cargando" y "no tiene".
  const [businessProfileLoaded, setBusinessProfileLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [isStaffAccount, setIsStaffAccount] = useState(false);
  const [staffMemberData, setStaffMemberData] = useState<StaffMemberData | null>(null);

  const loadedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      logger.log("[Auth] State change:", event);
      if (event === "USER_UPDATED") return;

      if (session?.user) {
        if (loadedUserIdRef.current === session.user.id) return;
        loadedUserIdRef.current = session.user.id;
        setCacheUserId(session.user.id);

        // ⚡ FIX onboarding loop (May 17 2026):
        // Cualquier sesión activa válida (recuperada al abrir la app o
        // resultado de login) marca el dispositivo como "ya vio onboarding".
        // Esto sobrevive a logout → login posterior y previene el bug donde
        // el usuario veía las 3 pantallas de marketing después de cerrar sesión.
        markOnboardingSeen();

        await loadUserData(session.user);
      } else {
        loadedUserIdRef.current = null;
        setCacheUserId(null);
        setUser(null);
        setBusinessProfile(null);
        // Reset al cerrar sesión para que el próximo login espere el fetch.
        setBusinessProfileLoaded(false);
        setIsStaffAccount(false);
        setStaffMemberData(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        if (loadedUserIdRef.current === session.user.id) return;
        loadedUserIdRef.current = session.user.id;
        setCacheUserId(session.user.id);

        // ⚡ Mismo fix aplicado al recuperar la sesión al abrir la app.
        markOnboardingSeen();

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

  // ══════════════════════════════════════════════════════════════════════
  // ⚡ markOnboardingSeen — Helper anti-loop onboarding (May 17 2026)
  //
  // PROBLEMA RESUELTO:
  // Al cerrar sesión, el guard re-evaluaba y mandaba al usuario al
  // onboarding marketing (3 slides: "Tu link de citas", "Recordatorios
  // automáticos", "Cada cliente regresa") porque el flag
  // `has_seen_onboarding` en AsyncStorage podía estar ausente:
  //   - Reinstalación de la app → AsyncStorage limpio
  //   - Limpieza de caché desde Android Settings
  //   - Usuarios que upgradearon desde versión vieja sin el flag
  //
  // SOLUCIÓN:
  // El onboarding marketing solo tiene sentido para alguien que NUNCA ha
  // logueado en este dispositivo. Cualquier sesión exitosa (sea login,
  // registro, o recuperación de sesión al abrir la app) implica que el
  // dispositivo "ya conoce la app". Por eso seteamos el flag aquí, no
  // solo cuando el usuario completa las 3 slides del onboarding.
  //
  // Es idempotente: si el flag ya estaba en true, sobrescribir con true
  // es no-op silencioso, no genera lag ni I/O extra significativo.
  // ══════════════════════════════════════════════════════════════════════
  const markOnboardingSeen = async () => {
    try {
      await AsyncStorage.setItem('has_seen_onboarding', 'true');
    } catch (e) {
      // No crítico — si AsyncStorage falla aquí, el peor caso es que el
      // usuario vea el onboarding una vez más; nada se rompe.
      logger.warn('[Auth] markOnboardingSeen failed:', e);
    }
  };

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
        .maybeSingle(); // ⚡ maybeSingle (no single) para no tirar error si no existe

      if (error) {
        logger.error('[Auth] Error loading business profile:', error);
        setBusinessProfile(null);
        return;
      }

      if (!data) {
        // Sin perfil = usuario nuevo que no ha completado el setup wizard
        setBusinessProfile(null);
        return;
      }

      // ⚡ FIX (May 23 2026): incluir los 4 campos de ubicación en el mapeo.
      // ANTES: el mapeo solo exponía business_name, business_type, address,
      // phone, alternative_phone, logo_url, weekly_schedule. Los campos
      // state/city/postal_code/street se quedaban en data pero NUNCA se
      // pasaban al state del context, por lo que el form de Mi Negocio y el
      // wizard leían `businessProfile.state` y obtenían `undefined`.
      //
      // Eso causaba el bug que Antonio reportó: "los campos vuelven a
      // aparecer vacíos al volver a entrar a Mi Negocio aunque ya los había
      // llenado y guardado". Los datos SÍ se guardaban en BD pero nunca se
      // leían correctamente del contexto.
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
        // ─── Campos de ubicación (NUEVOS May 23 2026) ───
        state: data.state || null,
        city: data.city || null,
        postalCode: data.postal_code || null,
        street: data.street || null,
      });
    } catch (error) {
      logger.error('[Auth] Error loading business profile:', error);
      setBusinessProfile(null);
    } finally {
      // ⚡ CRÍTICO: independientemente de si encontramos perfil o no,
      // marcamos como "ya intentamos cargar". Esto le dice al NavigationGuard
      // que ya puede tomar decisiones con confianza.
      setBusinessProfileLoaded(true);
    }
  };

  const register = async (params: { email: string; password: string; name: string }) => {
    try {
      setAuthLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email: params.email,
        password: params.password,
        options: {
          data: { name: params.name },
        },
      });
      if (error) throw error;
      if (!data.user) throw new Error('No user returned');

      // ⚡ Registro exitoso → dispositivo "ya conoce la app".
      // Aunque onAuthStateChange también lo va a setear, lo hacemos aquí
      // explícitamente como defensa en profundidad (algunos flujos de
      // registro requieren confirmación de email y no disparan SIGNED_IN
      // inmediatamente — pero el usuario YA vio la app).
      markOnboardingSeen();

      return data;
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
      // Resetear flag para que el guard espere el fetch del nuevo usuario.
      setBusinessProfileLoaded(false);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // ⚡ Login exitoso → dispositivo "ya conoce la app".
      // onAuthStateChange también lo va a setear cuando dispare SIGNED_IN,
      // pero lo hacemos aquí también para evitar cualquier carrera entre
      // el unmount/remount del guard y el callback async.
      markOnboardingSeen();
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
      setCacheUserId(null);
      loadedUserIdRef.current = null;
      setIsStaffAccount(false);
      setStaffMemberData(null);
      setBusinessProfileLoaded(false);
      await supabase.auth.signOut();
      // NOTA: NO borramos 'has_seen_onboarding' aquí intencionalmente.
      // El dispositivo ya conoce la app, no debemos mostrarle el onboarding
      // marketing al re-loguear. Solo se "olvida" si el usuario desinstala.
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
      user, businessProfile, businessProfileLoaded, loading, authLoading,
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
