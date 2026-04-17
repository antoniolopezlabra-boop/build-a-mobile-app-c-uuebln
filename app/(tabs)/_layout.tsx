
import React from 'react';
import { Href, Tabs } from 'expo-router';
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

  // PERFORMANCE FIX (Abr 2026): cambio de Stack a Tabs
  // Motivo: Stack montaba/desmontaba cada pantalla en cada cambio de tab,
  // causando re-render completo de Reportes (826 líneas) y lag visible.
  // Con Tabs las pantallas se montan 1 vez y quedan en memoria, solo se
  // (ocultan/muestran). useFocusEffect sigue disparándose para revalidar datos.
  //
  // Conservamos el FloatingTabBar custom ocultando el tabBar nativo con display:'none'.
  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' }, // Ocultar tab bar nativo — usamos FloatingTabBar
          // Keep screens mounted when switching tabs (la razón principal del cambio)
          lazy: false,
          animation: 'none', // Sin animación nativa — el feel es instantáneo
        }}
      >
        <Tabs.Screen name="(home)" />
        <Tabs.Screen name="appointments" />
        <Tabs.Screen name="clients" />
        <Tabs.Screen name="reports" />
        <Tabs.Screen name="settings" />
        <Tabs.Screen name="profile" options={{ href: null }} />
      </Tabs>
      <FloatingTabBar tabs={tabs} />
    </>
  );
}
