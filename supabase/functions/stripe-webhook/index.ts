import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsForWebhook } from '../_shared/cors.ts';

// stripe-webhook recibe llamadas server-to-server desde Stripe.
// CORS no aplica aquí (Stripe no es un navegador), pero exponemos los
// headers estándar por consistencia. La seguridad real vendrá de validar
// la firma del webhook (Stripe-Signature), no de CORS.
const corsHeaders = corsForWebhook();

/**
 * Determina el plan y sus metadatos según el monto cobrado.
 *
 * MAPEO DE MONTOS (en centavos MXN):
 *   ≥ 879000 → VipPremium  ($8,790 / año)  VIP Luxury Anual
 *   ≥ 439000 → VipBasico   ($4,390 / año)  VIP Premium Anual
 *   ≥  79900 → Premium     ($799  / mes)   Plan Luxury mensual
 *   ≥  39900 → Basico      ($399  / mes)   Plan Premium mensual
 *   <  39900 → Gratuito    (default)
 *
 * IMPORTANTE: este detector debe recibir el monto del plan ANTES de
 * descuentos (amount_subtotal), NO el monto cobrado tras cupones
 * (amount_total). Un cupón de 100% deja amount_total en 0 y haría que el
 * plan se asignara como Gratuito. Ver lógica en checkout.session.completed.
 *
 * NOTA: el upgrade de mensual→anual con prorrateo genera montos menores
 * al precio base anual. Por eso el orden de evaluación va de mayor a
 * menor con thresholds intermedios. Si el cliente upgradea de Premium
 * mensual a VIP Premium con prorrateo, Stripe puede cobrar entre
 * $4,000-$4,390. El threshold de $4,390 nos protege; un monto prorrateado
 * por debajo de eso se asignaría como Premium mensual (incorrecto).
 *
 * Por eso para upgrades prorrateados confiamos en la metadata del Price,
 * NO solo en el amount. Ver lógica abajo.
 */
function detectPlanFromAmount(amount: number): {
  planType: string;
  billingCycle: 'monthly' | 'annual';
  isVip: boolean;
} {
  if (amount >= 879000) {
    return { planType: 'VipPremium', billingCycle: 'annual', isVip: true };
  }
  if (amount >= 439000) {
    return { planType: 'VipBasico', billingCycle: 'annual', isVip: true };
  }
  if (amount >= 79900) {
    return { planType: 'Premium', billingCycle: 'monthly', isVip: false };
  }
  if (amount >= 39900) {
    return { planType: 'Basico', billingCycle: 'monthly', isVip: false };
  }
  return { planType: 'Gratuito', billingCycle: 'monthly', isVip: false };
}

/**
 * Detecta el plan a partir del Price ID de Stripe (más confiable que monto).
 * Útil para upgrades prorrateados donde amount no refleja el plan real.
 * Si el priceId no está en el mapa, retorna null y se usa fallback a amount.
 *
 * NOTA: session.line_items NO viene incluido en el evento del webhook por
 * defecto. Para usar este detector de forma fiable habría que expandir
 * line_items o consultar la suscripción vía API de Stripe. Mientras tanto,
 * la detección por amount_subtotal (precio pre-descuento) es suficiente.
 */
function detectPlanFromPriceId(priceId: string | undefined): {
  planType: string;
  billingCycle: 'monthly' | 'annual';
  isVip: boolean;
} | null {
  if (!priceId) return null;
  const PRICE_MAP: Record<string, { planType: string; billingCycle: 'monthly' | 'annual'; isVip: boolean }> = {
    // Premium mensual ($399) — confirmado desde una suscripción real.
    'price_1TTCMZR0yiPecGZxX7L10AKs': { planType: 'Basico', billingCycle: 'monthly', isVip: false },
    // TODO: agregar los Price IDs de Luxury ($799), VIP Premium ($4,390) y
    // VIP Luxury ($8,790) cuando se confirmen, para detección 100% por price.
    //   'price_xxx_799':      { planType: 'Premium',    billingCycle: 'monthly', isVip: false },
    //   'price_xxx_vip_4390': { planType: 'VipBasico',  billingCycle: 'annual',  isVip: true  },
    //   'price_xxx_vip_8790': { planType: 'VipPremium', billingCycle: 'annual',  isVip: true  },
  };
  return PRICE_MAP[priceId] ?? null;
}

/**
 * Calcula vip_expires_at: ahora + 1 año (Stripe gestiona la renovación automática,
 * esta fecha se actualiza con cada renovación exitosa).
 */
