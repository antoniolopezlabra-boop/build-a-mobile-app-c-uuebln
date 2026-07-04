// ══════════════════════════════════════════════════════════════════════
// utils/errorMessages.ts — Mensajes de error contextualizados (UX-003)
//
// Este módulo mapea los códigos de error generados por utils/api.ts (y
// otros lugares de la app) a mensajes accionables para el usuario final.
//
// PROBLEMA RESUELTO:
// Antes, los errores se mostraban como "Error: No se pudo guardar" sin
// contexto. El usuario no sabía qué hacer ni si era su culpa.
//
// AHORA:
// Cada error se traduce a un mensaje específico con título, descripción
// y, cuando aplica, una acción sugerida.
//
// USO:
//   import { translateError } from '@/utils/errorMessages';
//   try { ... } catch (e) {
//     const { title, message, actionLabel } = translateError(e);
//     Alert.alert(title, message, [
//       { text: 'OK', style: 'cancel' },
//       actionLabel && { text: actionLabel, onPress: ... }
//     ]);
//   }
// ══════════════════════════════════════════════════════════════════════

import { Platform } from 'react-native';

export interface FriendlyError {
  /** Título corto del Alert (4-6 palabras max) */
  title: string;
  /** Mensaje principal del Alert (1-2 frases accionables) */
  message: string;
  /** Etiqueta del botón de acción sugerido (opcional) */
  actionLabel?: string;
  /** Identificador del tipo de acción sugerida (para router) */
  action?: 'upgrade_plan' | 'change_settings' | 'retry' | 'contact_support' | 'change_time';
  /** Código de error original (para Sentry / debugging) */
  code?: string;
}

/**
 * Traduce un Error a un FriendlyError accionable.
 * Reconoce códigos específicos de la API (PLAN_LIMIT_REACHED, etc.) y
 * patrones comunes (red, timeout, 401, etc.).
 */
