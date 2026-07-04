import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/utils/logger';

// Estado del permiso de notificaciones, persistido para que la pantalla de
// recordatorios (WhatsApp) pueda avisar al usuario si lo negó. Ver useNotifPermission.
export const PUSH_PERM_KEY = 'vylta_push_permission';

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
//
// ───────────────────────────────────────────────────────────────────
// FIX MAY 21 2026 — push notifications NO funcionaban en Android
// ───────────────────────────────────────────────────────────────────
// SÍNTOMAS:
//   • Token de Karen Android NUNCA se guardaba en notification_tokens
//   • Permisos OK, FCM configurado en EAS, package.json con expo-*
//   • El push directo a token iOS via Expo API SÍ funcionaba
//   • iPhone recibía notificación pero etiquetada como "Expo Go"
//
// CAUSAS RAÍZ (múltiples):
//   1. Race condition: el hook corría con user.id pero supabase.auth
//      aún no tenía sesión válida cargada → upsert fallaba por RLS
//      sin retornar error (PostgREST con anon key sin JWT válido).
//   2. logger.warn/error silenciado por SEC-003 en prod, no veíamos
//      el fallo real.
//   3. expo-notifications setNotificationHandler se llamaba en TOP-LEVEL
//      del módulo. Si el módulo nativo no estaba listo (cold start de
//      Android), eso podía throw síncronamente al cargar el JS bundle.
//
// SOLUCIONES (aplicadas en este archivo):
//   A. Mover setNotificationHandler dentro de try/catch DENTRO del
//      useEffect, no en top-level. Defensivo contra módulo no listo.
//   B. Esperar a que supabase.auth.getSession() devuelva sesión válida
//      ANTES de intentar el upsert (con polling de hasta 10 segundos).
//   C. Reintentar el upsert hasta 3 veces con backoff exponencial si
//      falla por cualquier razón.
//   D. Usar console.error con prefijo [VYLTA-PUSH] en CADA paso crítico.
//      Esto NO se silencia por SEC-003 (console.error siempre se imprime)
//      y permite diagnosticar via adb logcat o Sentry/Crashlytics futuros.
//   E. Si el platform es android, registrar el canal ANTES de pedir
//      permisos. Algunos OEMs (Xiaomi, Huawei) requieren esto.
// ══════════════════════════════════════════════════════════════════