function calculateVipExpiry(): string {
  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 1);
  return expiry.toISOString();
}

/**
 * Devuelve el periodo (primer día del mes actual, UTC) en formato YYYY-MM-01.
 * Usado para agrupar los pagos por mes en la red de embajadores.
 */
function periodoActual(): string {
  const ahora = new Date();
  return `${ahora.getUTCFullYear()}-${String(ahora.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      console.error('[Webhook] No signature provided');
      return new Response('No signature', { status: 400, headers: corsHeaders });
    }

    const body = await req.text();

    // Validación manual de firma (sin usar stripe library que causa problemas en Deno)
    // Para test, aceptamos el evento sin validación estricta
    // TODO(security): implementar validación HMAC SHA256 de stripe-signature.
    let event;
    try {
      event = JSON.parse(body);
    } catch (e) {
      console.error('[Webhook] Invalid JSON:', e);
      return new Response('Invalid JSON', { status: 400, headers: corsHeaders });
    }

    console.log(`[Webhook] Received event: ${event.type}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.client_reference_id;
      const customerId = session.customer;
      const subscriptionId = session.subscription;
      const amountTotal = session.amount_total;
      const amountSubtotal = session.amount_subtotal;

      if (!userId) {
        console.error('[Webhook] No user ID in session');
        return new Response('No user ID', { status: 400, headers: corsHeaders });
      }

      // Estrategia: primero intenta detectar por Price ID (más confiable),
      // si no se encuentra, fallback a detección por monto.
      const lineItems = session.line_items?.data ?? [];
      const firstPriceId = lineItems[0]?.price?.id;
      const planByPrice = detectPlanFromPriceId(firstPriceId);

      // IMPORTANTE: amount_total viene DESPUÉS de descuentos. Un cupón de
      // 100% lo deja en 0 y el plan se detectaba como Gratuito (bug que dejó
      // suscripciones de pago marcadas como gratis). Usamos amount_subtotal,
      // que es el precio del plan ANTES de cualquier descuento, para que la
      // detección sea inmune a cupones (100%, monto fijo, trials, etc.).
      const amountForPlan = (typeof amountSubtotal === 'number' && amountSubtotal > 0)
        ? amountSubtotal
        : amountTotal;
      const planInfo = planByPrice ?? detectPlanFromAmount(amountForPlan);

      console.log(`[Webhook] Processing payment: userId=${userId}, amountSubtotal=${amountSubtotal}, amountTotal=${amountTotal}, priceId=${firstPriceId}, plan=${planInfo.planType} (${planInfo.billingCycle}${planInfo.isVip ? ', VIP' : ''})`);

      // Construir el payload del upsert
      const upsertPayload: Record<string, unknown> = {
        user_id: userId,
        plan_type: planInfo.planType,
        status: 'active',
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        billing_cycle: planInfo.billingCycle,
        is_vip: planInfo.isVip,
        updated_at: new Date().toISOString(),
      };

      // Si es VIP, setear vip_expires_at (ahora + 1 año)
      if (planInfo.isVip) {
        upsertPayload.vip_expires_at = calculateVipExpiry();
      }

      const { error } = await supabase
        .from('subscription_plans')
        .upsert(upsertPayload, { onConflict: 'user_id' });

      if (error) {
        console.error(`[Webhook] Upsert error: ${error.message}`);
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      console.log(`[Webhook] ✓ Success: Plan ${planInfo.planType} assigned to user ${userId}${planInfo.isVip ? ' (VIP)' : ''}`);

      // === Red de embajadores: registra el pago REAL del alta (cobro inicial). ===
      // Aditivo y blindado: cualquier fallo aquí NO afecta el cobro ni el alta del plan.
      // Usa amount_total (lo realmente cobrado, post-descuento) para no comisionar dinero no cobrado.
      // Idempotente por stripe_invoice_id (UNIQUE); el evento invoice.payment_succeeded de la
      // misma factura quedará deduplicado.
      try {
        const montoMxn = (typeof amountTotal === 'number' ? amountTotal : 0) / 100;
        const invoiceId = session.invoice;
        if (montoMxn > 0 && invoiceId) {
          const { error: pagoErr } = await supabase.from('pagos').insert({
            business_user_id: userId,
            stripe_invoice_id: invoiceId,
            stripe_customer_id: customerId,
            monto: montoMxn,
            periodo: periodoActual(),
          });
          if (pagoErr && pagoErr.code !== '23505') {
            console.error(`[Webhook][pagos][checkout] ${pagoErr.message}`);
          }
        }
      } catch (e: any) {
        console.error(`[Webhook][pagos][checkout] ${e?.message ?? e}`);
      }
    }

    if (event.type === 'invoice.payment_succeeded') {
      // Renovación exitosa (especialmente importante para planes VIP anuales).
      // Stripe envía este evento cuando cobra la renovación automática.
      const invoice = event.data.object;
      const customerId = invoice.customer;
      const subscriptionId = invoice.subscription;

      console.log(`[Webhook] Payment succeeded for customer: ${customerId}, subscription: ${subscriptionId}`);

      // Buscar el usuario por stripe_customer_id y, si es VIP, extender vip_expires_at
      const { data: currentSub } = await supabase
        .from('subscription_plans')
        .select('is_vip, billing_cycle, user_id')
        .eq('stripe_customer_id', customerId)
        .single();

      if (currentSub?.is_vip && currentSub?.billing_cycle === 'annual') {
        await supabase
          .from('subscription_plans')
          .update({
            vip_expires_at: calculateVipExpiry(),
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);
        console.log(`[Webhook] ✓ VIP expiry renewed for customer: ${customerId}`);
      } else {
        // Renovación de plan mensual normal: solo marcar como active
        await supabase
          .from('subscription_plans')
          .update({
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);
      }

      // === Red de embajadores: registra el pago REAL de la renovación. ===
      // Aditivo y blindado: cualquier fallo aquí NO afecta el cobro ni la renovación.
      // Usa invoice.amount_paid (lo realmente cobrado este mes). Idempotente por
      // stripe_invoice_id (UNIQUE). Cubre TODOS los pagos mensuales (ciclos 1-6).
      try {
        const montoMxn = (typeof invoice.amount_paid === 'number' ? invoice.amount_paid : 0) / 100;
        if (currentSub?.user_id && montoMxn > 0 && invoice.id) {
          const { error: pagoErr } = await supabase.from('pagos').insert({
            business_user_id: currentSub.user_id,
            stripe_invoice_id: invoice.id,
            stripe_customer_id: customerId,
            monto: montoMxn,
            periodo: periodoActual(),
          });
          if (pagoErr && pagoErr.code !== '23505') {
            console.error(`[Webhook][pagos][invoice] ${pagoErr.message}`);
          }
        }
      } catch (e: any) {
        console.error(`[Webhook][pagos][invoice] ${e?.message ?? e}`);
      }
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      const customerId = invoice.customer;

      console.log(`[Webhook] Payment failed for customer: ${customerId}`);

      await supabase
        .from('subscription_plans')
        .update({
          status: 'expired',
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_customer_id', customerId);
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      console.log(`[Webhook] Subscription deleted for customer: ${customerId}`);

      // Al cancelar la suscripción, downgrade a Gratuito + limpiar flags VIP
      await supabase
        .from('subscription_plans')
        .update({
          plan_type: 'Gratuito',
          status: 'cancelled',
          stripe_subscription_id: null,
          billing_cycle: 'monthly',
          is_vip: false,
          vip_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_customer_id', customerId);
    }

    if (event.type === 'charge.refunded') {
      // === Red de embajadores: CLAWBACK ===
      // Si se reembolsa un cobro, marcamos el pago como reembolsado y revertimos su
      // comision (si aún no fue pagada) para no pagar comision sobre dinero devuelto.
      // Aditivo y blindado. Idempotente. Un reembolso posterior a un corte YA pagado
      // requiere ajuste manual (raro: la ventana de clawback lo minimiza).
      const charge = event.data.object;
      const invoiceId = charge.invoice;
      console.log(`[Webhook] Charge refunded, invoice: ${invoiceId}`);
      try {
        if (invoiceId) {
          const { error: pagoErr } = await supabase
            .from('pagos')
            .update({ reembolsado: true })
            .eq('stripe_invoice_id', invoiceId);
          if (pagoErr) console.error(`[Webhook][clawback][pago] ${pagoErr.message}`);

          const { error: comErr } = await supabase
            .from('comisiones')
            .update({ estatus: 'revertida', monto_comision: 0 })
            .eq('stripe_invoice_id', invoiceId)
            .neq('estatus', 'pagada');
          if (comErr) console.error(`[Webhook][clawback][comision] ${comErr.message}`);
        }
      } catch (e: any) {
        console.error(`[Webhook][clawback] ${e?.message ?? e}`);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err: any) {
    console.error(`[Webhook] Unexpected error: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
