import { Stack, useRouter, useSegments } from 'expo-router';
import { StripeProvider } from '@stripe/stripe-react-native';
import { STRIPE_PUBLISHABLE_KEY } from '@/services/stripe';
import { LogBox } from 'react-native';
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
  const [isFirstLogin, setIsFirstLogin] = useState<boolean | null>(null);

  // Bandera de un solo disparo — evita que el guard redirija más de una vez al onboarding
  const hasRedirectedToOnboarding = useRef(false);
  // Bandera para evitar redirects mientras ya se está navegando
  const isNavigating = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem('has_seen_onboarding').then(val => {
      setHasSeenOnboarding(val === 'true');
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setIsFirstLogin(null);
      hasRedirectedToOnboarding.current = false;
      return;
    }
    const key = `first_login_${user.id}`;
    AsyncStorage.getItem(key).then(async val => {
      if (val === null) {
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
    if (isNavigating.current) return;

    const inAuthScreen  = segments[0] === 'auth';
    const inAdminScreen = segments[0] === 'admin';
    const inOnboarding  = segments[1] === 'onboarding';

    // Sin sesión
    if (!user && !inAuthScreen) {
      isNavigating.current = true;
      if (hasSeenOnboarding) {
        router.replace('/auth/login');
      } else {
        router.replace('/auth/onboarding');
      }
      setTimeout(() => { isNavigating.current = false; }, 500);
      return;
    }

    // Primera sesión del usuario → onboarding (solo una vez)
    if (
      user &&
      isFirstLogin === true &&
      !inOnboarding &&
      !hasRedirectedToOnboarding.current
    ) {
      hasRedirectedToOnboarding.current = true;
      isNavigating.current = true;
      router.replace('/auth/onboarding');
      setTimeout(() => { isNavigating.current = false; }, 500);
      return;
    }

    // Admin autenticado → panel admin (solo si ya terminó el onboarding)
    if (
      user &&
      isAdmin &&
      !inAdminScreen &&
      isFirstLogin === false
    ) {
      isNavigating.current = true;
      router.replace('/admin');
      setTimeout(() => { isNavigating.current = false; }, 500);
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
