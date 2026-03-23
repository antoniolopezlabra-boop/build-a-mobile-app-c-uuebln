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
import React from 'react';

// Puente: una vez dentro de AuthProvider, sincroniza el userId con ThemeContext
// Esto resuelve el crash "useAuth must be used within AuthProvider"
// que ocurría cuando ThemeProvider intentaba llamar useAuth directamente
function ThemeUserSync() {
  const { user } = useAuth();
  const { loadThemeForUser } = useTheme();

  useEffect(() => {
    loadThemeForUser(user?.id ?? null);
  }, [user?.id]);

  return null;
}

function NavigationGuard() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const router = useRouter();
  const segments = useSegments();

  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);
  const [isFirstLogin, setIsFirstLogin] = useState<boolean | null>(null);

  const hasRedirectedToOnboarding = useRef(false);
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
    if (authLoading || adminLoading) return;
    if (hasSeenOnboarding === null) return;
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

    if (!user && !inAuthScreen) {
      navigate(hasSeenOnboarding ? '/auth/login' : '/auth/onboarding');
      return;
    }

    if (user && isFirstLogin === true && !inOnboarding && !hasRedirectedToOnboarding.current) {
      hasRedirectedToOnboarding.current = true;
      navigate('/auth/onboarding');
      return;
    }

    if (user && isAdmin && isFirstLogin === false && !inAdminScreen) {
      navigate('/admin');
      return;
    }
  }, [user, isAdmin, authLoading, adminLoading, hasSeenOnboarding, isFirstLogin, segments]);

  return null;
}

function AppStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} merchantIdentifier="merchant.com.vylta">
        <AuthProvider>
          <PlanProvider>
            <AdminProvider>
              {/* ThemeUserSync debe estar dentro de AuthProvider para acceder a useAuth */}
              <ThemeUserSync />
              <NavigationGuard />
              <Stack screenOptions={{ headerShown: false }} />
              <AppStatusBar />
            </AdminProvider>
          </PlanProvider>
        </AuthProvider>
      </StripeProvider>
    </ThemeProvider>
  );
}
