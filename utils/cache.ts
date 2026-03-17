// Cache en memoria con aislamiento por usuario y TTL configurable
const cache: Record<string, { data: any; timestamp: number; ttl: number }> = {};

const DEFAULT_TTL = 30000; // 30s default

// TTLs específicos por tipo de dato
export const CACHE_TTL = {
  DASHBOARD:   30_000,  // 30s — datos que cambian frecuentemente
  APPOINTMENTS: 30_000, // 30s
  CLIENTS:     300_000, // 5min — cambian poco
  SERVICES:    300_000, // 5min
  SETTINGS:    300_000, // 5min
  REPORTS:      60_000, // 1min
};

/** Construye clave aislada por usuario para evitar filtraciones entre cuentas */
export function cacheKey(key: string, userId?: string): string {
  return userId ? `${userId}:${key}` : key;
}

export function getCached<T>(key: string): T | null {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    delete cache[key];
    return null;
  }
  return entry.data as T;
}

export function setCached(key: string, data: any, ttl = DEFAULT_TTL): void {
  cache[key] = { data, timestamp: Date.now(), ttl };
}

export function invalidateCache(key?: string): void {
  if (key) {
    delete cache[key];
  } else {
    // Limpia TODO el cache — usar al hacer signOut
    Object.keys(cache).forEach(k => delete cache[k]);
  }
}

/** Invalida todas las claves que pertenecen a un usuario */
export function invalidateUserCache(userId: string): void {
  Object.keys(cache)
    .filter(k => k.startsWith(`${userId}:`))
    .forEach(k => delete cache[k]);
}
