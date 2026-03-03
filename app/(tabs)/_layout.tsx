
import React from 'react';
import { Href, Stack } from 'expo-router';
import FloatingTabBar from '@/components/FloatingTabBar';
import { colors } from '@/styles/commonStyles';

export default function TabLayout() {
  const tabs = [
    {
      name: 'home',
      route: '/(tabs)/(home)' as Href,
      icon: 'home' as const,
      label: 'Inicio',
    },
    {
      name: 'appointments',
      route: '/(tabs)/appointments' as Href,
      icon: 'calendar-today' as const,
      label: 'Citas',
    },
    {
      name: 'clients',
      route: '/(tabs)/clients' as Href,
      icon: 'group' as const,
      label: 'Clientes',
    },
    {
      name: 'reports',
      route: '/(tabs)/reports' as Href,
      icon: 'assessment' as const,
      label: 'Reportes',
    },
    {
      name: 'settings',
      route: '/(tabs)/settings' as Href,
      icon: 'settings' as const,
      label: 'Ajustes',
    },
  ];

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(home)" options={{ headerShown: false }} />
        <Stack.Screen name="appointments" options={{ headerShown: false }} />
        <Stack.Screen name="clients" options={{ headerShown: false }} />
        <Stack.Screen name="reports" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
      </Stack>
      <FloatingTabBar tabs={tabs} />
    </>
  );
}
