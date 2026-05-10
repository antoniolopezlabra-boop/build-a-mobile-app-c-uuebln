import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsForWebhook } from '../_shared/cors.ts';

// stripe-webhook recibe llamadas server-to-server desde Stripe.
// CORS no aplica aquí (Stripe no es un navegador), pero exponemos los
// headers estándar por consistencia. La seguridad real vendrá de validar
// la firma del webhook (Stripe-Signature), no de CORS.
const corsHeaders = corsForWebhook();

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

      // Nuevos precios (ABRIL 2026):
      // $799 MXN = 79900 centavos → Premium (Luxury)
      // $399 MXN = 39900 centavos → Basico (Premium)
      const planType = amountTotal >= 79900 ? 'Premium' : 'Basico';

      console.log(`[Webhook] Processing payment: userId=${userId}, amount=${amountTotal}, planType=${planType}`);

      const { error } = await supabase
        .from('subscription_plans')
        .upsert({
          user_id: userId,
          plan_type: planType,
          status: 'active',
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) {
        console.error(`[Webhook] Upsert error: ${error.message}`);
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      console.log(`[Webhook] ✓ Success: Plan ${planType} assigned to user ${userId}`);
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

      await supabase
        .from('subscription_plans')
        .update({
          plan_type: 'Gratuito',
          status: 'cancelled',
          stripe_subscription_id: null,
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