export function translateError(error: any): FriendlyError {
  const code: string | undefined = error?.code;
  const message: string = error?.message ?? String(error ?? '');
  const lowerMsg = message.toLowerCase();

  // ── Códigos de error de la API ────────────────────────────────────

  if (code === 'PLAN_LIMIT_REACHED') {
    // iOS (Guideline 3.1.1): mensaje neutro, sin CTA ni lenguaje de venta.
    if (Platform.OS === 'ios') {
      return {
        title: 'Límite alcanzado',
        message: 'Llegaste al tope de citas de tu plan este mes.',
        code,
      };
    }
    return {
      title: 'Límite alcanzado',
      message: 'Llegaste al tope de citas de tu Plan Básico este mes. Actualiza a Premium para citas ilimitadas y WhatsApp automático.',
      actionLabel: 'Ver planes',
      action: 'upgrade_plan',
      code,
    };
  }

  if (code === 'SLOT_TAKEN') {
    return {
      title: 'Horario ocupado',
      message: 'Ese horario acaba de ocuparse, probablemente por otra reserva. Elige otro slot disponible.',
      actionLabel: 'Elegir otro horario',
      action: 'change_time',
      code,
    };
  }

  if (code === 'SLOT_BLOCKED') {
    return {
      title: 'Horario bloqueado',
      message: message || 'Ese horario está bloqueado (descanso, comida o no disponible). Elige otro horario libre.',
      actionLabel: 'Elegir otro horario',
      action: 'change_time',
      code,
    };
  }

  if (code === 'OVERLAP_NOT_ALLOWED') {
    return {
      title: 'Solo en Plan Luxury',
      message: 'Las citas simultáneas solo están disponibles en el Plan Luxury. Actualiza tu plan para activar esta función.',
      actionLabel: 'Ver Plan Luxury',
      action: 'upgrade_plan',
      code,
    };
  }

  if (code === 'OVERLAP_TOGGLE_OFF') {
    return {
      title: 'Función desactivada',
      message: 'El toggle "Citas simultáneas" no está activado. Actívalo desde Ajustes > Mi Negocio para crear citas en el mismo horario.',
      actionLabel: 'Ir a Ajustes',
      action: 'change_settings',
      code,
    };
  }

  if (code === 'PLAN_REQUIRED') {
    return {
      title: 'Función Premium',
      message: 'El asistente IA está disponible en Plan Premium y Luxury. Actualiza tu plan en Ajustes > Plan y Suscripción.',
      actionLabel: 'Ver planes',
      action: 'upgrade_plan',
      code,
    };
  }

  if (code === 'RATE_LIMITED') {
    return {
      title: 'Demasiadas solicitudes',
      message: message || 'Has alcanzado el límite diario de mensajes al asistente IA. Intenta de nuevo mañana.',
      code,
    };
  }

  // ── Errores de autenticación ──────────────────────────────────────

  if (lowerMsg.includes('invalid login') || lowerMsg.includes('invalid credentials') ||
      lowerMsg.includes('email not confirmed') || message.includes('401')) {
    return {
      title: 'Correo o contraseña incorrectos',
      message: 'Verifica tus credenciales e intenta de nuevo. Si olvidaste tu contraseña, puedes restablecerla.',
      code: 'AUTH_INVALID',
    };
  }

  if (lowerMsg.includes('no authenticated user') || lowerMsg.includes('session expired') ||
      lowerMsg.includes('jwt expired')) {
    return {
      title: 'Tu sesión expiró',
      message: 'Por favor vuelve a iniciar sesión.',
      code: 'AUTH_EXPIRED',
    };
  }

  // ── Errores de red ────────────────────────────────────────────────

  if (lowerMsg.includes('network request failed') || lowerMsg.includes('fetch') ||
      lowerMsg.includes('network') || lowerMsg.includes('failed to fetch')) {
    return {
      title: 'Sin conexión',
      message: 'No pudimos conectarnos. Verifica tu internet e intenta de nuevo.',
      actionLabel: 'Reintentar',
      action: 'retry',
      code: 'NETWORK_ERROR',
    };
  }

  if (lowerMsg.includes('timeout') || lowerMsg.includes('timed out')) {
    return {
      title: 'Se tardó demasiado',
      message: 'La operación tardó más de lo esperado. Verifica tu conexión e intenta de nuevo.',
      actionLabel: 'Reintentar',
      action: 'retry',
      code: 'TIMEOUT',
    };
  }

  // ── Errores de Supabase / DB ──────────────────────────────────────

  if (lowerMsg.includes('duplicate key') || lowerMsg.includes('unique constraint')) {
    return {
      title: 'Registro duplicado',
      message: 'Ya existe un registro con estos datos. Verifica que no hayas creado uno similar antes.',
      code: 'DUPLICATE',
    };
  }

  if (lowerMsg.includes('row-level security') || lowerMsg.includes('rls') ||
      lowerMsg.includes('permission denied')) {
    return {
      title: 'Sin permiso',
      message: 'No tienes permiso para realizar esta acción. Si crees que es un error, contáctanos.',
      actionLabel: 'Contactar soporte',
      action: 'contact_support',
      code: 'PERMISSION_DENIED',
    };
  }

  // ── Errores genéricos ─────────────────────────────────────────────

  // Si el mensaje original es accionable y corto, úsalo directamente
  if (message && message.length > 5 && message.length < 200 && !lowerMsg.includes('error:')) {
    return {
      title: 'No se pudo completar',
      message,
      code: code ?? 'UNKNOWN',
    };
  }

  // Fallback final
  return {
    title: 'Algo salió mal',
    message: 'Ocurrió un error inesperado. Intenta de nuevo en un momento. Si persiste, escríbenos a soporte@vylta.lat.',
    actionLabel: 'Reintentar',
    action: 'retry',
    code: code ?? 'UNKNOWN',
  };
}

/**
 * Helper para mostrar un Alert estandarizado a partir de un error.
 * Uso: showErrorAlert(error, navigationFunctions)
 *
 * Acepta un objeto con callbacks para cada acción (upgrade_plan, etc.)
 * Si el callback no se provee para esa acción, solo muestra el botón OK.
 */
export interface ErrorAlertActions {
  onUpgradePlan?: () => void;
  onChangeSettings?: () => void;
  onRetry?: () => void;
  onContactSupport?: () => void;
  onChangeTime?: () => void;
}

export function buildErrorAlertButtons(
  friendly: FriendlyError,
  actions: ErrorAlertActions = {}
): Array<{ text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }> {
  const buttons: Array<{ text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }> = [];

  // Botón principal de acción (si existe)
  if (friendly.action && friendly.actionLabel) {
    let callback: (() => void) | undefined;
    switch (friendly.action) {
      case 'upgrade_plan':    callback = actions.onUpgradePlan;    break;
      case 'change_settings': callback = actions.onChangeSettings; break;
      case 'retry':           callback = actions.onRetry;          break;
      case 'contact_support': callback = actions.onContactSupport; break;
      case 'change_time':     callback = actions.onChangeTime;     break;
    }
    if (callback) {
      buttons.push({ text: friendly.actionLabel, onPress: callback, style: 'default' });
    }
  }

  // Siempre incluir un botón de cierre (OK / Cancelar)
  buttons.push({ text: buttons.length > 0 ? 'Cancelar' : 'Entendido', style: 'cancel' });

  return buttons;
}
