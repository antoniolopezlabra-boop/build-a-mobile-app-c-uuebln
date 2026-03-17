
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { usePlan } from '@/contexts/PlanContext';

const PLAN_FEATURES = {
  Gratuito: [
    'Acceso al perfil del negocio',
    'Configuración de horarios',
    'Catálogo de servicios',
    'Vista previa de la app',
  ],
  Basico: [
    'Citas ilimitadas',
    'Gestión de clientes ilimitada',
    'Calendario y agenda',
    'Reportes financieros',
    'Confirmaciones WhatsApp (número VYLTA)',
    'Recordatorios 24h y 2h antes',
    'Catálogo de servicios con precios',
    'Soporte por email',
  ],
  Premium: [
    'Todo lo del plan Básico',
    'Número de WhatsApp propio del negocio',
    'Citas simultáneas (solapamiento)',
    'Email Marketing a clientes',
    'Recordatorios de cumpleaños',
    'Reportes avanzados',
    'Soporte prioritario 24/7',
  ],
};

const PLAN_PRICE: Record<string, string> = {
  Gratuito: 'Gratis',
  Basico:   '$990 MXN / mes',
  Básico:   '$990 MXN / mes',
  Premium:  '$1,490 MXN / mes',
};

const PLAN_EMOJI: Record<string, string> = {
  Gratuito: '🌱',
  Basico:   '🚀',
  Básico:   '🚀',
  Premium:  '⭐',
};

