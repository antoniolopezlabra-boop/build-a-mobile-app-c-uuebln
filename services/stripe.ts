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
  // Esto permite que Stripe sepa a quién asignar el plan cuando el webhook procese el pago
  const url = `${baseUrl}?client_reference_id=${encodeURIComponent(userId)}`;
  
  console.log(`[Stripe] Opening Payment Link: ${planType} for user ${userId}`);
  
  Linking.openURL(url).catch((err) => {
    console.error('[Stripe] Error opening payment link:', err);
  });
};
