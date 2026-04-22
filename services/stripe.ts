import { Linking } from 'react-native';

export const STRIPE_PUBLISHABLE_KEY = 'pk_test_51T8wtAJH1Ir1ABIzRNM9oIotWpI7IEg1joxVlEBGDiYfSBh2hdz2mcP7an6krNEfAcsyTwuflXgiEZqPneajUI3n00euzQjpN9';

export const PLAN_PRICES = {
    basico: {
        priceId: 'price_basico_399',
        link: 'https://buy.stripe.com/test_bJefZie694aw2E983D7ok04',  // $399 MXN/mes
    },
    premium: {
        priceId: 'price_premium_799',
        link: 'https://buy.stripe.com/test_8x2dRa8LPePafqV3Nn7ok03',  // $799 MXN/mes
    },
};

const SUPABASE_URL = 'https://nhjmwmkaduiaifgztymi.supabase.co';

/**
 * Abre el Payment Link de Stripe con el client_reference_id (user_id)
 * El client_reference_id es CRÍTICO para que el webhook sepa a qué usuario asignar el plan
 * @param planType - 'basico' o 'premium'
 * @param userId - El ID del usuario (de Supabase Auth)
 */
export const openStripePaymentLink = (planType: 'basico' | 'premium', userId: string) => {
  if (!userId) {
    console.error('[Stripe] No userId provided to openStripePaymentLink');
    return;
  }

  const baseUrl = PLAN_PRICES[planType]?.link;
  
  if (!baseUrl) {
    console.error(`[Stripe] Invalid plan type: ${planType}`);
    return;
  }

  // CRÍTICO: Pasar client_reference_id como parámetro en la URL
  const url = `${baseUrl}?client_reference_id=${encodeURIComponent(userId)}`;
  
  console.log(`[Stripe] Opening Payment Link: ${planType} for user ${userId}`);
  
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
    const response = await fetch(`${SUPABASE_URL}/functions/v1/create-portal-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
