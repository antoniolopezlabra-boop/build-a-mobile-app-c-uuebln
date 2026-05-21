import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/utils/logger';

// ══════════════════════════════════════════════════════════════════
// usePushToken — Pide permiso de notificaciones y guarda el Expo Push
// Token del usuario en Supabase para que el backend pueda mandarle pushes.
//
// FLUJO:
//   1. Cuando el usuario logueado entra a la app:
//   2. Verificar que estamos en un dispositivo real (no emulador/Expo Go)
//   3. Pedir permiso de notificaciones (si no lo tenemos aún)
//   4. Si concede permiso → obtener Expo Push Token
//   5. Hacer upsert del token en la tabla notification_tokens
//   6. Configurar canal de notificaciones para Android 8.0+
//
// IMPORTANTE:
//   • Expo Go NO soporta push notifications. En desarrollo, este hook
//     no hace nada (sale temprano).
//   • Solo funciona en builds nativos (APK/AAB de EAS).
//   • El token es UNIQUE por (user_id, expo_push_token), así que upsert
//     no crea duplicados si el usuario re-abre la app.
//
// USO:
//   import { usePushToken } from '@/hooks/usePushToken';
//   En app/_layout.tsx, dentro de AuthProvider:
//     function ComponenteAuth() { usePushToken(); return null; }
// ══════════════════════════════════════════════════════════════════

// Configurar cómo se muestran las notificaciones cuando la app está abierta
// (foreground). Por defecto, las notificaciones NO aparecen si la app está
// abierta. Nosotros queremos que SIEMPRE aparezcan (ej. "Tienes cita en 10 min").
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushToken() {
  const { user } = useAuth();
  const tokenRegisteredRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    // Evitar re-registro si ya lo hicimos para este usuario en esta sesión
    if (tokenRegisteredRef.current === user.id) return;

    registerForPushNotifications(user.id)
      .then(success => {
        if (success) {
          tokenRegisteredRef.current = user.id;
          logger.log('[usePushToken] Token registrado correctamente para', user.id);
        }
      })
      .catch(err => {
        logger.warn('[usePushToken] Error registrando token:', err);
      });
  }, [user?.id]);
}

// ──────────────────────────────────────────────────────────────────
// Lógica de registro
// ──────────────────────────────────────────────────────────────────

async function registerForPushNotifications(userId: string): Promise<boolean> {
  // 1. Verificar que estamos en un dispositivo real
  if (!Device.isDevice) {
    logger.warn('[usePushToken] No es un dispositivo real (emulador) — saltar');
    return false;
  }

  // 2. Configurar canal de notificaciones para Android 8.0+
  // En Android 8.0+, TODAS las notificaciones requieren estar asociadas a un canal.
  // Sin canal, las notificaciones NO se muestran. Esto es invisible para el usuario.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Notificaciones VYLTA',
      description: 'Recordatorios de citas y avisos importantes',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#10B981',
      sound: 'default',
      enableVibrate: true,
      enableLights: true,
      showBadge: true,
    });
  }

  // 3. Verificar permisos
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // 4. Si no tenemos permiso, pedirlo
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    logger.warn('[usePushToken] Usuario no concedió permiso de notificaciones');
    return false;
  }

  // 5. Obtener Expo Push Token
  // El projectId viene del app.json (extra.eas.projectId)
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;

  if (!projectId) {
    logger.error('[usePushToken] No se encontró projectId en app.json');
    return false;
  }

  let token: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    token = result.data;
  } catch (e) {
    logger.error('[usePushToken] Error obteniendo Expo Push Token:', e);
    return false;
  }

  // 6. Guardar token en Supabase (upsert para no duplicar)
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';

  const { error } = await supabase
    .from('notification_tokens')
    .upsert(
      {
        user_id: userId,
        expo_push_token: token,
        platform,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,expo_push_token',
        ignoreDuplicates: false, // hacer update si ya existe
      }
    );

  if (error) {
    logger.error('[usePushToken] Error guardando token en Supabase:', error);
    return false;
  }

  return true;
}
