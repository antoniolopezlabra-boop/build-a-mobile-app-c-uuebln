import { Stack, useRouter, useSegments } from 'expo-router';
import { StripeProvider } from '@stripe/stripe-react-native';
import { STRIPE_PUBLISHABLE_KEY } from '@/services/stripe';
import { LogBox } from 'react-native';
import { useEffect } from 'react';

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

  useEffect(() => {
    // Esperar a que tanto auth como admin terminen de cargar
    if (authLoading || adminLoading) return;

    const inAuthScreen = segments[0] === 'auth';
    const inAdminScreen = segments[0] === 'admin';

    if (!user && !inAuthScreen) {
      router.replace('/auth/login');
      return;
    }

    // Si el usuario es admin y no está en el panel admin, redirigir
    if (user && isAdmin && !inAdminScreen) {
      console.log('[NavigationGuard] Admin detected, redirecting to admin panel');
      router.replace('/admin');
      return;
    }
  }, [user, isAdmin, authLoading, adminLoading, segments]);

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
