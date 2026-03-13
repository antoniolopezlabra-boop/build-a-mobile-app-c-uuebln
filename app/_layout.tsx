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

  // Leer si el usuario ya vio el onboarding (una sola vez al montar)
  useEffect(() => {
    AsyncStorage.getItem('has_seen_onboarding').then(val => {
      setHasSeenOnboarding(val === 'true');
    });
  }, []);

  useEffect(() => {
    // Esperar a que todo cargue
    if (authLoading || adminLoading || hasSeenOnboarding === null) return;

    const inAuthScreen = segments[0] === 'auth';
    const inAdminScreen = segments[0] === 'admin';

    // Sin sesión activa
    if (!user && !inAuthScreen) {
      if (hasSeenOnboarding) {
        // Usuario recurrente (cerró sesión) → login directo
        router.replace('/auth/login');
      } else {
        // Usuario nuevo → onboarding
        router.replace('/auth/onboarding');
      }
      return;
    }

    // Admin autenticado → panel admin
    if (user && isAdmin && !inAdminScreen) {
      router.replace('/admin');
      return;
    }
  }, [user, isAdmin, authLoading, adminLoading, hasSeenOnboarding, segments]);

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
