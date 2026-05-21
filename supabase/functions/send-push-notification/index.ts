// @ts-nocheck
// Edge Function: send-push-notification
// ═══════════════════════════════════════════════════════════════════════
// VYLTA — Función reusable para enviar push notifications via Expo
// (May 19 2026)
//
// USO:
//   Esta función se llama desde:
//     1. create-booking-request → cuando un cliente externo agenda cita
//     2. Workflow #4 de n8n → recordatorio 10 min antes de la cita
//
// REQUEST (POST):
//   {
//     userId: "uuid-del-dueño",
//     title: "📅 Nueva cita",
//     body: "María - Corte de cabello a las 14:00",
//     data: {                          // opcional, payload custom
//       appointmentId: "uuid-cita",
//       type: "new_appointment" | "reminder"
//     }
//   }
//
// RESPONSE:
//   {
//     success: true,
//     sent: 2,                          // número de pushes enviados
//     tokens_found: 2,                  // tokens del usuario en BD
//     expo_results: [...]               // respuesta de Expo Push API
//   }
//
// AUTH:
//   Esta función NO requiere JWT del usuario porque se llama desde otras
//   Edge Functions y desde n8n (con service role). Para impedir abuso
//   externo, validamos un secret en header `x-vylta-internal-key`.
//
// DEPLOY:
//   npx supabase functions deploy send-push-notification \
//     --no-verify-jwt \
//     --project-ref nhjmwmkaduiaifgztymi
//
// SECRET REQUERIDO (configurar en Supabase Dashboard → Edge Functions):
//   VYLTA_INTERNAL_KEY = (cualquier string aleatorio, ej. uuid v4)
// ═══════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushRequest {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound: 'default';
  priority: 'high';
  channelId: 'default';
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-vylta-internal-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 1. Validar secret interno (anti-abuso)
    const internalKey = req.headers.get('x-vylta-internal-key');
    const expectedKey = Deno.env.get('VYLTA_INTERNAL_KEY');

    if (!expectedKey) {
      console.error('[send-push] VYLTA_INTERNAL_KEY no configurado en env');
      return new Response(
        JSON.stringify({ error: 'Server misconfigured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (internalKey !== expectedKey) {
      console.warn('[send-push] Intento con internal key inválido');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Parsear request
    const body = (await req.json()) as PushRequest;
    const { userId, title, body: messageBody, data = {} } = body;

    if (!userId || !title || !messageBody) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields',
          required: ['userId', 'title', 'body'],
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Crear cliente Supabase con service role (bypasa RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 4. Buscar tokens del usuario
    const { data: tokens, error: tokensError } = await supabase
      .from('notification_tokens')
      .select('expo_push_token, platform')
      .eq('user_id', userId);

    if (tokensError) {
      console.error('[send-push] Error obteniendo tokens:', tokensError);
      return new Response(
        JSON.stringify({ error: 'Error fetching tokens', details: tokensError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tokens || tokens.length === 0) {
      console.log(`[send-push] Usuario ${userId} no tiene tokens registrados`);
      return new Response(
        JSON.stringify({
          success: true,
          sent: 0,
          tokens_found: 0,
          message: 'No tokens for this user',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Construir mensajes (uno por token)
    const messages: ExpoPushMessage[] = tokens.map(t => ({
      to: t.expo_push_token,
      title,
      body: messageBody,
      data,
      sound: 'default',
      priority: 'high',
      channelId: 'default',
    }));

    // 6. Enviar a Expo Push API
    let expoResponse: any = null;
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });
      expoResponse = await res.json();

      if (!res.ok) {
        console.error('[send-push] Expo respondió con error:', expoResponse);
      }
    } catch (e) {
      console.error('[send-push] Error llamando a Expo Push:', e);
      return new Response(
        JSON.stringify({
          error: 'Error sending to Expo',
          details: e instanceof Error ? e.message : String(e),
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7. Respuesta final
    return new Response(
      JSON.stringify({
        success: true,
        sent: messages.length,
        tokens_found: tokens.length,
        expo_results: expoResponse,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('[send-push] Error inesperado:', e);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: e instanceof Error ? e.message : String(e),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
