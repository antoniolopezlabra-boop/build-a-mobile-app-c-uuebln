// ══════════════════════════════════════════════════════════════════════
// confirm-prepaid-booking — Confirma la cita DESPUÉS de cobrar (público)
//
// Se llama cuando Stripe confirmó el pago en el navegador del cliente.
// NUNCA confía en el navegador: vuelve a consultar el PaymentIntent con
// la API de Stripe y solo continúa si está realmente `succeeded` y el
// monto coincide con el hold.
//
// Luego crea la cita reutilizando `create-booking-request` (con la llave
// interna) para no duplicar la lógica de límites de plan, WhatsApp y push.
//
// IDEMPOTENTE: si el cliente recarga la página, no se crean citas dobles.
// ══════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const { holdId, paymentIntentId } = await req.json();
    if (!holdId || !paymentIntentId) return json({ error: 'Faltan datos del pago' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: hold } = await supabase
      .from('booking_holds')
      .select('*')
      .eq('id', holdId)
      .single();
    if (!hold) return json({ error: 'Reserva no encontrada' }, 404);
    if (hold.payment_intent_id !== paymentIntentId) return json({ error: 'Pago no corresponde a esta reserva' }, 400);

    // Idempotencia: ya se procesó → devolvemos la cita existente.
    if (hold.status === 'paid' && hold.appointment_id) {
      return json({ ok: true, alreadyConfirmed: true, appointmentId: hold.appointment_id });
    }

    // ── Verificar el pago DIRECTO con Stripe ──
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;
    const piRes = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
      headers: { 'Authorization': `Bearer ${stripeKey}`, 'Stripe-Version': '2024-06-20' },
    });
    const pi = await piRes.json();
    if (!piRes.ok) return json({ error: 'No se pudo verificar el pago' }, 502);

    if (pi.status !== 'succeeded') {
      return json({ error: 'El pago aún no se ha completado', code: 'NOT_PAID', stripeStatus: pi.status }, 402);
    }
    if (Number(pi.amount_received) < Number(hold.amount_prepay)) {
      return json({ error: 'El monto pagado no coincide', code: 'AMOUNT_MISMATCH' }, 400);
    }

    // ── Crear la cita reutilizando el flujo normal ──
    const internalKey = Deno.env.get('VYLTA_INTERNAL_KEY') ?? '';
    const bookRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/create-booking-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'x-vylta-internal-key': internalKey,
      },
      body: JSON.stringify({ ...hold.payload, prepaid: true }),
    });
    const booking = await bookRes.json();

    if (!bookRes.ok || booking?.error) {
      // El cliente YA pagó: no lo dejamos sin nada. Registramos el cobro y
      // avisamos para resolución manual (el dueño puede reembolsar o agendar).
      console.error('[confirm-prepaid-booking] cita falló tras cobro:', booking?.error);
      await supabase.from('prepayments').insert({
        user_id: hold.user_id,
        client_name: hold.client_name,
        client_phone: hold.client_phone,
        amount_total: hold.amount_total,
        amount_prepay: hold.amount_prepay,
        platform_fee: hold.platform_fee,
        payment_intent_id: paymentIntentId,
        receipt_url: pi.charges?.data?.[0]?.receipt_url ?? null,
        status: 'succeeded',
      });
      await supabase.from('booking_holds').update({ status: 'paid' }).eq('id', holdId);
      return json({
        error: 'Tu pago se realizó, pero no pudimos agendar automáticamente. El negocio se pondrá en contacto contigo.',
        code: 'PAID_BUT_NOT_BOOKED',
      }, 409);
    }

    const appointmentId = booking?.appointment?.id ?? booking?.id ?? null;

    await supabase.from('booking_holds')
      .update({ status: 'paid', appointment_id: appointmentId })
      .eq('id', holdId);

    await supabase.from('prepayments').insert({
      user_id: hold.user_id,
      appointment_id: appointmentId,
      client_name: hold.client_name,
      client_phone: hold.client_phone,
      amount_total: hold.amount_total,
      amount_prepay: hold.amount_prepay,
      platform_fee: hold.platform_fee,
      payment_intent_id: paymentIntentId,
      receipt_url: pi.charges?.data?.[0]?.receipt_url ?? null,
      status: 'succeeded',
    });

    return json({
      ok: true,
      appointmentId,
      amountPaid: Number(hold.amount_prepay) / 100,
      receiptUrl: pi.charges?.data?.[0]?.receipt_url ?? null,
      booking,
    });
  } catch (e: any) {
    console.error('[confirm-prepaid-booking]', e?.message ?? e);
    return json({ error: e?.message ?? 'Error inesperado' }, 500);
  }
});
