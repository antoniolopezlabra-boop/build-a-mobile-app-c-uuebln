import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { logger } from '@/utils/logger';

// ═════════════════════════════════════════════════════════════════════════
// haptics.ts — Helper centralizado para feedback haptico premium
//
// FILOSOFIA:
//   El haptic feedback es lo que distingue una app "made in Mexico" de una
//   app que parece "made by Apple". Es invisible conscientemente pero el
//   usuario PIENSA "esto se siente premium". Es lo que diferencia
//   Whatsapp/Instagram/Robinhood de apps mediocres.
//
//   Usuarios beta como Karen y Cris probablemente NO lo notaran
//   conscientemente, pero su cerebro registrara "se siente mejor que las
//   apps gratuitas que he usado".
//
// SEMANTICA (no tonos, intenciones):
//   light()    → tap suave (seleccionar opcion, abrir modal)
//   medium()   → confirmacion estandar (crear cita, guardar)
//   heavy()    → accion importante (cobrar pago, completar cita)
//   success()  → operacion exitosa (cita creada, plan activado)
//   warning()  → operacion riesgosa (cancelar cita)
//   error()    → operacion fallida (sin internet, validacion fallo)
//   selection()→ swipe/scroll de selector (tabs, picker)
//
// PLATAFORMAS:
//   - iOS: el motor Taptic produce vibraciones precisas y sutiles
//   - Android: usa el motor de vibracion estandar (menos elegante pero
//     funcional). Algunos devices baratos lo desactivan en system settings.
//   - Web: no-op (no hace nada)
//
// SEGURIDAD:
//   Todos los handlers tienen try/catch silencioso. Si haptics falla por
//   cualquier razon (permisos, hardware), la app NO se rompe.
// ═════════════════════════════════════════════════════════════════════════

const IS_WEB = Platform.OS === 'web';

/**
 * Wrapper safe: ejecuta haptic feedback con catch silencioso.
 * Si falla por cualquier razon, no rompe el flow del usuario.
 */
async function safeHaptic(fn: () => Promise<void>) {
  if (IS_WEB) return; // No-op en web
  try {
    await fn();
  } catch (err) {
    // Silencioso — los haptics son un nice-to-have, no critico
    logger.warn('[Haptics] Skipped:', err);
  }
}

/**
 * Tap ligero — para acciones menores como abrir modal o tocar chip.
 */
export const lightHaptic = () =>
  safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

/**
 * Tap mediano — accion estandar de confirmacion (botones principales).
 */
export const mediumHaptic = () =>
  safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

/**
 * Tap fuerte — accion de peso (eliminar, cobrar, completar).
 */
export const heavyHaptic = () =>
  safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));

/**
 * Patron de exito — para cuando algo se completo bien.
 * Vibracion sutil pero satisfactoria. Usar despues de "crear cita", etc.
 */
export const successHaptic = () =>
  safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

/**
 * Patron de warning — para acciones que requieren atencion del usuario.
 * Usar antes de confirmar accion destructiva (eliminar cliente, etc.)
 */
export const warningHaptic = () =>
  safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));

/**
 * Patron de error — para cuando algo fallo o entrada invalida.
 * Vibracion doble distintiva para señalar que algo no esta bien.
 */
export const errorHaptic = () =>
  safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));

/**
 * Selection feedback — para swipes, scrollers de selector, tabs.
 * Es la mas sutil de todas. Usar para feedback de seleccion continua.
 */
export const selectionHaptic = () =>
  safeHaptic(() => Haptics.selectionAsync());

// ═════════════════════════════════════════════════════════════════════════
// EXPORT DEFAULT — interfaz unificada
// ═════════════════════════════════════════════════════════════════════════
export const haptics = {
  light:     lightHaptic,
  medium:    mediumHaptic,
  heavy:     heavyHaptic,
  success:   successHaptic,
  warning:   warningHaptic,
  error:     errorHaptic,
  selection: selectionHaptic,
};

export default haptics;