export function usePushToken() {
  const { user } = useAuth();
  const tokenRegisteredRef = useRef<string | null>(null);

  useEffect(() => {
    // FIX A: setNotificationHandler dentro del effect, no en top-level
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    } catch (e) {
      console.error('[VYLTA-PUSH] setNotificationHandler failed:', e);
    }

    if (!user?.id) {
      console.log('[VYLTA-PUSH] No user yet, waiting...');
      return;
    }

    // Evitar re-registro si ya lo hicimos para este usuario en esta sesión
    if (tokenRegisteredRef.current === user.id) {
      console.log('[VYLTA-PUSH] Already registered for', user.id);
      return;
    }

    console.log('[VYLTA-PUSH] Starting registration for user', user.id);

    registerForPushNotifications(user.id)
      .then(success => {
        if (success) {
          tokenRegisteredRef.current = user.id;
          console.log('[VYLTA-PUSH] ✅ Token registrado correctamente para', user.id);
          logger.log('[usePushToken] Token registrado correctamente para', user.id);
        } else {
          console.error('[VYLTA-PUSH] ❌ Registration returned false');
        }
      })
      .catch(err => {
        console.error('[VYLTA-PUSH] ❌ Exception during registration:', err?.message || err);
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
    console.error('[VYLTA-PUSH] No es un dispositivo real (emulador) — saltar');
    return false;
  }
  console.log('[VYLTA-PUSH] Step 1 OK: Device.isDevice =', Device.isDevice);

  // 2. Configurar canal de notificaciones para Android 8.0+
  // FIX E: registrar canal ANTES de pedir permisos (algunos OEMs lo exigen)
  if (Platform.OS === 'android') {
    try {
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
      console.log('[VYLTA-PUSH] Step 2 OK: Android channel created');
    } catch (e: any) {
      console.error('[VYLTA-PUSH] Step 2 FAIL: channel error:', e?.message || e);
      // No retornamos false aquí; el canal por defecto del plugin del app.json
      // ya debería existir. Seguimos intentando.
    }
  }

  // 3. Verificar permisos
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  console.log('[VYLTA-PUSH] Step 3 OK: existing perm status =', existingStatus);
  let finalStatus = existingStatus;

  // 4. Si no tenemos permiso, pedirlo
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
    console.log('[VYLTA-PUSH] Step 4 OK: requested perm, new status =', status);
  }

  if (finalStatus !== 'granted') {
    console.error('[VYLTA-PUSH] Step 4 FAIL: Usuario no concedió permiso, final status:', finalStatus);
    // ⚡ FIX BUG (jul 2026): persistir el estado para que la pantalla de recordatorios
    // avise al usuario que no recibirá notificaciones (antes el fallo era silencioso:
    // el dueño creía que le llegarían recordatorios y nunca llegaban).
    try { await AsyncStorage.setItem(PUSH_PERM_KEY, 'denied'); } catch {}
    return false;
  }
  try { await AsyncStorage.setItem(PUSH_PERM_KEY, 'granted'); } catch {}

  // 5. Obtener Expo Push Token
  // El projectId viene del app.json (extra.eas.projectId)
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;

  if (!projectId) {
    console.error('[VYLTA-PUSH] Step 5 FAIL: No se encontró projectId en Constants');
    return false;
  }
  console.log('[VYLTA-PUSH] Step 5 OK: projectId =', projectId);

  let token: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    token = result.data;
    console.log('[VYLTA-PUSH] Step 6 OK: token obtained =', token);
  } catch (e: any) {
    console.error('[VYLTA-PUSH] Step 6 FAIL: getExpoPushTokenAsync error:', {
      message: e?.message,
      code: e?.code,
      name: e?.name,
      stack: e?.stack?.substring(0, 500),
    });
    return false;
  }

  // FIX B: Esperar a que supabase.auth tenga sesión válida ANTES de upsert.
  // Esto resuelve la race condition donde user.id ya existe pero el JWT
  // todavía no se cargó en el cliente Supabase, causando que RLS bloquee
  // el insert silenciosamente.
  let sessionReady = false;
  for (let i = 0; i < 20; i++) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token && session.user?.id === userId) {
      sessionReady = true;
      console.log('[VYLTA-PUSH] Step 7 OK: session ready after', i * 500, 'ms');
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (!sessionReady) {
    console.error('[VYLTA-PUSH] Step 7 FAIL: session never became ready after 10s. Aborting upsert.');
    return false;
  }

  // 6. Guardar token en Supabase con REINTENTOS (Fix C)
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  console.log('[VYLTA-PUSH] Step 8: upserting token, platform =', platform);

  let lastError: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error, data } = await supabase
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
          ignoreDuplicates: false,
        }
      )
      .select();

    if (!error) {
      console.log('[VYLTA-PUSH] Step 8 OK: upsert successful on attempt', attempt, ', rows:', data?.length);
      return true;
    }

    lastError = error;
    console.error(`[VYLTA-PUSH] Step 8 FAIL attempt ${attempt}/3:`, {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    // Backoff exponencial: 1s, 2s, 4s
    if (attempt < 3) {
      const wait = 1000 * Math.pow(2, attempt - 1);
      console.log('[VYLTA-PUSH] Retrying in', wait, 'ms');
      await new Promise(resolve => setTimeout(resolve, wait));
    }
  }

  console.error('[VYLTA-PUSH] Step 8 FAIL: All 3 attempts failed. Last error:', lastError);
  return false;
}
