// ══════════════════════════════════════════════════════════════════════
// booking-prepay — Inicia el cobro anticipado de una cita (público)
//
// Lo llama el link de reservas (book.vylta.lat) ANTES de crear la cita:
//   1. Verifica si el negocio exige anticipo (y si aplica a este cliente).
//   2. Valida que el horario siga libre.
//   3. RESERVA el horario 10 minutos (booking_holds) mientras el cliente paga.
//   4. Crea un PaymentIntent en Stripe con destino la cuenta Connect del
//      negocio (el dinero le llega DIRECTO) y la comisión de plataforma.
//
// SEGURIDAD — el precio NUNCA se toma del navegador: se lee de la tabla
// `services` con el service role. Si no, cualquiera podría pagar $1 por un
// servicio de $500 manipulando el request.
// ══════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimits, getClientIp } from '../_shared/rate-limit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Comisión de VYLTA sobre el anticipo. Configurable sin tocar código:
// secret VYLTA_PLATFORM_FEE_PCT (ej. "1" = 1%). Default 1%.
const DEFAULT_FEE_PCT = 1;
const HOLD_MINUTES = 10;

async function stripe(path: string, key: string, body?: Record<string, string>, method = 'POST') {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Stripe ${res.status}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const {
      slug, clientName, clientPhone, services, serviceName,
      date, startTime, endTime, staff_id, notes,
    } = await req.json();

    if (!slug || !clientName || !clientPhone || !date || !startTime || !endTime) {
      return json({ error: 'Faltan campos requeridos' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const phoneDigits = String(clientPhone).replace(/\D/g, '');
    const rate = await checkRateLimits(supabase, [
      { dimension: 'ip',   identifier: getClientIp(req), window: 'minute', limit: 5 },
      { dimension: 'ip',   identifier: getClientIp(req), window: 'hour',   limit: 20 },
      { dimension: 'slug', identifier: slug,             window: 'hour',   limit: 30 },
    ]);
    if (!rate.allowed) return json({ error: rate.message, code: 'RATE_LIMITED' }, 429);

    // ── Negocio dueño del link ──
    const { data: link } = await supabase
      .from('booking_links')
      .select('id, user_id, is_active')
      .eq('slug', slug)
      .single();
    if (!link || !link.is_active) return json({ error: 'Link no disponible' }, 404);

    // ── ¿Aplica cobro anticipado? ──
    const { data: bp } = await supabase
      .from('business_profiles')
      .select('prepay_enabled, prepay_percent, prepay_scope, stripe_connect_id, stripe_connect_status, business_name')
      .eq('user_id', link.user_id)
      .single();

    const prepayOn = !!bp?.prepay_enabled
      && bp?.stripe_connect_status === 'active'
      && !!bp?.stripe_connect_id;

    if (!prepayOn) return json({ requiresPayment: false });

    // scope 'first' → solo cobra si es cliente nuevo
    if (bp!.prepay_scope === 'first') {
      const { data: isFirst } = await supabase.rpc('is_first_visit_public', {
        p_user_id: link.user_id,
        p_phone: clientPhone,
      });
      if (isFirst === false) return json({ requiresPayment: false });
    }

    // ── Precio REAL desde la BD (nunca del cliente) ──
    let totalMxn = 0;
    const ids = Array.isArray(services)
      ? services.map((s: any) => s?.serviceId).filter(Boolean)
      : [];

    if (ids.length > 0) {
      const { data: svcRows } = await supabase
        .from('services')
        .select('id, price')
        .eq('user_id', link.user_id)
        .in('id', ids);
      // Si algún id no pertenece al negocio, simplemente no suma.
      totalMxn = (svcRows ?? []).reduce((sum, r: any) => sum + (Number(r.price) || 0), 0);
    }

    if (totalMxn <= 0) {
      // Sin precio confiable no cobramos: la cita sigue el flujo normal.
      return json({ requiresPayment: false, reason: 'NO_PRICE' });
    }

    const pct = bp!.prepay_percent ?? 50;
    const amountTotalCents  = Math.round(totalMxn * 100);
    const amountPrepayCents = Math.round(amountTotalCents * (pct / 100));

    // Stripe MX exige mínimo 10 MXN por cargo con tarjeta.
    if (amountPrepayCents < 1000) {
      return json({ requiresPayment: false, reason: 'BELOW_MINIMUM' });
    }

    // ── Horario libre (cita real u otro hold vigente) ──
    const { data: clash } = await supabase
      .from('appointments')
      .select('id')
      .eq('user_id', link.user_id)
      .eq('date', date)
      .eq('start_time', startTime)
      .not('status', 'in', '("Cancelada","No asistió","Rechazada")')
      .limit(1);
    if (clash && clash.length > 0) {
      return json({ error: 'Ese horario acaba de ser reservado. Elige otro.', code: 'SLOT_TAKEN' }, 409);
    }

    await supabase.rpc('expire_booking_holds'); // limpia vencidos antes de revisar
    const { data: heldByOther } = await supabase
      .from('booking_holds')
      .select('id')
      .eq('user_id', link.user_id)
      .eq('date', date)
      .eq('start_time', startTime)
      .eq('status', 'pending')
      .limit(1);
    if (heldByOther && heldByOther.length > 0) {
      return json({ error: 'Alguien está reservando ese horario en este momento. Elige otro.', code: 'SLOT_HELD' }, 409);
    }

    // ── Comisión de plataforma ──
    const feePct = Number(Deno.env.get('VYLTA_PLATFORM_FEE_PCT') ?? DEFAULT_FEE_PCT);
    const feeCents = Math.max(0, Math.round(amountPrepayCents * (feePct / 100)));

    // ── Reserva temporal del horario ──
    const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString();
    const { data: hold, error: holdErr } = await supabase
      .from('booking_holds')
      .insert({
        user_id: link.user_id,
        booking_link_id: link.id,
        date, start_time: startTime, end_time: endTime,
        staff_id: staff_id || null,
        client_name: String(clientName).trim(),
        client_phone: String(clientPhone).trim(),
        payload: { slug, clientName, clientPhone, serviceName, services, date, startTime, endTime, staff_id, notes, serviceCost: totalMxn },
        amount_total: amountTotalCents,
        amount_prepay: amountPrepayCents,
        platform_fee: feeCents,
        expires_at: expiresAt,
      })
      .select('id')
      .single();
    if (holdErr) throw new Error(holdErr.message);

    // ── PaymentIntent: el dinero va DIRECTO al negocio ──
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;
    const pi = await stripe('/payment_intents', stripeKey, {
      amount: String(amountPrepayCents),
      currency: 'mxn',
      'automatic_payment_methods[enabled]': 'true',
      description: `Anticipo ${pct}% — ${serviceName ?? 'Servicio'} — ${bp!.business_name ?? ''}`.slice(0, 200),
      'transfer_data[destination]': bp!.stripe_connect_id!,
      ...(feeCents > 0 ? { application_fee_amount: String(feeCents) } : {}),
      'metadata[hold_id]': hold.id,
      'metadata[vylta_user_id]': link.user_id,
      'metadata[client_phone]': phoneDigits,
    });

    await supabase.from('booking_holds')
      .update({ payment_intent_id: pi.id })
      .eq('id', hold.id);

    return json({
      requiresPayment: true,
      holdId: hold.id,
      clientSecret: pi.client_secret,
      publishableKey: Deno.env.get('STRIPE_PUBLISHABLE_KEY') ?? '',
      amountPrepay: amountPrepayCents / 100,
      amountTotal: amountTotalCents / 100,
      percent: pct,
      expiresAt,
      holdMinutes: HOLD_MINUTES,
    });
  } catch (e: any) {
    console.error('[booking-prepay]', e?.message ?? e);
    return json({ error: e?.message ?? 'Error inesperado' }, 500);
  }
});
