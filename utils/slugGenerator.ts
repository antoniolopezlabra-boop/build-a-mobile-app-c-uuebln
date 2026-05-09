import type { SupabaseClient } from '@supabase/supabase-js';

// ════════════════════════════════════════════════════════════════════
// VYLTA — Generador de slugs para booking_links
//
// Convierte un business_name en un slug URL-safe único:
//   "Karen Nails Star & Heart" → "karen-nails-star-heart"
//   "Salón Belleza Único"      → "salon-belleza-unico"
//   "Café del Sol"             → "cafe-del-sol"
//
// Usado por el setup wizard al crear el negocio para auto-generar
// el booking_link sin requerir acción explícita del usuario.
// ════════════════════════════════════════════════════════════════════

/**
 * Convierte un business_name en un slug URL-safe.
 * NO garantiza unicidad — para eso usar ensureUniqueSlug después.
 *
 * Reglas:
 * - Bajar a minúsculas
 * - Quitar acentos (á → a, ñ → n, etc.)
 * - Reemplazar espacios y símbolos por guiones
 * - Eliminar guiones consecutivos y al inicio/final
 * - Limitar a 50 caracteres (suficiente para URLs cortas)
 *
 * Edge cases:
 * - Si el resultado queda vacío (ej: nombre solo símbolos o caracteres no-latinos),
 *   retorna 'mi-negocio' como fallback seguro.
 */
export function generateSlug(businessName: string): string {
  if (!businessName || typeof businessName !== 'string') {
    return 'mi-negocio';
  }

  const normalized = businessName
    .toLowerCase()
    .normalize('NFD')                      // Descompone á → a + ́
    .replace(/[\u0300-\u036f]/g, '')       // Elimina los acentos descompuestos
    .replace(/ñ/g, 'n')                    // ñ no se descompone con NFD, manual
    .replace(/[^a-z0-9]+/g, '-')           // Cualquier no-alfanumérico → guion
    .replace(/^-+|-+$/g, '')               // Quitar guiones al inicio/final
    .replace(/-+/g, '-')                   // Colapsar guiones consecutivos
    .substring(0, 50);                     // Límite de 50 chars

  // Fallback si el slug quedó vacío (ej: nombre solo símbolos o chino/japonés)
  return normalized || 'mi-negocio';
}

/**
 * Garantiza que el slug sea único en la tabla booking_links.
 * Si el slug base ya existe, agrega sufijo numérico (-2, -3, ...).
 *
 * Estrategia:
 * 1. Intenta el slug base
 * 2. Si existe, prueba con -2, -3, ... hasta -99
 * 3. Si sigue colisionando, usa sufijo aleatorio de 4 caracteres
 *
 * @param baseSlug Slug generado por generateSlug()
 * @param supabase Cliente Supabase (inyectado para testabilidad)
 * @returns Slug único garantizado
 */
export async function ensureUniqueSlug(
  baseSlug: string,
  supabase: SupabaseClient
): Promise<string> {
  // Intento 1: el slug base directo
  if (await isSlugAvailable(baseSlug, supabase)) {
    return baseSlug;
  }

  // Intento 2-99: con sufijo numérico
  for (let i = 2; i <= 99; i++) {
    const candidate = `${baseSlug}-${i}`;
    if (await isSlugAvailable(candidate, supabase)) {
      return candidate;
    }
  }

  // Fallback extremo (improbable): sufijo aleatorio
  const random = Math.random().toString(36).substring(2, 6);
  return `${baseSlug}-${random}`;
}

/**
 * Verifica si un slug está disponible (no existe en booking_links).
 * Función interna privada al módulo.
 */
async function isSlugAvailable(slug: string, supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase
    .from('booking_links')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  return !data;  // null = disponible, hay data = ocupado
}
