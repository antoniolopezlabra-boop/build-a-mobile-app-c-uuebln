import { Stack, useRouter, useSegments } from 'expo-router';
import { LogBox } from 'react-native';
import { useEffect } from 'react';

LogBox.ignoreAllLogs();
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { PlanProvider } from '@/contexts/PlanContext';
import { AdminProvider } from '@/contexts/AdminContext';
import React from 'react';

function NavigationGuard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const inAuthScreen = segments[0] === 'auth';
    const inAdminScreen = segments[0] === 'admin';
    if (!user && !inAuthScreen) {
      router.replace('/auth/login');
    }
  }, [user, loading, segments]);

  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <PlanProvider>
      <AdminProvider>
        <NavigationGuard />
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="dark" />
      </AdminProvider>
      </PlanProvider>
    </AuthProvider>
  );
}
