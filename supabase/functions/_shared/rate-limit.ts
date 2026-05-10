// supabase/functions/_shared/rate-limit.ts
//
// Helpers de rate limiting para Edge Functions de VYLTA.
//
// Diseño:
//   - Cada "regla" define una ventana de tiempo (minuto/hora/día) y un límite.
//   - La key incluye dimensión + identificador + ventana.
//     Ejemplo: "ip:1.2.3.4:minute:2026-05-10T20:30"
//   - El contador se incrementa atómicamente vía RPC `increment_rate_limit`
//     (INSERT ON CONFLICT DO UPDATE en PostgreSQL).
//   - Si el contador supera el límite → bloquear.
//
// Filosofía:
//   - Fail-open: si la DB falla, se permite la request (la app no muere por
//     un problema de rate limiter). Pero se loggea para alertar.
//   - El rate limiter es defensa en profundidad, no autenticación. No
//     protege en sí, solo reduce el daño de un atacante.
//
// Uso típico:
//   const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
//   const result = await checkRateLimits(supabase, [
//     { dimension: 'ip',    identifier: clientIp, window: 'minute', limit: 5  },
//     { dimension: 'ip',    identifier: clientIp, window: 'hour',   limit: 20 },
//     { dimension: 'slug',  identifier: slug,     window: 'hour',   limit: 30 },
//     { dimension: 'phone', identifier: phone,    window: 'day',    limit: 3  },
//   ]);
//
//   if (!result.allowed) {
//     return new Response(JSON.stringify({
//       error: result.message,
//       code: 'RATE_LIMITED',
//       retryAfter: result.retryAfterSeconds,
//     }), {
//       status: 429,
//       headers: { ...cors, 'Content-Type': 'application/json',
//                  'Retry-After': String(result.retryAfterSeconds) },
//     });
//   }

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type RateLimitWindow = 'minute' | 'hour' | 'day';
export type RateLimitDimension = 'ip' | 'slug' | 'phone' | 'user' | 'custom';

export interface RateLimitRule {
  dimension:  RateLimitDimension;
  identifier: string;
  window:     RateLimitWindow;
  limit:      number;
}

export interface RateLimitResult {
  allowed:           boolean;
  message?:          string;
  retryAfterSeconds: number;
  exceededRule?:     RateLimitRule;
}

// ── Helpers internos ────────────────────────────────────────────────

/**
 * Calcula el inicio de la ventana de tiempo (truncado al minuto/hora/día).
 * Todas las requests dentro de la misma ventana caen en el mismo "bucket".
 */
function windowStart(window: RateLimitWindow, now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCSeconds(0, 0);
  if (window === 'minute') return d;
  d.setUTCMinutes(0);
  if (window === 'hour') return d;
  d.setUTCHours(0);
  return d; // day
}

/**
 * Segundos hasta el final de la ventana actual.
 * Útil para devolver header Retry-After al cliente.
 */
function secondsUntilWindowEnds(window: RateLimitWindow, now: Date = new Date()): number {
  const start = windowStart(window, now);
  const ms = {
    minute: 60_000,
    hour:   3_600_000,
    day:    86_400_000,
  }[window];
  return Math.ceil((start.getTime() + ms - now.getTime()) / 1000);
}

/**
 * Construye la key única para esta ventana de tiempo.
 * Formato: "<dimension>:<identifier>:<window>:<ISO truncado>"
 * Sanitiza el identifier para evitar caracteres problemáticos.
 */
function buildKey(rule: RateLimitRule, now: Date = new Date()): string {
  const start = windowStart(rule.window, now);
  const safeIdentifier = rule.identifier
    .replace(/[^a-zA-Z0-9.+\-_]/g, '_')
    .slice(0, 100); // máximo 100 chars
  return `${rule.dimension}:${safeIdentifier}:${rule.window}:${start.toISOString()}`;
}

/**
 * Construye un mensaje amigable y específico (sin revelar detalles internos).
 */
function buildUserMessage(rule: RateLimitRule, retryAfter: number): string {
  const minutes = Math.ceil(retryAfter / 60);
  const timeStr = retryAfter < 90
    ? `${retryAfter} segundos`
    : minutes < 60
      ? `${minutes} minutos`
      : `${Math.ceil(minutes / 60)} horas`;

  switch (rule.dimension) {
    case 'ip':
      return `Has hecho demasiados intentos en poco tiempo. Por favor espera ${timeStr} antes de intentarlo de nuevo.`;
    case 'slug':
      return `Este negocio está recibiendo muchas reservas en este momento. Por favor intenta en ${timeStr}.`;
    case 'phone':
      return `Este teléfono ya hizo varias reservas hoy. Si necesitas más, contacta al negocio directamente.`;
    default:
      return `Demasiados intentos. Por favor espera ${timeStr} antes de intentarlo de nuevo.`;
  }
}

// ── Función pública principal ───────────────────────────────────────

/**
 * Verifica todas las reglas de rate limit incrementando atomicamente
 * los contadores. Si CUALQUIER regla se excede → bloquea.
 *
 * Si una regla tiene identifier vacío o "anon", se omite (útil para
 * casos donde el phone no se conoce aún).
 */
export async function checkRateLimits(
  supabase: SupabaseClient,
  rules: RateLimitRule[],
): Promise<RateLimitResult> {
  const now = new Date();

  // Filtrar reglas con identificador inválido
  const validRules = rules.filter(r =>
    r.identifier && r.identifier !== 'anon' && r.identifier !== 'unknown' && r.identifier.length > 0
  );

  for (const rule of validRules) {
    const key = buildKey(rule, now);
    const windowStartIso = windowStart(rule.window, now).toISOString();

    try {
      const { data, error } = await supabase.rpc('increment_rate_limit', {
        p_key: key,
        p_window_start: windowStartIso,
      });

      if (error) {
        // Fail-open: nunca bloqueamos por error del rate limiter.
        console.error('[rate-limit] RPC error, failing open:', error.message, 'rule:', rule);
        continue;
      }

      const currentCount: number = typeof data === 'number' ? data : 1;

      if (currentCount > rule.limit) {
        const retryAfter = secondsUntilWindowEnds(rule.window, now);
        console.warn(`[rate-limit] BLOCKED: ${key} count=${currentCount} limit=${rule.limit}`);
        return {
          allowed: false,
          message: buildUserMessage(rule, retryAfter),
          retryAfterSeconds: retryAfter,
          exceededRule: rule,
        };
      }
    } catch (e: any) {
      // Fail-open en cualquier excepción inesperada.
      console.error('[rate-limit] unexpected error, failing open:', e?.message);
      continue;
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Extrae la IP del cliente del request. Maneja varios casos:
 *   - Header x-forwarded-for (puede tener múltiples IPs separadas por coma)
 *   - Header x-real-ip
 *   - Fallback a "unknown" si no se puede determinar.
 *
 * Supabase Edge Functions pasan estos headers automáticamente
 * desde su proxy frontal.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    // El primer IP en x-forwarded-for es el cliente original
    const first = xff.split(',')[0].trim();
    if (first) return first;
  }

  const xri = req.headers.get('x-real-ip');
  if (xri) return xri.trim();

  return 'unknown';
}
