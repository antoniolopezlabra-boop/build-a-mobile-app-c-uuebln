
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
  // PROBLEMA REPORTADO ORIGINAL:
  //   El comportamiento era inconsistente — desde Citas y Clientes el
  //   back button sacaba al usuario de la app, pero desde Reportes y
  //   Ajustes lo llevaba a Inicio. Mala UX y comportamiento impredecible.
  //
  // ⚡⚡⚡ FIX CRÍTICO (May 22 2026) — PANTALLA NEGRA AL REGRESAR ⚡⚡⚡
  //
  // BUG REPORTADO:
  //   Al estar en cualquier pantalla pushada (Nueva Cita, Detalle de Cita,
  //   Nuevo Cliente, Clientes Inactivos, etc) y presionar el botón físico
  //   de regresar de Android → pantalla negra total, app inservible hasta
  //   force stop. Con el botón digital de la app (← en header) funcionaba
  //   correctamente.
  //
  // CAUSA RAÍZ:
  //   La lógica de `isOnHome` solo distinguía entre "estás en home" vs
  //   "estás en otra tab". NO consideraba el caso "estás en una pantalla
  //   pushada encima del stack" (ej: /appointments/new).
  //
  //   En esa situación:
  //     1. Usuario en /appointments/new presiona back físico
  //     2. pathname.includes('appointments') === true → isOnHome = false
  //     3. Handler ejecuta router.replace('/(tabs)/(home)') retornando true
  //     4. Stack ya no tiene contexto válido para la pantalla pushada → 💀
  //     5. Resultado: pantalla negra, app muerta
  //
  // SOLUCIÓN:
  //   El handler SOLO debe interceptar cuando el usuario está EN una
  //   pestaña real, NO cuando está en una pantalla pushada encima.
  //
  //   Las pestañas reales tienen pathnames específicos sin slash adicional:
  //     ✅ '/'              = Inicio (raíz)
  //     ✅ '/appointments'  = tab Citas
  //     ✅ '/clients'       = tab Clientes
  //     ✅ '/reports'       = tab Reportes
  //     ✅ '/settings'      = tab Ajustes
  //
  //   Las pantallas pushadas tienen pathnames más largos:
  //     ❌ '/appointments/new'      = pantalla pushada
  //     ❌ '/appointments/abc-123'  = detalle de cita
  //     ❌ '/clients/new'           = nuevo cliente
  //     ❌ '/clients/inactive'      = clientes inactivos
  //     ❌ '/settings/profile'      = subpantalla de settings
  //
  //   La diferencia visible: pestañas son strings SIMPLES, pushadas tienen
  //   slash ADICIONAL después del nombre de la tab.
  //
  //   Nueva lógica: si pathname NO es exactamente una de las pestañas
  //   reales, NO interceptamos el back. Dejamos que Expo Router maneje el
  //   back nativamente (lo que sí funciona correctamente).
  //
  // CLEANUP:
  //   El listener se remueve al desmontar el layout (logout, etc).
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    // Lista EXACTA de pathnames de pestañas reales (no pantallas pushadas).
    // Expo Router puede devolver el pathname con o sin slash final, por eso
    // contemplamos ambas variantes.
    const TAB_PATHS = new Set([
      '/',
      '/index',
      '/appointments',
      '/appointments/',
      '/clients',
      '/clients/',
      '/reports',
      '/reports/',
      '/settings',
      '/settings/',
    ]);

    // ¿El pathname actual es EXACTAMENTE una pestaña?
    // Si NO está en la lista, es una pantalla pushada (Nueva Cita, Detalle,
    // Nuevo Cliente, etc) y debemos DEJAR que el back nativo de Expo Router
    // funcione (que sí maneja correctamente el pop del stack).
    const isOnTabRoot = TAB_PATHS.has(pathname);

    // Si NO estamos en una pestaña, NO interceptamos el back.
    if (!isOnTabRoot) {
      return;
    }

    // ¿Estamos específicamente en Inicio?
    const isOnHome = pathname === '/' || pathname === '/index';

    const onBackPress = (): boolean => {
      // En Inicio → false: Android ejecuta su acción default (salir de la app).
      // En otra pestaña → true: manejamos navegando a Inicio.
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
      </Tabs>
      <FloatingTabBar tabs={tabs} />
    </>
  );
}
