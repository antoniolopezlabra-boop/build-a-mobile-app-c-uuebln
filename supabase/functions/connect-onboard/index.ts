// ══════════════════════════════════════════════════════════════════════
// connect-onboard — Stripe Connect Express para cobros anticipados
//
// El negocio conecta su PROPIA cuenta de Stripe. El onboarding (identidad +
// datos bancarios) lo hospeda Stripe: VYLTA nunca ve ni almacena CLABE,
// tarjetas ni documentos. Aquí solo guardamos el id de la cuenta (acct_...).
//
// Acciones:
//   • create : crea la cuenta Express (si no existe) y devuelve el link de
//              onboarding hospedado por Stripe.
//   • status : consulta el estado real en Stripe y lo sincroniza en la BD.
//              'active' solo cuando charges_enabled && payouts_enabled.
//   • login  : link al panel Express del negocio (ver sus pagos/depósitos).
//
// Requiere JWT del dueño (verify_jwt = true).
// ══════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STRIPE_API = 'https://api.stripe.com/v1';

/** POST form-urlencoded a Stripe (la API no acepta JSON). */
async function stripe(path: string, key: string, body?: Record<string, string>, method = 'POST') {
  const res = await fetch(`${STRIPE_API}${path}`, {
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
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return json({ error: 'Stripe no está configurado' }, 500);

    // ── Auth: solo el dueño autenticado ──
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return json({ error: 'No autorizado' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return json({ error: 'Sesión inválida' }, 401);

    const { action, returnUrl } = await req.json().catch(() => ({ action: 'status' }));

    const { data: profile } = await supabase
      .from('business_profiles')
      .select('business_name, phone, stripe_connect_id, stripe_connect_status')
      .eq('user_id', user.id)
      .single();

    let acctId: string | null = profile?.stripe_connect_id ?? null;

    // ─────────────── CREATE ───────────────
    if (action === 'create') {
      if (!acctId) {
        const acct = await stripe('/accounts', stripeKey, {
          type: 'express',
          country: 'MX',
          'capabilities[card_payments][requested]': 'true',
          'capabilities[transfers][requested]': 'true',
          business_type: 'individual',
          email: user.email ?? '',
          'business_profile[name]': profile?.business_name ?? 'Negocio',
          'business_profile[product_description]': 'Servicios de belleza y bienestar agendados por VYLTA',
          'metadata[vylta_user_id]': user.id,
        });
        acctId = acct.id;
        await supabase
          .from('business_profiles')
          .update({ stripe_connect_id: acctId, stripe_connect_status: 'pending', updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
      }

      const base = returnUrl || 'https://vylta.lat';
      const link = await stripe('/account_links', stripeKey, {
        account: acctId!,
        refresh_url: `${base}/stripe-connect-refresh`,
        return_url: `${base}/stripe-connect-done`,
        type: 'account_onboarding',
      });
      return json({ url: link.url, accountId: acctId });
    }

    // ─────────────── LOGIN (panel del negocio) ───────────────
    if (action === 'login') {
      if (!acctId) return json({ error: 'Aún no has conectado Stripe' }, 400);
      const link = await stripe(`/accounts/${acctId}/login_links`, stripeKey, {});
      return json({ url: link.url });
    }

    // ─────────────── STATUS (default) ───────────────
    if (!acctId) return json({ status: 'none', chargesEnabled: false, payoutsEnabled: false });

    const acct = await stripe(`/accounts/${acctId}`, stripeKey, undefined, 'GET');
    const chargesEnabled = !!acct.charges_enabled;
    const payoutsEnabled = !!acct.payouts_enabled;
    const needs = acct.requirements?.currently_due ?? [];

    const status = chargesEnabled && payoutsEnabled
      ? 'active'
      : (needs.length > 0 ? 'pending' : 'restricted');

    if (status !== profile?.stripe_connect_status) {
      await supabase
        .from('business_profiles')
        .update({ stripe_connect_status: status, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
    }

    return json({
      status,
      chargesEnabled,
      payoutsEnabled,
      requirementsDue: needs.length,
      accountId: acctId,
    });
  } catch (e: any) {
    console.error('[connect-onboard]', e?.message ?? e);
    return json({ error: e?.message ?? 'Error inesperado' }, 500);
  }
});
