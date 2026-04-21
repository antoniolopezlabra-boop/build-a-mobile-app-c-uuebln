/**
 * Traducción de nombres internos de planes a nombres visibles al usuario.
 *
 * Rebranding Abr 2026: los nombres internos en BD y código permanecen iguales,
 * pero el USUARIO VE nombres nuevos para alinear con la nueva estructura comercial.
 *
 * IMPORTANTE: Nunca hardcodear 'Premium', 'Básico', 'Gratuito' en UI.
 * Siempre usar getPlanDisplayName() o los helpers de este archivo.
 *
 * PRECIOS ACTUALIZADOS 21 ABR 2026:
 *   Gratuito → "Básico"   $0 MXN/mes
 *   Basico   → "Premium"  $399 MXN/mes (antes $990)
 *   Premium  → "Luxury"   $799 MXN/mes (antes $1,490)
 */

// Tipo de plan tal como se guarda en BD (tabla subscription_plans, columna plan_type)
export type InternalPlanType = 'Gratuito' | 'Basico' | 'Básico' | 'Premium';

// Nombre que se muestra al usuario en la app
export type DisplayPlanName = 'Básico' | 'Premium' | 'Luxury';

/**
 * Convierte el nombre interno del plan al nombre visible al usuario.
 *
 * Mapeo:
 *   'Gratuito' → 'Básico'    ($0 MXN/mes, 10 citas/mes)
 *   'Basico'   → 'Premium'   ($399 MXN/mes, citas ilimitadas + WhatsApp + reportes)
 *   'Premium'  → 'Luxury'    ($799 MXN/mes, todo + colaboradores + email marketing)
 */
export function getPlanDisplayName(internalType: string | null | undefined): DisplayPlanName {
  const normalized = (internalType || '').toLowerCase().trim();
  if (normalized === 'premium') return 'Luxury';
  if (normalized === 'basico' || normalized === 'básico') return 'Premium';
  return 'Básico'; // Gratuito o cualquier otro valor → Básico (el plan de entrada)
}

/**
 * Devuelve el badge/etiqueta corta en mayúsculas para mostrar junto al plan.
 * Útil en chips/badges tipo "PLAN LUXURY".
 */
export function getPlanBadgeLabel(internalType: string | null | undefined): string {
  return getPlanDisplayName(internalType).toUpperCase();
}

/**
 * Devuelve el precio formateado del plan según el nombre interno.
 * Centralizado aquí para evitar precios hardcoded distintos en cada pantalla.
 *
 * PRECIOS ACTUALES (21 ABR 2026):
 *   Gratuito → $0 MXN/mes
 *   Basico   → $399 MXN/mes
 *   Premium  → $799 MXN/mes
 */
export function getPlanPrice(internalType: string | null | undefined): string {
  const normalized = (internalType || '').toLowerCase().trim();
  if (normalized === 'premium') return '$799 MXN/mes';
  if (normalized === 'basico' || normalized === 'básico') return '$399 MXN/mes';
  return '$0 MXN/mes'; // Gratuito — NO usar la palabra "Gratis" (riesgo App Store)
}

/**
 * Devuelve el emoji representativo del plan.
 */
export function getPlanEmoji(internalType: string | null | undefined): string {
  const normalized = (internalType || '').toLowerCase().trim();
  if (normalized === 'premium') return '⭐';      // Luxury
  if (normalized === 'basico' || normalized === 'básico') return '🚀';  // Premium
  return '🌱'; // Básico (entry-level)
}

/**
 * Helper útil para referirse a otro plan por su nombre VISIBLE en copy.
 * Ejemplo: "Solo disponible en Plan Luxury" en lugar de "Solo disponible en Plan Premium".
 *
 * Uso: getUpgradeTargetName('premium') → 'Luxury'
 *      getUpgradeTargetName('basico')  → 'Premium'
 */
export function getUpgradeTargetName(internalType: string | null | undefined): DisplayPlanName {
  return getPlanDisplayName(internalType);
}
