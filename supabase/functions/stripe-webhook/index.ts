import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  const stripe = (await import('https://esm.sh/stripe@14?target=deno')).default;
  const stripeClient = new stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

  let event;
  try {
    event = await stripeClient.webhooks.constructEventAsync(body, signature!, webhookSecret);
  } catch (err) {
    return new Response(`Webhook error: ${err.message}`, { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.client_reference_id;
    const customerId = session.customer;
    const subscriptionId = session.subscription;

    if (!userId) return new Response('No user ID', { status: 400 });

    const amountTotal = session.amount_total;
    // Nuevos precios (ABRIL 2026):
    // $799 MXN = 79900 centavos → Premium (Luxury)
    // $399 MXN = 39900 centavos → Basico (Premium)
    const planType = amountTotal >= 79900 ? 'Premium' : 'Basico';

    await supabase.from('subscription_plans').upsert({
      user_id: userId,
      plan_type: planType,
      status: 'active',
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  }

  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object;
    const customerId = invoice.customer;

    const { data } = await supabase
      .from('subscription_plans')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .single();

    if (data) {
      await supabase.from('subscription_plans').update({
        status: 'expired',
        updated_at: new Date().toISOString(),
      }).eq('stripe_customer_id', customerId);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const customerId = subscription.customer;

    await supabase.from('subscription_plans').update({
      plan_type: 'Gratuito',
      status: 'cancelled',
      stripe_subscription_id: null,
      updated_at: new Date().toISOString(),
    }).eq('stripe_customer_id', customerId);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});