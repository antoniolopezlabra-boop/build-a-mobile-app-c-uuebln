// ══════════════════════════════════════════════════════════════════════
// errorMessages.ts — Mapeo de códigos de error a mensajes accionables
//
// HALLAZGO UX-003 DEL REPORTE DE AUDITORÍA (May 17 2026)
// Múltiples lugares mostraban Alert.alert('Error', 'No se pudo guardar')
// genéricos. El usuario no sabía qué hacer ni si era su culpa, problema
// de red, o bug. Esto frustra al usuario y aumenta churn temprano.
//
// SOLUCIÓN: helper centralizado getActionableErrorMessage(error) que
// devuelve { title, message, action? } basándose en el código del error
// (que utils/api.ts ya setea correctamente con err.code = 'PLAN_LIMIT_REACHED', etc.).
//
// Esto da consistencia 100% al manejo de errores en toda la app.
// ══════════════════════════════════════════════════════════════════════

export interface ActionableError {
  /** Título corto que va en el Alert (ej. "Sin espacio en tu plan") */
  title: string;
  /** Cuerpo del mensaje, accionable y claro (ej. "Actualiza a Premium...") */
  message: string;
  /** Texto sugerido para el botón de acción (ej. "Ver planes") */
  actionLabel?: string;
  /** Si la acción debe abrir una ruta de la app, aquí va el path */
  actionPath?: string;
  /** Indica si es un error del usuario (no del sistema) — útil para no
      enviarlo a Sentry como "bug" cuando se integre en ARCH-002 */
  isUserError?: boolean;
}

/**
 * Convierte cualquier error (de Supabase, fetch, o lanzado por utils/api.ts)
 * en un mensaje claro y accionable para mostrar al usuario.
 *
 * @example
 *   try { await apiPost('/api/appointments', body); }
 *   catch (e) {
 *     const err = getActionableErrorMessage(e);
 *     Alert.alert(err.title, err.message);
 *   }
 */