export default function SubscriptionScreen() {
  const router = useRouter();
  const { plan, loading, isGratuito, isBasico, isPremium, refreshPlan } = usePlan();
  const [upgrading, setUpgrading] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });
  const [successModal, setSuccessModal] = useState(false);

  const currentPlan = plan.planType;
  const priceLabel = PLAN_PRICE[currentPlan] || 'Gratis';
  const emoji = PLAN_EMOJI[currentPlan] || '🌱';

  // Redirige al Payment Link de Stripe según el plan deseado
  const handleGoToStripe = (planTarget: 'Basico' | 'Premium') => {
    // Aquí irán los Payment Links reales de Stripe cuando estén en producción
    setErrorModal({
      visible: true,
      message: planTarget === 'Premium'
        ? 'Para activar Premium, accede al link de pago que te compartimos o contáctanos por WhatsApp.'
        : 'Para activar el Plan Básico, accede al link de pago que te compartimos o contáctanos por WhatsApp.',
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ConfirmModal
        visible={errorModal.visible}
        title="Activar plan"
        message={errorModal.message}
        buttons={[{ text: 'Entendido', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'default' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })}
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Plan y Suscripción</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Card plan actual */}
        <View style={styles.currentPlanCard}>
          <View style={styles.currentPlanHeader}>
            <View style={[styles.currentPlanIconBox, {
              backgroundColor: isPremium ? '#EDE9FE' : isBasico ? '#ECFDF5' : '#F1F5F9',
            }]}>
              <Text style={styles.currentPlanEmoji}>{emoji}</Text>
            </View>
            <View style={styles.currentPlanInfo}>
              <Text style={styles.currentPlanLabel}>Plan actual</Text>
              <Text style={[styles.currentPlanName, {
                color: isPremium ? '#6366F1' : isBasico ? '#10B981' : '#64748B',
              }]}>
                {isPremium ? 'Premium' : isBasico ? 'Básico' : 'Gratuito'}
              </Text>
              <Text style={styles.currentPlanPrice}>{priceLabel}</Text>
            </View>
          </View>
          {isGratuito && (
            <View style={styles.upgradeBanner}>
              <Text style={styles.upgradeBannerText}>
                Activa el Plan Básico para empezar a agendar citas y enviar recordatorios por WhatsApp.
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>PLANES DISPONIBLES</Text>

        {/* Plan Gratuito */}
        <View style={[styles.planCard, isGratuito && styles.planCardActive]}>
          <View style={styles.planHeader}>
            <Text style={styles.planName}>🌱 Gratuito</Text>
            {isGratuito && <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>Tu plan actual</Text></View>}
          </View>
          <Text style={styles.planPrice}>Gratis</Text>
          <Text style={styles.planPeriod}>siempre</Text>
          <View style={styles.featuresList}>
            {PLAN_FEATURES.Gratuito.map((f, i) => (
              <View key={i} style={styles.featureItem}>
                <IconSymbol android_material_icon_name="check" size={18} color="#94A3B8" />
                <Text style={[styles.featureText, { color: colors.textSecondary }]}>{f}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Plan Básico */}
        <View style={[styles.planCard, isBasico && styles.planCardActive]}>
          <View style={styles.planHeader}>
            <Text style={styles.planName}>🚀 Básico</Text>
            {isBasico && <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>Tu plan actual</Text></View>}
          </View>
          <Text style={styles.planPrice}>$990 MXN</Text>
          <Text style={styles.planPeriod}>por mes</Text>
          <View style={styles.featuresList}>
            {PLAN_FEATURES.Basico.map((f, i) => (
              <View key={i} style={styles.featureItem}>
                <IconSymbol android_material_icon_name="check" size={18} color={colors.primary} />
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </View>
          {isGratuito && (
            <TouchableOpacity style={styles.upgradeButton} onPress={() => handleGoToStripe('Basico')}>
              <Text style={styles.upgradeButtonText}>Activar Plan Básico</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Plan Premium */}
        <View style={[styles.planCard, styles.planCardPremium, isPremium && styles.planCardPremiumActive]}>
          <View style={styles.premiumBadgeTop}>
            <Text style={styles.premiumBadgeTopText}>⭐ RECOMENDADO</Text>
          </View>
          <View style={styles.planHeader}>
            <Text style={[styles.planName, { color: '#6366F1' }]}>Premium</Text>
            {isPremium && <View style={[styles.currentBadge, { backgroundColor: '#6366F1' }]}><Text style={styles.currentBadgeText}>Tu plan actual</Text></View>}
          </View>
          <Text style={[styles.planPrice, { color: '#6366F1' }]}>$1,490 MXN</Text>
          <Text style={styles.planPeriod}>por mes</Text>
          <View style={styles.featuresList}>
            {PLAN_FEATURES.Premium.map((f, i) => (
              <View key={i} style={styles.featureItem}>
                <IconSymbol android_material_icon_name="check" size={18} color="#6366F1" />
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </View>
          {!isPremium && (
            <TouchableOpacity style={[styles.upgradeButton, { backgroundColor: '#6366F1' }]} onPress={() => handleGoToStripe('Premium')}>
              <Text style={styles.upgradeButtonText}>Activar Plan Premium</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.infoCard}>
          <IconSymbol android_material_icon_name="info" size={18} color={colors.primary} />
          <Text style={styles.infoText}>
            Los planes se pagan mensualmente. Puedes cancelar en cualquier momento desde tu cuenta de Stripe.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, paddingTop: 16, backgroundColor: colors.card,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backButton: { padding: 4 },
  title: { fontSize: 20, fontWeight: 'bold', color: colors.text },
  placeholder: { width: 32 },
  scrollContent: { padding: 20, paddingBottom: 60 },

  // Plan actual
  currentPlanCard: {
    backgroundColor: colors.card, borderRadius: 16, padding: 20,
    marginBottom: 24, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  currentPlanHeader: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  currentPlanIconBox: { width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  currentPlanEmoji: { fontSize: 28 },
  currentPlanInfo: { flex: 1 },
  currentPlanLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  currentPlanName: { fontSize: 22, fontWeight: '800', marginTop: 2 },
  currentPlanPrice: { fontSize: 14, color: colors.textSecondary, marginTop: 3, fontWeight: '500' },
  upgradeBanner: {
    marginTop: 14, backgroundColor: '#ECFDF5', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#10B981',
  },
  upgradeBannerText: { fontSize: 13, color: '#065F46', lineHeight: 18 },

  sectionTitle: {
    fontSize: 11, fontWeight: '800', color: colors.textSecondary,
    marginBottom: 12, letterSpacing: 1,
  },

  // Cards de planes
  planCard: {
    backgroundColor: colors.card, borderRadius: 16, padding: 20,
    marginBottom: 16, borderWidth: 1.5, borderColor: 'transparent',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  planCardActive: { borderColor: colors.primary },
  planCardPremium: { borderColor: '#C7D2FE' },
  planCardPremiumActive: { borderColor: '#6366F1' },
  premiumBadgeTop: {
    alignSelf: 'flex-start', backgroundColor: '#EEF2FF',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 12,
  },
  premiumBadgeTopText: { fontSize: 11, fontWeight: '800', color: '#6366F1' },
  planHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  planName: { fontSize: 20, fontWeight: '700', color: colors.text },
  currentBadge: {
    backgroundColor: colors.primary, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  currentBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  planPrice: { fontSize: 28, fontWeight: '800', color: colors.text },
  planPeriod: { fontSize: 13, color: colors.textSecondary, marginBottom: 16 },
  featuresList: { gap: 10 },
  featureItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { fontSize: 14, color: colors.text, flex: 1 },
  upgradeButton: {
    backgroundColor: colors.primary, borderRadius: 12, padding: 14,
    alignItems: 'center', marginTop: 18,
  },
  upgradeButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  infoCard: {
    backgroundColor: colors.card, borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 4,
  },
  infoText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
});
