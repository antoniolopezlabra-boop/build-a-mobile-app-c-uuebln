
import React, { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';
import { Href, Tabs, useRouter, usePathname } from 'expo-router';
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

  // ⚡ FIX UX (May 19 2026): botón atrás de Android lleva a Inicio
  // desde cualquier tab que NO sea Inicio.
  //
  // PROBLEMA REPORTADO:
  //   El comportamiento era inconsistente — desde Citas y Clientes el
  //   back button sacaba al usuario de la app, pero desde Reportes y
  //   Ajustes lo llevaba a Inicio. Mala UX y comportamiento impredecible.
  //
  // SOLUCIÓN:
  //   Listener global en el layout de tabs que intercepta el back button
  //   de Android. Detecta la pantalla actual via pathname:
  //     • Si estás en Inicio → comportamiento default (sale de la app)
  //     • Si estás en cualquier otra tab → ir a Inicio
  //
  // POR QUÉ EN EL LAYOUT (no en cada pantalla):
  //   Centralizar el listener evita duplicación en 4 archivos diferentes
  //   y garantiza comportamiento uniforme. Si en el futuro agregamos
  //   una tab nueva, hereda el fix automáticamente.
  //
  // CLEANUP:
  //   El listener se remueve al desmontar el layout (logout, etc).
  //   Mientras el TabLayout esté montado, el listener está activo.
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const isOnHome =
      pathname === '/' ||
      pathname === '/index' ||
      pathname.includes('(home)') ||
      // Fallback: si ninguna otra tab está activa, asumimos que es Home
      (!pathname.includes('appointments') &&
       !pathname.includes('clients') &&
       !pathname.includes('reports') &&
       !pathname.includes('settings') &&
       !pathname.includes('profile'));

    const onBackPress = (): boolean => {
      // Si está en Inicio → false: dejamos que Android ejecute su acción default (salir).
      // Si está en otra tab → true: manejamos el evento navegando a Inicio.
      if (isOnHome) return false;

      router.replace('/(tabs)/(home)' as any);
      return true;
    };

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress
    );

    return () => {
      subscription.remove();
    };
  }, [pathname, router]);

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