export function getActionableErrorMessage(error: any): ActionableError {
  // Sin error → no debería pasar, pero por seguridad.
  if (!error) {
    return {
      title: 'Algo salió mal',
      message: 'No pudimos completar la acción. Intenta de nuevo.',
    };
  }

  // ── 1. CÓDIGOS DE ERROR CUSTOM DE utils/api.ts ──────────────────────
  // Estos los lanza nuestra capa de validación con err.code = '...'

  if (error.code === 'PLAN_LIMIT_REACHED') {
    return {
      title: 'Alcanzaste el límite de tu plan',
      message: 'Ya usaste tus 10 citas mensuales del Plan Básico. Actualiza a Premium para tener citas ilimitadas + WhatsApp automático.',
      actionLabel: 'Ver Premium',
      actionPath: '/settings/subscription',
      isUserError: true,
    };
  }

  if (error.code === 'SLOT_TAKEN') {
    return {
      title: 'Ese horario ya está ocupado',
      message: 'Otra cita acaba de tomar ese horario. Por favor elige otro slot disponible en la agenda.',
      isUserError: true,
    };
  }

  if (error.code === 'SLOT_BLOCKED') {
    // El message original viene con el nombre del bloqueo y rango horario,
    // así que es bastante accionable tal cual. Lo aprovechamos.
    return {
      title: 'Horario bloqueado',
      message: error.message || 'Ese horario está bloqueado en tu agenda. Elige otro horario disponible.',
      isUserError: true,
    };
  }

  if (error.code === 'OVERLAP_NOT_ALLOWED') {
    return {
      title: 'Función exclusiva de Plan Luxury',
      message: 'Las citas simultáneas solo están disponibles en el Plan Luxury. Actualiza tu plan para activar esta función y atender a varios clientes a la vez.',
      actionLabel: 'Ver Luxury',
      actionPath: '/settings/subscription',
      isUserError: true,
    };
  }

  if (error.code === 'OVERLAP_TOGGLE_OFF') {
    return {
      title: 'Activa citas simultáneas',
      message: 'Tu plan permite citas simultáneas pero la opción está desactivada. Actívala desde Ajustes → Mi Negocio para crear citas que se traslapen.',
      actionLabel: 'Ir a Ajustes',
      actionPath: '/settings/business',
      isUserError: true,
    };
  }

  // ── 2. ERRORES DE SUPABASE (auth, RLS, conexión) ────────────────────

  const code = error.code || error.error?.code || '';
  const message = (error.message || error.error?.message || '').toLowerCase();

  // Autenticación expirada
  if (code === 'PGRST301' || message.includes('jwt expired') || message.includes('invalid jwt')) {
    return {
      title: 'Tu sesión expiró',
      message: 'Por favor inicia sesión de nuevo para continuar.',
      actionLabel: 'Ir a iniciar sesión',
      actionPath: '/auth/login',
    };
  }

  // RLS bloqueando acceso
  if (code === '42501' || message.includes('row-level security') || message.includes('permission denied')) {
    return {
      title: 'No tienes permiso',
      message: 'No tienes acceso a este recurso. Si crees que es un error, contáctanos.',
    };
  }

  // Recurso no encontrado
  if (code === 'PGRST116' || message.includes('not found') || message.includes('no rows')) {
    return {
      title: 'No encontramos lo que buscas',
      message: 'Este elemento puede haber sido eliminado. Refresca la pantalla.',
    };
  }

  // Conflicto único (ej. email duplicado al registrarse)
  if (code === '23505' || message.includes('duplicate key') || message.includes('already exists') || message.includes('already registered')) {
    return {
      title: 'Ya existe',
      message: 'Ese dato ya está registrado en el sistema. Verifica e intenta con otro valor.',
      isUserError: true,
    };
  }

  // FK violation (referencia a algo que no existe)
  if (code === '23503' || message.includes('foreign key')) {
    return {
      title: 'Datos incompletos',
      message: 'Faltan datos relacionados. Asegúrate de tener un cliente y servicio antes de crear la cita.',
      isUserError: true,
    };
  }

  // ── 3. ERRORES DE RED ───────────────────────────────────────────────

  if (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('network error') ||
    error.name === 'TypeError'
  ) {
    return {
      title: 'Sin conexión a internet',
      message: 'No pudimos conectar al servidor. Verifica tu conexión Wi-Fi o datos móviles e intenta de nuevo.',
    };
  }

  // Timeout
  if (message.includes('timeout') || message.includes('aborted') || error.name === 'AbortError') {
    return {
      title: 'La conexión es lenta',
      message: 'El servidor tardó demasiado en responder. Verifica tu red e intenta de nuevo.',
    };
  }

  // ── 4. ERRORES DE STRIPE / WHATSAPP / OTROS ─────────────────────────

  if (message.includes('stripe')) {
    return {
      title: 'Problema con el pago',
      message: 'No pudimos procesar el pago. Verifica los datos de tu tarjeta o intenta con otra forma de pago.',
      isUserError: true,
    };
  }

  if (message.includes('whatsapp') || message.includes('360dialog') || message.includes('waba')) {
    return {
      title: 'WhatsApp no disponible',
      message: 'No pudimos enviar el mensaje de WhatsApp. La cita se guardó correctamente, pero el cliente no recibirá la notificación automática.',
    };
  }

  // ── 5. FALLBACK GENÉRICO ────────────────────────────────────────────
  // Si llegamos acá es un error que no clasificamos. Usamos el mensaje
  // original si es legible, o uno genérico amigable.

  const rawMsg = error.message || error.error?.message;
  if (rawMsg && typeof rawMsg === 'string' && rawMsg.length > 0 && rawMsg.length < 200) {
    return {
      title: 'Algo salió mal',
      message: rawMsg,
    };
  }

  return {
    title: 'Algo salió mal',
    message: 'No pudimos completar la acción. Intenta de nuevo en unos segundos.',
  };
}

/**
 * Helper para usar con Alert.alert nativo de React Native.
 * Devuelve los argumentos exactos en el orden correcto.
 *
 * @example
 *   import { Alert } from 'react-native';
 *   import { alertFromError } from '@/utils/errorMessages';
 *
 *   catch (e) {
 *     const [title, message, buttons] = alertFromError(e, router);
 *     Alert.alert(title, message, buttons);
 *   }
 */
export function alertFromError(
  error: any,
  router?: { push: (path: any) => void }
): [string, string, Array<{ text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }>] {
  const err = getActionableErrorMessage(error);
  const buttons: Array<{ text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }> = [];

  if (err.actionLabel && err.actionPath && router) {
    buttons.push({
      text: err.actionLabel,
      onPress: () => router.push(err.actionPath as any),
    });
    buttons.push({ text: 'Cerrar', style: 'cancel' });
  } else {
    buttons.push({ text: 'Entendido', style: 'default' });
  }

  return [err.title, err.message, buttons];
}
