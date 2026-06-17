// Cache en memoria con aislamiento AUTOMÁTICO por usuario.
//
// Diseño (Abr 2026 — refactor Fase 2):
// El AuthContext registra el userId actual vía setCacheUserId() al cargar/cambiar
// de usuario y null al signOut. Internamente getCached/setCached prefijan la clave
// con el userId. Los callers no deben pasar userId — es imposible usarlo mal.
//
// Seguridad: si cambia el userId (login de otro usuario), las entradas anteriores
// quedan inaccesibles automáticamente (el prefijo cambia). Además signOut llama
// invalidateCache() para limpiar todo.

type CacheEntry = { data: any; timestamp: number; ttl: number };
const cache: Record<string, CacheEntry> = {};

const DEFAULT_TTL = 30_000; // 30s default

// TTLs específicos por tipo de dato
export const CACHE_TTL = {
  DASHBOARD:    30_000,  // 30s — datos que cambian frecuentemente
  APPOINTMENTS: 30_000,  // 30s
  CLIENTS:     300_000,  // 5min — cambian poco
  SERVICES:    300_000,  // 5min
  SETTINGS:    300_000,  // 5min
  REPORTS:      60_000,  // 1min
};

// ──────────────────────────────────────────────────────────────────
// Usuario activo del cache
// ──────────────────────────────────────────────────────────────────

let currentUserId: string | null = null;

/**
 * Registra el usuario activo. Lo llama AuthContext al login/load y con null al signOut.
 * Las claves se prefijan con este userId internamente.
 */
export function setCacheUserId(userId: string | null): void {
  if (currentUserId !== userId) {
    // Si cambia el usuario, limpiar el cache previo para evitar consumo de memoria
    // (las entradas del usuario anterior ya no serían accesibles por el prefijo,
    // pero mejor liberarlas de una vez).
    if (currentUserId !== null) {
      clearAllEntries();
    }
    currentUserId = userId;
  }
}

/**
 * Lee el usuario activo registrado (sincrónico, SIN red).
 * Lo usa getCurrentUserId() en utils/api.ts para resolver el userId al instante
 * sin llamar a supabase.auth.getUser() (que es una llamada de red que puede
 * colgarse tras una noche en background). AuthContext mantiene esto al día.
 */
export function getCacheUserId(): string | null {
  return currentUserId;
}

function buildKey(key: string): string {
  // Si no hay usuario registrado (ej. antes de login), usar prefijo anónimo.
  // No debería cachearse nada relevante sin usuario, pero no rompemos.
  return currentUserId ? `${currentUserId}:${key}` : `_anon:${key}`;
}

function clearAllEntries(): void {
  for (const k of Object.keys(cache)) delete cache[k];
}

// ──────────────────────────────────────────────────────────────────
// API pública — los callers NO cambian, siguen usando 'clients_list' etc.
// ──────────────────────────────────────────────────────────────────

export function getCached<T>(key: string): T | null {
  const fullKey = buildKey(key);
  const entry = cache[fullKey];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    delete cache[fullKey];
    return null;
  }
  return entry.data as T;
}

export function setCached(key: string, data: any, ttl = DEFAULT_TTL): void {
  cache[buildKey(key)] = { data, timestamp: Date.now(), ttl };
}

export function invalidateCache(key?: string): void {
  if (key) {
    delete cache[buildKey(key)];
  } else {
    // Sin key — limpia TODO el cache (uso recomendado: signOut)
    clearAllEntries();
  }
}

// ──────────────────────────────────────────────────────────────────
// Legacy helpers (por compatibilidad retro con cualquier caller que los use)
// ──────────────────────────────────────────────────────────────────

/**
 * @deprecated No se necesita — el aislamiento es automático ahora.
 * Se mantiene exportado para compatibilidad con callers antiguos.
 */
export function cacheKey(key: string, userId?: string): string {
  return userId ? `${userId}:${key}` : key;
}

/**
 * Limpia todas las entradas de un userId específico.
 * Utilidad para casos avanzados; en uso normal basta con setCacheUserId(nuevo) o signOut.
 */
export function invalidateUserCache(userId: string): void {
  const prefix = `${userId}:`;
  for (const k of Object.keys(cache)) {
    if (k.startsWith(prefix)) delete cache[k];
  }
}
