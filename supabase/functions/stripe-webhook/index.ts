import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  try {
    const stripe = (await import('https://esm.sh/stripe@14')).default;
    const stripeClient = new stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '');
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

    // Usar constructEvent (síncrono) en lugar de constructEventAsync
    const event = stripeClient.webhooks.constructEvent(body, signature!, webhookSecret);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      const userId = session.client_reference_id;
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      if (!userId) return new Response('No user ID', { status: 400 });

      const amountTotal = session.amount_total;
      // Nuevos precios (ABRIL 2026):
      // $799 MXN = 79900 centavos → Premium (Luxury)
      // $399 MXN = 39900 centavos → Basico (Premium)
      const planType = amountTotal >= 79900 ? 'Premium' : 'Basico';

      console.log(`[Stripe Webhook] Payment received: ${userId} - Amount: ${amountTotal} - Plan: ${planType}`);

      const { error } = await supabase.from('subscription_plans').upsert({
        user_id: userId,
        plan_type: planType,
        status: 'active',
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      if (error) {
        console.error(`[Stripe Webhook] Upsert error: ${error.message}`);
        return new Response(JSON.stringify({ error: error.message }), { status: 400 });
      }

      console.log(`[Stripe Webhook] Success: Plan ${planType} assigned to user ${userId}`);
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as any;
      const customerId = invoice.customer;

      console.log(`[Stripe Webhook] Payment failed for customer: ${customerId}`);

      const { error } = await supabase.from('subscription_plans').update({
        status: 'expired',
        updated_at: new Date().toISOString(),
      }).eq('stripe_customer_id', customerId);

      if (error) {
        console.error(`[Stripe Webhook] Update error: ${error.message}`);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as any;
      const customerId = subscription.customer;

      console.log(`[Stripe Webhook] Subscription deleted for customer: ${customerId}`);

      const { error } = await supabase.from('subscription_plans').update({
        plan_type: 'Gratuito',
        status: 'cancelled',
        stripe_subscription_id: null,
        updated_at: new Date().toISOString(),
      }).eq('stripe_customer_id', customerId);

      if (error) {
        console.error(`[Stripe Webhook] Update error: ${error.message}`);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err: any) {
    console.error(`[Stripe Webhook] Error: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), { status: 400 });
  }
});
