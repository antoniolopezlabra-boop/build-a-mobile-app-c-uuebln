import { Stack, useRouter, useSegments } from 'expo-router';
import { StripeProvider } from '@stripe/stripe-react-native';
import { STRIPE_PUBLISHABLE_KEY } from '@/services/stripe';
import { LogBox, View, ActivityIndicator } from 'react-native';
import { useEffect, useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

LogBox.ignoreAllLogs();
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { PlanProvider } from '@/contexts/PlanContext';
import { AdminProvider, useAdmin } from '@/contexts/AdminContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { NetworkProvider } from '@/contexts/NetworkContext';
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

function NavigationGuard() {
  const { user, loading: authLoading, isStaffAccount } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const router = useRouter();
  const segments = useSegments();

  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);
  // ── Setup wizard post-registro ──
  // null = aún no sabemos si lo completó; true = ya lo hizo; false = primera vez
  const [setupCompleted, setSetupCompleted] = useState<boolean | null>(null);

  const hasRedirectedToSetup = useRef(false);
  const isNavigating = useRef(false);

  // Carga del flag global de "ya vio onboarding marketing"
  useEffect(() => {
    AsyncStorage.getItem('has_seen_onboarding').then(val => {
      setHasSeenOnboarding(val === 'true');
    });
  }, []);

  // Carga del flag específico por usuario: setup_completed_<userId>
  // Se ejecuta cuando cambia el user.id (al hacer login o registrarse)
  useEffect(() => {
    if (!user) {
      setSetupCompleted(null);
      hasRedirectedToSetup.current = false;
      return;
    }
    AsyncStorage.getItem(`setup_completed_${user.id}`).then(val => {
      setSetupCompleted(val === 'true');
    });
  }, [user?.id]);

  useEffect(() => {
    if (authLoading || adminLoading) return;
    if (hasSeenOnboarding === null) return;
    if (user && setupCompleted === null) return;
    if (isNavigating.current) return;

    const inAuthScreen  = segments[0] === 'auth';
    const inAdminScreen = segments[0] === 'admin';
    const inStaffApp    = segments[0] === 'staff-app';
    const inSetupWizard = segments[0] === 'setup';

    const navigate = (path: string) => {
      isNavigating.current = true;
      router.replace(path as any);
      setTimeout(() => { isNavigating.current = false; }, 600);
    };

    // No autenticado → onboarding marketing o login
    if (!user && !inAuthScreen) {
      navigate(hasSeenOnboarding ? '/auth/login' : '/auth/onboarding');
      return;
    }

    // Colaboradores: redirigir a su app, nunca a setup ni admin
    if (user && isStaffAccount) {
      if (!inStaffApp) navigate('/staff-app');
      return;
    }

    // ── Setup wizard: solo la primera vez que el usuario entra ──
    // Si setupCompleted === false (no existe el flag en AsyncStorage), redirigir.
    // El propio wizard guarda el flag al terminar o al saltar, así nunca vuelve.
    if (user && setupCompleted === false && !inSetupWizard && !hasRedirectedToSetup.current) {
      hasRedirectedToSetup.current = true;
      navigate('/setup');
      return;
    }

    // Admin: solo redirigir si ya completó (o saltó) el setup
    if (user && isAdmin && setupCompleted === true && !inAdminScreen) {
      navigate('/admin');
      return;
    }
  }, [user, isAdmin, authLoading, adminLoading, hasSeenOnboarding, setupCompleted, segments]);

  return null;
}

function AppStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <NetworkProvider>
        <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} merchantIdentifier="merchant.com.vylta">
          <AuthProvider>
            <PlanProvider>
              <AdminProvider>
                <ThemeUserSync />
                <NavigationGuard />
                <Stack screenOptions={{ headerShown: false }} />
                <OfflineBanner />
                <AppStatusBar />
              </AdminProvider>
            </PlanProvider>
          </AuthProvider>
        </StripeProvider>
      </NetworkProvider>
    </ThemeProvider>
  );
}
