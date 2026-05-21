import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

// ═════════════════════════════════════════════════════════════════════
// useAndroidBackToHome — Hook para que el botón "atrás" de Android
// lleve al usuario a la pantalla de Inicio en lugar de salir de la app.
//
// PROBLEMA QUE RESUELVE:
//   Los usuarios reportaron comportamiento inconsistente: desde Citas
//   y Clientes el botón atrás los sacaba de la app, mientras que desde
//   Reportes y Ajustes los llevaba a Inicio. Esta inconsistencia es
//   inaceptable en una app profesional.
//
// COMPORTAMIENTO DESEADO (estándar de apps modernas como Instagram,
// Twitter, WhatsApp):
//   • Desde Inicio → atrás → salir de la app
//   • Desde cualquier otra tab → atrás → ir a Inicio
//
// USO:
//   import { useAndroidBackToHome } from '@/hooks/useAndroidBackToHome';
//
//   function CitasScreen() {
//     useAndroidBackToHome();
//     // ...
//   }
//
// IMPORTANTE: NO aplicarlo en la pantalla de Inicio. Ahí queremos que
// el back button mantenga su comportamiento default (salir de la app).
//
// PLATAFORMAS: Solo afecta a Android. En iOS es no-op (iOS no tiene
// botón atrás hardware, usa el gesto de swipe que respetan los stacks).
//
// USA useFocusEffect (no useEffect):
//   El listener debe estar activo SOLO cuando la pantalla tiene el
//   foco. Si estuviéramos con un useEffect simple, el listener se
//   mantendría activo cuando el usuario navega a otra tab, causando
//   que esa otra tab también herede este comportamiento.
//   useFocusEffect garantiza que cleanup al perder foco.
// ═════════════════════════════════════════════════════════════════════

export function useAndroidBackToHome() {
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      // No-op en iOS — esta plataforma no tiene back button hardware
      if (Platform.OS !== 'android') return;

      const onBackPress = (): boolean => {
        // Navegar a Home con replace (evita acumular historial)
        router.replace('/(tabs)/(home)' as any);
        // Retornar true indica que manejamos el evento — no usar comportamiento default
        return true;
      };

      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        onBackPress
      );

      // Cleanup al perder foco o desmontar
      return () => {
        subscription.remove();
      };
    }, [router])
  );
}
