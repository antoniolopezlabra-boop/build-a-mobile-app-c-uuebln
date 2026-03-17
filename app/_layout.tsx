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
import React from 'react';

function NavigationGuard() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const router = useRouter();
  const segments = useSegments();

  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);
  // null = aún leyendo AsyncStorage, true = primera vez, false = ya visto antes
  const [isFirstLogin, setIsFirstLogin] = useState<boolean | null>(null);

  const hasRedirectedToOnboarding = useRef(false);
  const isNavigating = useRef(false);

  // Leer si ya vio el onboarding (se ejecuta UNA sola vez al montar)
  useEffect(() => {
    AsyncStorage.getItem('has_seen_onboarding').then(val => {
      setHasSeenOnboarding(val === 'true');
    });
  }, []);

  // Cuando cambia el usuario, verificar si es su primera sesión
  useEffect(() => {
    if (!user) {
      // Usuario cerró sesión — resetear todo
      setIsFirstLogin(null);
      hasRedirectedToOnboarding.current = false;
      return;
    }
    const key = `first_login_${user.id}`;
    AsyncStorage.getItem(key).then(async val => {
      if (val === null) {
        // Primera vez que este user_id entra en este dispositivo
        await AsyncStorage.setItem(key, 'done');
        await AsyncStorage.setItem('has_seen_onboarding', 'true');
        setIsFirstLogin(true);
      } else {
        setIsFirstLogin(false);
      }
    });
  }, [user?.id]);

  useEffect(() => {
    // ── CONDICIÓN CRÍTICA: no navegar hasta tener TODOS los estados resueltos ──
    // Si cualquiera sigue en null/loading, esperar — evita el flash visual
    if (authLoading || adminLoading) return;
    if (hasSeenOnboarding === null) return;
    // Si hay usuario pero isFirstLogin aún no se resolvió, ESPERAR
    // Este es el fix del flash — antes navegaba antes de tener este dato
    if (user && isFirstLogin === null) return;
    if (isNavigating.current) return;

    const inAuthScreen  = segments[0] === 'auth';
    const inAdminScreen = segments[0] === 'admin';
    const inOnboarding  = segments[1] === 'onboarding';

    const navigate = (path: string) => {
      isNavigating.current = true;
      router.replace(path as any);
      setTimeout(() => { isNavigating.current = false; }, 600);
    };

    // Sin sesión → login o onboarding según si ya lo vio
    if (!user && !inAuthScreen) {
      navigate(hasSeenOnboarding ? '/auth/login' : '/auth/onboarding');
      return;
    }

    // Usuario nuevo (primera sesión) → onboarding (solo una vez)
    if (user && isFirstLogin === true && !inOnboarding && !hasRedirectedToOnboarding.current) {
      hasRedirectedToOnboarding.current = true;
      navigate('/auth/onboarding');
      return;
    }

    // Admin autenticado → panel admin
    if (user && isAdmin && isFirstLogin === false && !inAdminScreen) {
      navigate('/admin');
      return;
    }

    // Usuario normal autenticado con sesión previa → no hacer nada
    // Expo Router lo lleva a la última ruta o al index automáticamente
  }, [user, isAdmin, authLoading, adminLoading, hasSeenOnboarding, isFirstLogin, segments]);

  return null;
}

export default function RootLayout() {
  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} merchantIdentifier="merchant.com.vylta">
      <AuthProvider>
        <PlanProvider>
          <AdminProvider>
            <NavigationGuard />
            <Stack screenOptions={{ headerShown: false }} />
            <StatusBar style="dark" />
          </AdminProvider>
        </PlanProvider>
      </AuthProvider>
    </StripeProvider>
  );
}
