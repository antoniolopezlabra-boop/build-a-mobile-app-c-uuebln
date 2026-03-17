import { Stack, useRouter, useSegments } from 'expo-router';
import { StripeProvider } from '@stripe/stripe-react-native';
import { STRIPE_PUBLISHABLE_KEY } from '@/services/stripe';
import { LogBox } from 'react-native';
import { useEffect, useState } from 'react';
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
  // Bandera para saber si es la primera sesión del usuario en este dispositivo
  const [isFirstLogin, setIsFirstLogin] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('has_seen_onboarding').then(val => {
      setHasSeenOnboarding(val === 'true');
    });
  }, []);

  // Cuando el usuario se autentica, verificar si es su primera vez
  useEffect(() => {
    if (!user) {
      setIsFirstLogin(null);
      return;
    }
    const key = `first_login_${user.id}`;
    AsyncStorage.getItem(key).then(async val => {
      if (val === null) {
        // Primera vez que este user_id inicia sesión en este dispositivo
        await AsyncStorage.setItem(key, 'done');
        await AsyncStorage.setItem('has_seen_onboarding', 'true');
        setIsFirstLogin(true);
      } else {
        setIsFirstLogin(false);
      }
    });
  }, [user?.id]);

  useEffect(() => {
    if (authLoading || adminLoading || hasSeenOnboarding === null) return;

    const inAuthScreen    = segments[0] === 'auth';
    const inAdminScreen   = segments[0] === 'admin';
    const inOnboarding    = segments[0] === 'auth' && segments[1] === 'onboarding';

    // Sin sesión activa
    if (!user && !inAuthScreen) {
      if (hasSeenOnboarding) {
        router.replace('/auth/login');
      } else {
        // Dispositivo nunca vio el onboarding (primer install, nunca logueado)
        router.replace('/auth/onboarding');
      }
      return;
    }

    // Usuario autenticado — verificar si es primera vez
    if (user && isFirstLogin === true && !inOnboarding) {
      // Primera sesión en este dispositivo → mostrar onboarding
      router.replace('/auth/onboarding');
      return;
    }

    // Admin autenticado → panel admin
    if (user && isAdmin && !inAdminScreen && isFirstLogin === false) {
      router.replace('/admin');
      return;
    }
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
