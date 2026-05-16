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
 * NOTA: el upgrade de mensual→anual con prorrateo genera montos menores
 * al precio base anual. Por eso el orden de evaluación va de mayor a
 * menor con thresholds intermedios. Si el cliente upgradea de Premium
 * mensual a VIP Premium con prorrateo, Stripe puede cobrar entre
 * $4,000-$4,390. El threshold de $4,390 nos protege; un monto prorrateado
 * por debajo de eso se asignaría como Premium mensual (incorrecto).
 *
 * Por eso para upgrades prorrateados confiamos en la metadata del Price,
 * NO solo en el amount_total. Ver lógica abajo.
 */
function detectPlanFromAmount(amountTotal: number): {
  planType: string;
  billingCycle: 'monthly' | 'annual';
  isVip: boolean;
} {
  if (amountTotal >= 879000) {
    return { planType: 'VipPremium', billingCycle: 'annual', isVip: true };
  }
  if (amountTotal >= 439000) {
    return { planType: 'VipBasico', billingCycle: 'annual', isVip: true };
  }
  if (amountTotal >= 79900) {
    return { planType: 'Premium', billingCycle: 'monthly', isVip: false };
  }
  if (amountTotal >= 39900) {
    return { planType: 'Basico', billingCycle: 'monthly', isVip: false };
  }
  return { planType: 'Gratuito', billingCycle: 'monthly', isVip: false };
}

/**
 * Detecta el plan a partir del Price ID de Stripe (más confiable que monto).
 * Útil para upgrades prorrateados donde amount_total no refleja el plan real.
 * Si el priceId no está en el mapa, retorna null y se usa fallback a amount.
 */
function detectPlanFromPriceId(priceId: string | undefined): {
  planType: string;
  billingCycle: 'monthly' | 'annual';
  isVip: boolean;
} | null {
  if (!priceId) return null;
  // TODO: cuando se creen los Price IDs reales en Stripe, mapearlos aquí.
  // Por ahora, devolvemos null y delegamos a detectPlanFromAmount.
  // Ejemplo futuro:
  //   const PRICE_MAP: Record<string, ...> = {
  //     'price_xxx_399':       { planType: 'Basico',     billingCycle: 'monthly', isVip: false },
  //     'price_xxx_799':       { planType: 'Premium',    billingCycle: 'monthly', isVip: false },
  //     'price_xxx_vip_4390':  { planType: 'VipBasico',  billingCycle: 'annual',  isVip: true  },
  //     'price_xxx_vip_8790':  { planType: 'VipPremium', billingCycle: 'annual',  isVip: true  },
  //   };
  //   return PRICE_MAP[priceId] ?? null;
  return null;
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

      if (!userId) {
        console.error('[Webhook] No user ID in session');
        return new Response('No user ID', { status: 400, headers: corsHeaders });
      }

      // Estrategia: primero intenta detectar por Price ID (más confiable),
      // si no se encuentra, fallback a detección por monto.
      const lineItems = session.line_items?.data ?? [];
      const firstPriceId = lineItems[0]?.price?.id;
      const planByPrice = detectPlanFromPriceId(firstPriceId);
      const planInfo = planByPrice ?? detectPlanFromAmount(amountTotal);

      console.log(`[Webhook] Processing payment: userId=${userId}, amount=${amountTotal}, priceId=${firstPriceId}, plan=${planInfo.planType} (${planInfo.billingCycle}${planInfo.isVip ? ', VIP' : ''})`);

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
        .select('is_vip, billing_cycle')
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

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err: any) {
    console.error(`[Webhook] Unexpected error: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
