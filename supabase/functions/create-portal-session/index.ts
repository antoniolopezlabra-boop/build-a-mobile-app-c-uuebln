import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsForApp, handleCorsPreflightRequest } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  // CORS: esta función es llamada desde la app móvil (Settings → Plan).
  const corsHeaders = corsForApp(req);
  const preflight = handleCorsPreflightRequest(req, corsHeaders);
  if (preflight) return preflight;

  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    // Get stripe_customer_id from subscription_plans
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // verify_jwt=true: el gateway ya validó la firma del JWT. Derivamos la
    // identidad del token (NO se confía en el body) para evitar IDOR: que un
    // usuario abra el portal de Stripe de otro pasando un user_id ajeno.
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'No autorizado.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const user_id = user.id;

    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('stripe_customer_id')
      .eq('user_id', user_id)
      .single();

    if (planError || !plan?.stripe_customer_id) {
      console.error('[Portal] No stripe_customer_id found:', planError?.message);
      return new Response(
        JSON.stringify({ error: 'No se encontró una suscripción activa de Stripe para este usuario.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      console.error('[Portal] STRIPE_SECRET_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Stripe no está configurado correctamente.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Stripe Customer Portal session
    const portalResponse = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: plan.stripe_customer_id,
        return_url: 'https://vylta.lat',  // URL a la que regresa después del portal
      }),
    });

    const portalData = await portalResponse.json();

    if (!portalResponse.ok) {
      console.error('[Portal] Stripe API error:', JSON.stringify(portalData));
      return new Response(
        JSON.stringify({ error: portalData.error?.message || 'Error al crear sesión del portal.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Portal] ✓ Session created for customer ${plan.stripe_customer_id}`);

    return new Response(
      JSON.stringify({ url: portalData.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error(`[Portal] Unexpected error: ${err.message}`);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
