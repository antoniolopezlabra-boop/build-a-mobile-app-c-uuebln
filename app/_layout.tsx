import { Stack, useRouter, useSegments } from 'expo-router';
import { StripeProvider } from '@stripe/stripe-react-native';
import { STRIPE_PUBLISHABLE_KEY } from '@/services/stripe';
import { LogBox, View, ActivityIndicator, Image, StyleSheet, Text } from 'react-native';
import { useEffect, useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
// FIX DEFINITIVO PARPADEO DE SETUP WIZARD (May 2026)
//
// PROBLEMA HISTÓRICO:
// Cada vez que un usuario REINSTALABA la app (o recibaía APK nuevo), al hacer
// login se le mostraba el setup wizard por 2-3 segundos antes de mandarlo al
// home. Esto pasaba porque la lógica de "¿ya completó el setup?" se basaba en
// un flag en AsyncStorage local (`setup_completed_<userId>`). Al reinstalar,
// AsyncStorage queda vacío → el flag no existe → el guard creía que era
// usuario nuevo → "flash" del wizard.
//
// FIX:
// La fuente de verdad ahora es **Supabase**, NO AsyncStorage.
// Si el usuario ya tiene un business_profile en la nube, completaron el setup.
// Punto. Sobrevive a reinstalaciones, cambios de dispositivo, todo.
//
// Además: NO redirigimos a NINGUNA pantalla hasta que el fetch del
// business_profile haya terminado (businessProfileLoaded === true).
// Mientras tanto, el splash sigue cubriendo la UI → cero parpadeo.
//
// Mantenemos AsyncStorage como SECUNDARIO solo para compatibilidad y para
// recordar el "saltar wizard" (caso edge raro donde el user no quiere llenar).
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

  // Carga del flag global de "ya vio onboarding marketing"
  useEffect(() => {
    AsyncStorage.getItem('has_seen_onboarding').then(val => {
      setHasSeenOnboarding(val === 'true');
    });
  }, []);

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
      isNavigating.current = true;
      router.replace(path as any);
      setTimeout(() => { isNavigating.current = false; }, 600);
    };

    const emitReady = () => {
      if (!readyEmittedRef.current) {
        readyEmittedRef.current = true;
        // Pequeño delay para que el replace tenga tiempo de completar antes de
        // quitar el splash, evitando ver la pantalla anterior por un frame.
        setTimeout(() => onReady(), 80);
      }
    };

    // No autenticado → onboarding marketing o login
    if (!user && !inAuthScreen) {
      navigate(hasSeenOnboarding ? '/auth/login' : '/auth/onboarding');
      emitReady();
      return;
    }

    // Colaboradores: redirigir a su app, nunca a setup ni admin
    if (user && isStaffAccount) {
      if (!inStaffApp) navigate('/staff-app');
      emitReady();
      return;
    }

    // ⚡ SETUP WIZARD — NUEVA LÓGICA basada en Supabase
    // setupCompleted = (tiene business_profile en BD) OR (el user lo saltó explícitamente)
    // Solo redirigir si NO completado Y NO está ya en el wizard.
    const setupCompleted = businessProfile !== null || setupSkipped === true;
    if (user && !setupCompleted && !inSetupWizard) {
      navigate('/setup');
      emitReady();
      return;
    }

    // Admin: solo redirigir si ya completó (o saltó) el setup
    if (user && isAdmin && setupCompleted && !inAdminScreen) {
      navigate('/admin');
      emitReady();
      return;
    }

    // Llegamos aquí: usuario autenticado, no necesita redirección.
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

// ───────────────────────────────────────────────────────────────────────────────
// AppShell: envuelve el Stack y maneja el splash inicial.
// El splash se monta SIEMPRE al arrancar y solo desaparece cuando
// NavigationGuard emite onReady (es decir, ya decidió a dónde mandar al user).
// ───────────────────────────────────────────────────────────────────────────────
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
