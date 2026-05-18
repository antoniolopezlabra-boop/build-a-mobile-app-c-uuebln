import { Stack, useRouter, useSegments } from 'expo-router';
import { StripeProvider } from '@stripe/stripe-react-native';
import { STRIPE_PUBLISHABLE_KEY } from '@/services/stripe';
import { LogBox, View, ActivityIndicator, Image, StyleSheet, Text } from 'react-native';
import { useEffect, useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '@/utils/logger';

LogBox.ignoreAllLogs();
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { PlanProvider } from '@/contexts/PlanContext';
import { AdminProvider, useAdmin } from '@/contexts/AdminContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { NetworkProvider } from '@/contexts/NetworkContext';
import { AppStateProvider } from '@/contexts/AppStateContext';
import { OfflineBanner } from '@/components/OfflineBanner';
import React from 'react';

// Puente: una vez dentro de AuthProvider, sincroniza el userId con ThemeContext
function ThemeUserSync() {
  const { user } = useAuth();
  const { loadThemeForUser } = useTheme();

  useEffect(() => {
    loadThemeForUser(user?.id ?? null);
  }, [user?.id]);

  return null;
}

// ───────────────────────────────────────────────────────────────────────────────
// AppSplash — Pantalla que se muestra ENCIMA de todo mientras los guards
// terminan de decidir a dónde mandar al usuario. Soluciona el "flash" de
// onboarding/setup wizard que se veía por ~500ms-3seg al reabrir la app.
// ───────────────────────────────────────────────────────────────────────────────
function AppSplash() {
  return (
    <View style={splashStyles.container} pointerEvents="auto">
      <View style={splashStyles.logoWrap}>
        <Image
          source={require('@/assets/images/app-icon-hkt.png')}
          style={splashStyles.logo}
          resizeMode="contain"
        />
      </View>
      <Text style={splashStyles.brand}>VYLTA</Text>
      <ActivityIndicator
        size="small"
        color="#10B981"
        style={{ marginTop: 24 }}
      />
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════
// FIX DEFINITIVO PARPADEO DE SETUP WIZARD (May 2026, commit 1f9ef184)
// La fuente de verdad para "setup completado" es Supabase (business_profile).
// El splash cubre la UI hasta que el fetch termina (businessProfileLoaded === true).
//
// FIX ADMIN LOOP (May 17 2026, commit 343ca222)
// Los admins del sistema están EXENTOS del setup wizard.
// El check de isAdmin va ANTES del check de setupCompleted.
//
// FIX ONBOARDING LOOP — segundo round (May 17 2026, commit b852844d)
// El useEffect que LEÍA el flag has_seen_onboarding solo corría una vez al
// montar el componente (deps vacías). Tras el logout, el state seguía con
// el valor obsoleto cargado al arranque. Solución: re-leer AsyncStorage
// cuando el `user` cambia.
//
// FIX SEC-003 (May 17 2026, este commit)
// Los console.log de debugging se reemplazaron por logger.log, que solo
// imprime en modo desarrollo (if (__DEV__)). En producción, estos logs
// quedan silenciados y NO filtran información del flujo de autenticación.
// ══════════════════════════════════════════════════════════════════════
function NavigationGuard({ onReady }: { onReady: () => void }) {
  const { user, businessProfile, businessProfileLoaded, loading: authLoading, isStaffAccount } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const router = useRouter();
  const segments = useSegments();

  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);
  // Flag de "saltar wizard" — solo para casos donde el user explicitamente lo skipea
  // (NUNCA usado para decidir si redirigir; eso depende de businessProfile).
  const [setupSkipped, setSetupSkipped] = useState<boolean | null>(null);

  const isNavigating = useRef(false);
  const readyEmittedRef = useRef(false);

  // ⚡ FIX (May 17 2026): re-leer el flag CADA VEZ que cambia el estado de user.
  // Antes solo se leía al montar (deps vacías) y nunca se actualizaba después.
  // Eso causaba que tras logout el guard usara un valor obsoleto del state.
  useEffect(() => {
    AsyncStorage.getItem('has_seen_onboarding').then(val => {
      const seen = val === 'true';
      logger.log('[Guard] has_seen_onboarding leído de AsyncStorage:', val, '→', seen, '(user:', user?.email ?? 'null', ')');
      setHasSeenOnboarding(seen);
    });
  }, [user?.id]);

  // Carga del flag de "el usuario decidió saltar el wizard" (caso edge)
  useEffect(() => {
    if (!user) {
      setSetupSkipped(null);
      return;
    }
    AsyncStorage.getItem(`setup_skipped_${user.id}`).then(val => {
      setSetupSkipped(val === 'true');
    });
  }, [user?.id]);

  useEffect(() => {
    if (authLoading || adminLoading) return;
    if (hasSeenOnboarding === null) return;
    if (isNavigating.current) return;

    // ⚡ GUARD CRÍTICO: si hay un usuario logueado pero aún NO sabemos si tiene
    // business_profile (fetch en curso), NO TOMAMOS NINGUNA DECISIÓN todavía.
    // El splash seguirá cubriendo la UI hasta que sepamos con certeza.
    if (user && !businessProfileLoaded) return;
    if (user && setupSkipped === null) return;

    const inAuthScreen  = segments[0] === 'auth';
    const inAdminScreen = segments[0] === 'admin';
    const inStaffApp    = segments[0] === 'staff-app';
    const inSetupWizard = segments[0] === 'setup';

    const navigate = (path: string) => {
      logger.log('[Guard] → navegando a', path, '(user:', user?.email ?? 'null', ', hasSeenOnboarding:', hasSeenOnboarding, ', isAdmin:', isAdmin, ')');
      isNavigating.current = true;
      router.replace(path as any);
      setTimeout(() => { isNavigating.current = false; }, 600);
    };

    const emitReady = () => {
      if (!readyEmittedRef.current) {
        readyEmittedRef.current = true;
        setTimeout(() => onReady(), 80);
      }
    };

    // ────────────────────────────────────────────────────────────────────
    // ORDEN DE PRIORIDADES (importante: el orden ES la lógica)
    // ────────────────────────────────────────────────────────────────────

    // 1) NO AUTENTICADO → onboarding marketing o login
    if (!user && !inAuthScreen) {
      navigate(hasSeenOnboarding ? '/auth/login' : '/auth/onboarding');
      emitReady();
      return;
    }

    // 2) COLABORADORES (staff_accounts) → su app, nunca a setup ni admin
    if (user && isStaffAccount) {
      if (!inStaffApp) navigate('/staff-app');
      emitReady();
      return;
    }

    // 3) ⚡ ADMINISTRADORES DEL SISTEMA (vylta_admins) → área admin SIEMPRE.
    if (user && isAdmin) {
      if (!inAdminScreen) navigate('/admin');
      emitReady();
      return;
    }

    // 4) USUARIOS REGULARES sin setup completo → wizard.
    const setupCompleted = businessProfile !== null || setupSkipped === true;
    if (user && !setupCompleted && !inSetupWizard) {
      navigate('/setup');
      emitReady();
      return;
    }

    // 5) USUARIO REGULAR con setup OK: no necesita redirección.
    emitReady();
  }, [
    user,
    isAdmin,
    authLoading,
    adminLoading,
    hasSeenOnboarding,
    businessProfile,
    businessProfileLoaded,
    setupSkipped,
    isStaffAccount,
    segments,
  ]);

  return null;
}

function AppStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

// AppShell: envuelve el Stack y maneja el splash inicial.
function AppShell() {
  const [appReady, setAppReady] = useState(false);

  return (
    <>
      <ThemeUserSync />
      <NavigationGuard onReady={() => setAppReady(true)} />
      <Stack screenOptions={{ headerShown: false }} />
      <OfflineBanner />
      <AppStatusBar />
      {!appReady && <AppSplash />}
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <NetworkProvider>
        <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} merchantIdentifier="merchant.com.vylta">
          <AuthProvider>
            <AppStateProvider>
              <PlanProvider>
                <AdminProvider>
                  <AppShell />
                </AdminProvider>
              </PlanProvider>
            </AppStateProvider>
          </AuthProvider>
        </StripeProvider>
      </NetworkProvider>
    </ThemeProvider>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  logoWrap: {
    width: 120,
    height: 120,
    borderRadius: 28,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  logo: {
    width: 96,
    height: 96,
  },
  brand: {
    marginTop: 20,
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 2,
  },
});
