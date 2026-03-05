const cache: Record<string, { data: any; timestamp: number }> = {};
const TTL = 30000; // 30 segundos

export function getCached<T>(key: string): T | null {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL) {
    delete cache[key];
    return null;
  }
  return entry.data as T;
}

export function setCached(key: string, data: any): void {
  cache[key] = { data, timestamp: Date.now() };
}

export function invalidateCache(key?: string): void {
  if (key) {
    delete cache[key];
  } else {
    Object.keys(cache).forEach(k => delete cache[k]);
  }
}
