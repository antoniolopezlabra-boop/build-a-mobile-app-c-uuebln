import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Fijar versión de Stripe API para garantizar compatibilidad de parámetros
const STRIPE_API_VERSION = '2023-10-16'

const stripeHeaders = {
  'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
  'Content-Type': 'application/x-www-form-urlencoded',
  'Stripe-Version': STRIPE_API_VERSION,
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { code, discountType, discountValue, durationDays, maxUses, notes, createdBy } = await req.json()

    if (!code) throw new Error('Código requerido')
    if (!STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY no configurada')

    // ─── 1. Crear el Coupon en Stripe ────────────────────────────────────────
    const couponBody = new URLSearchParams()

    if (discountType === 'full' || discountValue >= 100) {
      couponBody.append('percent_off', '100')
    } else {
      couponBody.append('percent_off', String(discountValue))
    }

    if (durationDays && durationDays > 0) {
      couponBody.append('duration', 'repeating')
      const months = Math.max(1, Math.round(durationDays / 30))
      couponBody.append('duration_in_months', String(months))
    } else {
      couponBody.append('duration', 'once') // 'once' = aplica solo al primer pago
    }

    if (maxUses && maxUses < 999) {
      couponBody.append('max_redemptions', String(maxUses))
    }

    couponBody.append('name', notes || code)

    const couponRes = await fetch('https://api.stripe.com/v1/coupons', {
      method: 'POST',
      headers: stripeHeaders,
      body: couponBody.toString(),
    })

    const coupon = await couponRes.json()
    console.log('[create-promo-code] Coupon response:', JSON.stringify(coupon))
    if (coupon.error) throw new Error(`Stripe coupon error: ${coupon.error.message}`)

    // ─── 2. Crear el PromotionCode en Stripe ──────────────────────────────────
    // IMPORTANTE: el parámetro se llama 'coupon' en la API v2023-10-16
    const promoBody = new URLSearchParams()
    promoBody.append('coupon', coupon.id)  // ID del coupon recién creado
    promoBody.append('code', code.trim().toUpperCase())

    if (maxUses && maxUses < 999) {
      promoBody.append('max_redemptions', String(maxUses))
    }

    const promoRes = await fetch('https://api.stripe.com/v1/promotion_codes', {
      method: 'POST',
      headers: stripeHeaders,
      body: promoBody.toString(),
    })

    const promoCode = await promoRes.json()
    console.log('[create-promo-code] PromoCode response:', JSON.stringify(promoCode))
    if (promoCode.error) throw new Error(`Stripe promo error: ${promoCode.error.message}`)

    // ─── 3. Guardar en Supabase ───────────────────────────────────────────────
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { error: dbError } = await supabase.from('promo_codes').insert({
      code: code.trim().toUpperCase(),
      discount_type: discountType || 'percent',
      discount_value: discountValue || 100,
      duration_days: durationDays || null,
      max_uses: maxUses || 1,
      notes: notes || '',
      created_by: createdBy,
      stripe_coupon_id: coupon.id,
      stripe_promo_code_id: promoCode.id,
      is_active: true,
    })

    if (dbError) throw new Error(`DB error: ${dbError.message}`)

    return new Response(
      JSON.stringify({ success: true, stripePromoCodeId: promoCode.id, code: code.trim().toUpperCase() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('[create-promo-code]', error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
