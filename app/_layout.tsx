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

// ─────────────────────────────────────────────────────────────────────────────
// AppSplash — Pantalla que se muestra ENCIMA de todo mientras los guards
// terminan de decidir a dónde mandar al usuario. Soluciona el "flash" de
// onboarding/login que se veía por ~500ms al reabrir la app con sesión activa.
// Se ocultaba al render normal de expo-router antes de que NavigationGuard
// pudiera redirigir; ahora el splash bloquea visualmente hasta que el guard
// emite su "ready".
// ─────────────────────────────────────────────────────────────────────────────
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

function NavigationGuard({ onReady }: { onReady: () => void }) {
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
  const readyEmittedRef = useRef(false);

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
      // Emitimos ready en el siguiente tick para dar tiempo al replace.
      // Esto evita ver el destino antes de que la navegación se complete.
      setTimeout(() => {
        if (!readyEmittedRef.current) {
          readyEmittedRef.current = true;
          onReady();
        }
      }, 50);
      return;
    }

    // Colaboradores: redirigir a su app, nunca a setup ni admin
    if (user && isStaffAccount) {
      if (!inStaffApp) {
        navigate('/staff-app');
        setTimeout(() => {
          if (!readyEmittedRef.current) {
            readyEmittedRef.current = true;
            onReady();
          }
        }, 50);
      } else {
        if (!readyEmittedRef.current) {
          readyEmittedRef.current = true;
          onReady();
        }
      }
      return;
    }

    // ── Setup wizard: solo la primera vez que el usuario entra ──
    // Si setupCompleted === false (no existe el flag en AsyncStorage), redirigir.
    // El propio wizard guarda el flag al terminar o al saltar, así nunca vuelve.
    if (user && setupCompleted === false && !inSetupWizard && !hasRedirectedToSetup.current) {
      hasRedirectedToSetup.current = true;
      navigate('/setup');
      setTimeout(() => {
        if (!readyEmittedRef.current) {
          readyEmittedRef.current = true;
          onReady();
        }
      }, 50);
      return;
    }

    // Admin: solo redirigir si ya completó (o saltó) el setup
    if (user && isAdmin && setupCompleted === true && !inAdminScreen) {
      navigate('/admin');
      setTimeout(() => {
        if (!readyEmittedRef.current) {
          readyEmittedRef.current = true;
          onReady();
        }
      }, 50);
      return;
    }

    // ── Llegamos aquí: usuario autenticado, no necesita ninguna redirección.
    //    Ya está en la pantalla correcta (ej. tabs/home). Listo para mostrar.
    if (!readyEmittedRef.current) {
      readyEmittedRef.current = true;
      onReady();
    }
  }, [user, isAdmin, authLoading, adminLoading, hasSeenOnboarding, setupCompleted, segments]);

  return null;
}

function AppStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// AppShell: envuelve el Stack y maneja el splash inicial.
// El splash se monta SIEMPRE al arrancar y solo desaparece cuando
// NavigationGuard emite onReady (es decir, ya decidió a dónde mandar al user).
// ─────────────────────────────────────────────────────────────────────────────
function AppShell() {
  const [appReady, setAppReady] = useState(false);

  return (
    <>
      <ThemeUserSync />
      <NavigationGuard onReady={() => setAppReady(true)} />
      <Stack screenOptions={{ headerShown: false }} />
      <OfflineBanner />
      <AppStatusBar />
      {/* Splash overlay: bloquea cualquier pantalla intermedia hasta que el
          NavigationGuard haya decidido a dónde ir. Se desmonta una vez listo. */}
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
    elevation: 9999, // Android elevation para asegurar que quede arriba
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
