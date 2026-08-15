// supabase/functions/_shared/cors.ts
//
// Helpers de CORS centralizados para todas las Edge Functions de VYLTA.
//
// Hay 3 tipos de "callers" en VYLTA:
//
//   1. Web pública  → book.vylta.lat (booking page), vylta.lat (landing)
//                     y app.vylta.lat (CRM Web Next.js).
//                     Envían header `Origin` desde el navegador.
//                     → usar corsForWeb()
//
//   2. App móvil    → React Native / Expo en Android e iOS.
//                     NO envían header `Origin` (los nativos no están sujetos a CORS).
//                     → usar corsForApp()
//
//   3. Webhooks     → Stripe llama de servidor a servidor.
//                     CORS no aplica.
//                     → usar corsForWebhook()
//
// Reglas importantes:
//   - NUNCA usar 'Access-Control-Allow-Origin: *' en producción.
//   - Si el origin no está permitido, la respuesta NO incluye el header
//     Allow-Origin, y el navegador bloquea la petición automáticamente.
//   - El backend igual puede procesar la petición; CORS solo lo aplica el
//     navegador. Para protección real, usar JWT/service role + RLS.
//
// ── HISTORIAL ──────────────────────────────────────────────────────────
// May 21 2026: agregado https://app.vylta.lat al whitelist porque el CRM
//   Web ahora consume Edge Functions (Chat IA, send-campaign). Sin esto,
//   el navegador bloquea las respuestas y aparece error "No se pudo
//   conectar con el asistente" en el cliente.
// ──────────────────────────────────────────────────────────────────────

// ── Whitelists por tipo ──────────────────────────────────────────────

const WEB_ALLOWED_ORIGINS = [
  'https://book.vylta.lat',
  'https://vylta.lat',
  'https://app.vylta.lat',   // CRM Web (Next.js) — agregado May 21 2026
  // Localhost para desarrollo local (booking, CRM, landing):
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
] as const;

// Common headers permitidos en todas las funciones (Authorization para JWT,
// apikey para anon key, content-type para JSON, x-client-info para Supabase JS).
const COMMON_ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type, x-vylta-internal-key';

// ── Helpers públicos ─────────────────────────────────────────────────

/**
 * CORS para Edge Functions llamadas desde web (booking page, landing, CRM).
 *
 * Si el origin del request está en la whitelist, devuelve los headers
 * con ese origin específico. Si no, devuelve headers sin Allow-Origin
 * (el navegador bloqueará la respuesta).
 *
 * Usage:
 *   const cors = corsForWeb(req);
 *   if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
 *   return new Response(JSON.stringify(data), { headers: { ...cors, 'Content-Type': 'application/json' } });
 */
export function corsForWeb(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const isAllowed = (WEB_ALLOWED_ORIGINS as readonly string[]).includes(origin);

  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': COMMON_ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400', // 24h cache del preflight
    'Vary': 'Origin', // CDNs cachean correctamente por origen
  };

  if (isAllowed) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

/**
 * CORS para Edge Functions llamadas desde app móvil nativa Y desde web
 * autorizada (CRM, booking, landing).
 *
 * Las apps nativas (React Native) no envían header Origin, así que no
 * disparan CORS preflight. Esta función:
 *   - Permite explícitamente requests sin Origin (app nativa).
 *   - Permite requests con Origin de cualquier sitio web autorizado en
 *     la whitelist WEB_ALLOWED_ORIGINS (CRM Web, booking, landing).
 *   - Bloquea requests con Origin de cualquier otro sitio web.
 *
 * Esto previene que un sitio web malicioso abierto en el navegador del
 * usuario llame a estos endpoints abusando del JWT del usuario.
 *
 * Usage: igual que corsForWeb().
 */
export function corsForApp(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');

  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': COMMON_ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };

  // Si no hay Origin (app nativa), permitir devolviendo Allow-Origin: null.
  // Algunos navegadores rechazan 'null', pero las apps nativas no validan
  // este header, así que sirve solo para que la respuesta tenga forma.
  // Si hay Origin y está en la whitelist web (CRM, booking, landing),
  // también permitir.
  if (!origin) {
    // App nativa: no añadir Allow-Origin específico.
    // El navegador no está involucrado.
  } else if ((WEB_ALLOWED_ORIGINS as readonly string[]).includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  // Si Origin existe y NO está en whitelist: no se añade Allow-Origin
  // → el navegador bloquea la respuesta.

  return headers;
}

/**
 * CORS para Edge Functions que solo reciben webhooks server-to-server
 * (ej. Stripe). CORS no aplica realmente; estos headers son "no-op"
 * pero los devolvemos por consistencia.
 *
 * La seguridad real de estos endpoints debe venir de verificar la firma
 * del webhook (Stripe-Signature, etc.), NO de CORS.
 */
export function corsForWebhook(): Record<string, string> {
  return {
    'Access-Control-Allow-Headers': COMMON_ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

/**
 * Helper para responder al preflight OPTIONS de forma uniforme.
 *
 * Usage:
 *   const cors = corsForWeb(req);
 *   const preflight = handleCorsPreflightRequest(req, cors);
 *   if (preflight) return preflight;
 */
export function handleCorsPreflightRequest(
  req: Request,
  corsHeaders: Record<string, string>,
): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}
