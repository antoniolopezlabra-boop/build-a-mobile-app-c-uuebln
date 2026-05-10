import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsForApp, handleCorsPreflightRequest } from '../_shared/cors.ts'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const STRIPE_API_VERSION = '2023-10-16'

const stripeHeaders = {
  'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
  'Content-Type': 'application/x-www-form-urlencoded',
  'Stripe-Version': STRIPE_API_VERSION,
}

serve(async (req) => {
  // CORS: esta función solo se llama desde la app móvil (admin VYLTA).
  const corsHeaders = corsForApp(req)
  const preflight = handleCorsPreflightRequest(req, corsHeaders)
  if (preflight) return preflight

  try {
    // durationMonths viene directo del panel — ya no se convierte desde días
    const { code, discountType, discountValue, durationMonths, maxUses, notes, createdBy } = await req.json()

    if (!code) throw new Error('Código requerido')
    if (!STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY no configurada')

    // ─── 1. Crear el Coupon en Stripe ────────────────────────────────
    const couponBody = new URLSearchParams()

    couponBody.append('percent_off', (discountType === 'full' || discountValue >= 100) ? '100' : String(discountValue))

    // Para suscripciones: 'forever' o 'repeating' — NUNCA 'once'
    if (durationMonths && durationMonths > 0) {
      couponBody.append('duration', 'repeating')
      couponBody.append('duration_in_months', String(durationMonths))
    } else {
      couponBody.append('duration', 'forever')
    }

    if (maxUses && maxUses < 999) couponBody.append('max_redemptions', String(maxUses))
    couponBody.append('name', notes || code)

    const couponRes = await fetch('https://api.stripe.com/v1/coupons', {
      method: 'POST', headers: stripeHeaders, body: couponBody.toString(),
    })
    const coupon = await couponRes.json()
    console.log('[create-promo-code] Coupon:', JSON.stringify(coupon))
    if (coupon.error) throw new Error(`Stripe coupon error: ${coupon.error.message}`)

    // ─── 2. Crear el PromotionCode en Stripe ──────────────────────────────
    const promoBody = new URLSearchParams()
    promoBody.append('coupon', coupon.id)
    promoBody.append('code', code.trim().toUpperCase())
    if (maxUses && maxUses < 999) promoBody.append('max_redemptions', String(maxUses))

    const promoRes = await fetch('https://api.stripe.com/v1/promotion_codes', {
      method: 'POST', headers: stripeHeaders, body: promoBody.toString(),
    })
    const promoCode = await promoRes.json()
    console.log('[create-promo-code] PromoCode:', JSON.stringify(promoCode))
    if (promoCode.error) throw new Error(`Stripe promo error: ${promoCode.error.message}`)

    // ─── 3. Guardar en Supabase ──────────────────────────────────────
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { error: dbError } = await supabase.from('promo_codes').insert({
      code: code.trim().toUpperCase(),
      discount_type: discountType || 'percent',
      discount_value: discountValue || 100,
      duration_days: durationMonths || null, // columna se reutiliza para meses
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
