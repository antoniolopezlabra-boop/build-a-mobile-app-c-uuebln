import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { logger } from '@/utils/logger';

// ══════════════════════════════════════════════════════════════════
// useNotificationHandler — Maneja interacciones con notificaciones push
//
// QUÉ HACE:
//   1. Listener para cuando llega una notificación con app abierta (foreground)
//   2. Listener para cuando el usuario TOCA una notificación y abre la app
//
// AL TOCAR UNA NOTIFICACIÓN:
//   El backend pone en `data` el campo `appointmentId` cuando la notificación
//   es sobre una cita. Si está presente, navegamos a /appointments/{id}.
//   Si no, no hacemos nada especial (la app se abre y ya).
//
// EJEMPLO DE PAYLOAD QUE MANDA EL BACKEND:
//   {
//     to: "ExponentPushToken[xxx]",
//     title: "⏰ Tienes cita en 10 minutos",
//     body: "María - Corte de cabello a las 14:00",
//     data: { appointmentId: "uuid-de-la-cita", type: "reminder" }
//   }
//
// USO:
//   import { useNotificationHandler } from '@/hooks/useNotificationHandler';
//   En app/_layout.tsx: <NotificationListener /> con useNotificationHandler()
// ══════════════════════════════════════════════════════════════════

export function useNotificationHandler() {
  const router = useRouter();
  const lastHandledRef = useRef<string | null>(null);

  useEffect(() => {
    // Listener 1: notificación llega CON la app abierta (foreground)
    // El handler ya configurado en usePushToken hace que se muestre el banner.
    // Aquí solo loggeamos para debugging.
    const receivedSub = Notifications.addNotificationReceivedListener(notif => {
      logger.log('[Notifications] Recibida en foreground:', notif.request.content.title);
    });

    // Listener 2: usuario TOCA una notificación para abrir la app
    // Esto es lo importante — aquí redirigimos a la pantalla de la cita.
    const responseSub = Notifications.addNotificationResponseReceivedListener(response => {
      handleNotificationTap(response, router, lastHandledRef);
    });

    // También manejar el caso en que la app se ABRIÓ desde una notificación
    // (estaba completamente cerrada y el usuario tocó la noti para abrirla).
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) {
        handleNotificationTap(response, router, lastHandledRef);
      }
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [router]);
}

// ──────────────────────────────────────────────────────────────────
function handleNotificationTap(
  response: Notifications.NotificationResponse,
  router: ReturnType<typeof useRouter>,
  lastHandledRef: React.MutableRefObject<string | null>
) {
  try {
    const notifId = response.notification.request.identifier;

    // Anti-doble-procesamiento: si el listener y getLastNotificationResponseAsync
    // disparan al mismo tiempo (puede pasar al abrir desde cold start), evitamos
    // navegar dos veces a la misma cita.
    if (lastHandledRef.current === notifId) {
      logger.log('[Notifications] Tap ya procesado, ignorando:', notifId);
      return;
    }
    lastHandledRef.current = notifId;

    const data = response.notification.request.content.data || {};
    logger.log('[Notifications] Tap recibido, data:', data);

    // Si la notificación trae appointmentId → abrir esa cita
    if (data.appointmentId && typeof data.appointmentId === 'string') {
      // Pequeo delay para asegurarnos que el router esté listo si la app
      // está arrancando desde cold start
      setTimeout(() => {
        router.push(`/appointments/${data.appointmentId}` as any);
      }, 100);
      return;
    }

    // Si trae type="new_appointment" pero no ID, mandar al listado de citas
    if (data.type === 'new_appointment') {
      setTimeout(() => {
        router.push('/(tabs)/appointments' as any);
      }, 100);
      return;
    }

    // Default: solo abrir la app (no navegar)
  } catch (e) {
    logger.warn('[Notifications] Error procesando tap:', e);
  }
}
