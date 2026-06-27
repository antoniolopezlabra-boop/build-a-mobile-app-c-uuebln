import { Linking } from 'react-native';
import { supabase } from '@/lib/supabase';

// CLAVE PUBLICABLE DE PRODUCCIÓN (segura para frontend)
// NO confundir con sk_live_ ni whsec_ (esas SÍ son secretas)
export const STRIPE_PUBLISHABLE_KEY = 'pk_live_51T8wszR0yiPecGZxEvutgW64k6QkvznKC5iZakXggWZsvC7XL05eTc0BMVzni4esE2ZgTTGyxzn43Hoaq50xGj7K00xFKXJgXQ';

/**
 * MAPPING DE NOMBRES INTERNOS vs VISIBLES PARA CLIENTES:
 *
 *   PLANES MENSUALES:
 *   'gratuito'   (interno) = Plan Básico        (visible, $0 MXN/mes, 10 citas/mes)
 *   'basico'     (interno) = Plan Premium       (visible, $399 MXN/mes)
 *   'premium'    (interno) = Plan Luxury        (visible, $799 MXN/mes)
 *
 *   PLANES VIP ANUALES (incluyen comunicación directa con CEO + capacitaciones):
 *   'vip_basico'  (interno) = VIP Premium Anual (visible, $4,390 MXN/año, ahorra 1 mes)
 *   'vip_premium' (interno) = VIP Luxury Anual  (visible, $8,790 MXN/año, ahorra 1 mes)
 *
 * Esta inconsistencia se mantiene por compatibilidad con la BD existente.
 * NO cambiar nombres internos sin migración cuidadosa.
 */
export const PLAN_PRICES = {
    // ─── PLANES MENSUALES ────────────────────────────────────────
    // Plan Premium ($399 MXN/mes) — recurring monthly
    basico: {
        priceId: 'price_basico_399',
        link: 'https://buy.stripe.com/7sY5kF5Ym9hm7mw5g938400',
        billingCycle: 'monthly' as const,
        isVip: false,
    },
    // Plan Luxury ($799 MXN/mes) — recurring monthly
    premium: {
        priceId: 'price_premium_799',
        link: 'https://buy.stripe.com/8x228t72q65a9uE23X38402',
        billingCycle: 'monthly' as const,
        isVip: false,
    },

    // ─── PLANES VIP ANUALES (May 15 2026) ───────────────────────
    // VIP Premium Anual ($4,390 MXN/año) — recurring yearly, ahorra 1 mes
    vip_basico: {
        priceId: 'price_vip_basico_4390',
        link: 'https://buy.stripe.com/8x2fZjaeCeBGayI7oh38403',
        billingCycle: 'annual' as const,
        isVip: true,
    },
    // VIP Luxury Anual ($8,790 MXN/año) — recurring yearly, ahorra 1 mes
    vip_premium: {
        priceId: 'price_vip_premium_8790',
        link: 'https://buy.stripe.com/14A7sN5YmgJOdKU23X38404',
        billingCycle: 'annual' as const,
        isVip: true,
    },
};

const SUPABASE_URL = 'https://nhjmwmkaduiaifgztymi.supabase.co';

/**
 * Tipos de plan que se pueden comprar (no incluye 'gratuito')
 */
export type PurchasablePlan = 'basico' | 'premium' | 'vip_basico' | 'vip_premium';

/**
 * Abre el Payment Link de Stripe con el client_reference_id (user_id)
 * El client_reference_id es CRÍTICO para que el webhook sepa a qué usuario asignar el plan
 * @param planType - tipo de plan a comprar
 * @param userId - El ID del usuario (de Supabase Auth)
 */
export const openStripePaymentLink = (planType: PurchasablePlan, userId: string) => {
  if (!userId) {
    console.error('[Stripe] No userId provided to openStripePaymentLink');
    return;
  }

  const planConfig = PLAN_PRICES[planType];

  if (!planConfig) {
    console.error(`[Stripe] Invalid plan type: ${planType}`);
    return;
  }

  const baseUrl = planConfig.link;

  // CRÍTICO: Pasar client_reference_id como parámetro en la URL
  const url = `${baseUrl}?client_reference_id=${encodeURIComponent(userId)}`;

  console.log(`[Stripe] Opening Payment Link: ${planType} (${planConfig.billingCycle}) for user ${userId}`);

  Linking.openURL(url).catch((err) => {
    console.error('[Stripe] Error opening payment link:', err);
  });
};

/**
 * Abre el Stripe Customer Portal para gestionar la suscripción
 * El portal permite: cancelar suscripción, cambiar método de pago, ver facturas
 * @param userId - El ID del usuario (de Supabase Auth)
 * @returns Promise con el resultado (true si abrió correctamente)
 */
export const openStripePortal = async (userId: string): Promise<{ success: boolean; error?: string }> => {
  if (!userId) {
    return { success: false, error: 'No se pudo obtener tu ID de usuario.' };
  }

  try {
    // El edge function tiene verify_jwt=true: el gateway de Supabase exige un
    // JWT válido en Authorization, o devuelve 401 antes de ejecutar la función.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { success: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' };
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/create-portal-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ user_id: userId }),
    });

    const data = await response.json();

    if (!response.ok || !data.url) {
      console.error('[Stripe Portal] Error:', data.error);
      return { success: false, error: data.error || 'No se pudo abrir el portal de suscripción.' };
    }

    console.log('[Stripe Portal] Opening portal URL');
    await Linking.openURL(data.url);
    return { success: true };
  } catch (err: any) {
    console.error('[Stripe Portal] Error:', err.message);
    return { success: false, error: 'Error de conexión. Intenta de nuevo.' };
  }
};

/**
 * Abre WhatsApp directo con Antonio (CEO/Director de Operaciones) — exclusivo planes VIP
 * @param businessName - Nombre del negocio del cliente (opcional, mejora el contexto del mensaje)
 */
export const openVipCeoWhatsApp = (businessName?: string) => {
  const ceoPhone = '525634330814'; // +52 1 56 3433 0814 (sin signos ni espacios para wa.me)
  const businessLabel = businessName?.trim() || '[mi negocio]';
  const message = `Hola Antonio, soy ${businessLabel} cliente VIP de VYLTA.`;
  const url = `https://wa.me/${ceoPhone}?text=${encodeURIComponent(message)}`;

  console.log(`[VIP] Opening WhatsApp to CEO for business: ${businessLabel}`);

  Linking.openURL(url).catch((err) => {
    console.error('[VIP] Error opening WhatsApp:', err);
  });
};
