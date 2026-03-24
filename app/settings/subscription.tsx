
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { usePlan } from '@/contexts/PlanContext';
import { PLAN_PRICES } from '@/services/stripe';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

// ──────────────────────────────────────────────────
// PLAN GRATUITO: solo para explorar la app, sin funciones operativas
// PLAN BÁSICO: operación completa para un negocio de 1 persona
// PLAN PREMIUM: equipo, marketing y reportes avanzados
// ──────────────────────────────────────────────────
const PLAN_FEATURES = {
  Gratuito: [
    'Perfil del negocio',
    'Configuración de horarios',
    'Catálogo de servicios (visualización)',
    'Sin citas (requiere Plan Básico)',
    'Sin link de citas público',
    'Sin recordatorios WhatsApp',
    'Sin soporte con IA',
    'Sin reportes',
  ],
  Basico: [
    'Citas ilimitadas desde la app',
    'Link de citas público para clientes',
    'Catálogo de servicios ilimitado',
    'Recordatorios WhatsApp automáticos',
    'Confirmación al agendar (WhatsApp)',
    'Recordatorio 24h y 2h antes',
    'Lista de espera simple',
    'Gestión completa de clientes',
    'Reportes de citas e ingresos',
    'Asistente IA de soporte y configuración',
    'Soporte por email',
  ],
  Premium: [
    'Todo lo del Plan Básico',
    'Equipo de hasta 5 colaboradores',
    'Asignación de citas por colaborador',
    'Citas simultáneas (atención en paralelo)',
    'Email Marketing (campañas a clientes)',
    'Recuperación de clientes inactivos',
    'Recordatorios de cumpleaños',
    'Reportes avanzados del equipo',
    'Asistente IA de soporte y configuración',
    'Soporte prioritario',
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

type PlanTarget = 'Basico' | 'Premium';

export default function SubscriptionScreen() {
  const router = useRouter();
  const { plan, loading, isGratuito, isBasico, isPremium } = usePlan();
  const [confirmModal, setConfirmModal] = useState<{ visible: boolean; target: PlanTarget | null }>({
    visible: false, target: null,
  });
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });

  const currentPlan = plan.planType;
  const priceLabel  = PLAN_PRICE[currentPlan] || 'Gratis';
  const emoji       = PLAN_EMOJI[currentPlan] || '🌱';

  const handleActivatePlan = (target: PlanTarget) => {
    setConfirmModal({ visible: true, target });
  };

  const handleConfirmRedirect = async () => {
    const target = confirmModal.target;
    setConfirmModal({ visible: false, target: null });
    if (!target) return;
    const url = target === 'Premium' ? PLAN_PRICES.premium.link : PLAN_PRICES.basico.link;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
      else setErrorModal({ visible: true, message: 'No se pudo abrir el navegador.' });
    } catch {
      setErrorModal({ visible: true, message: 'Error al abrir el link de pago.' });
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const targetName  = confirmModal.target === 'Premium' ? 'Premium' : 'Básico';
  const targetPrice = confirmModal.target === 'Premium' ? '$1,490 MXN/mes' : '$990 MXN/mes';

  return (
    <SafeAreaView style={s.container}>
      <ConfirmModal
        visible={confirmModal.visible}
        title={`Activar Plan ${targetName}`}
        message={`Serás redirigido a la página de pago seguro de Stripe para completar tu suscripción de ${targetPrice}.\n\n¿Continuar?`}
        buttons={[
          { text: 'Cancelar', onPress: () => setConfirmModal({ visible: false, target: null }), style: 'cancel' },
          { text: 'Ir al pago →', onPress: handleConfirmRedirect, style: 'default' },
        ]}
        onDismiss={() => setConfirmModal({ visible: false, target: null })}
      />
      <ConfirmModal
        visible={errorModal.visible}
        title="Error"
        message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'default' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })}
      />

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <IconSymbol android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>Plan y Suscripción</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>

        {/* Plan actual */}
        <View style={s.currentCard}>
          <View style={s.currentRow}>
            <View style={[s.currentIconBox, {
              backgroundColor: isPremium ? '#EDE9FE' : isBasico ? '#ECFDF5' : '#F1F5F9',
            }]}>
              <Text style={s.currentEmoji}>{emoji}</Text>
            </View>
            <View style={s.currentInfo}>
              <Text style={s.currentLabel}>Plan actual</Text>
              <Text style={[s.currentName, {
                color: isPremium ? '#6366F1' : isBasico ? '#10B981' : '#64748B',
              }]}>
                {isPremium ? 'Premium' : isBasico ? 'Básico' : 'Gratuito'}
              </Text>
              <Text style={s.currentPrice}>{priceLabel}</Text>
            </View>
          </View>
          {isGratuito && (
            <View style={s.upgradeBanner}>
              <Text style={s.upgradeBannerText}>
                ⚠️ El plan Gratuito es solo para explorar la app. Activa el Plan Básico para empezar a agendar citas y usar todas las funciones.
              </Text>
            </View>
          )}
          {isBasico && (
            <View style={[s.upgradeBanner, { backgroundColor: '#EEF2FF', borderColor: '#6366F1' }]}>
              <Text style={[s.upgradeBannerText, { color: '#3730A3' }]}>
                Mejora al Plan Premium para activar tu equipo de colaboradores, email marketing y reportes avanzados.
              </Text>
            </View>
          )}
        </View>

        <Text style={s.sectionLabel}>PLANES DISPONIBLES</Text>

        {/* Plan Gratuito */}
        <View style={[s.planCard, isGratuito && s.planCardActive]}>
          <View style={s.planHeader}>
            <Text style={s.planName}>🌱 Gratuito</Text>
            {isGratuito && <View style={s.activeBadge}><Text style={s.activeBadgeText}>Tu plan actual</Text></View>}
          </View>
          <Text style={s.planPrice}>Gratis</Text>
          <Text style={s.planPeriod}>solo para explorar</Text>
          <View style={s.features}>
            {PLAN_FEATURES.Gratuito.map((f, i) => {
              const isLimit = f.startsWith('Sin');
              return (
                <View key={i} style={s.featureRow}>
                  <MaterialIcons
                    name={isLimit ? 'close' : 'check'}
                    size={16}
                    color={isLimit ? '#EF4444' : '#94A3B8'}
                  />
                  <Text style={[s.featureText, { color: isLimit ? '#EF4444' : colors.textSecondary }]}>{f}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Plan Básico */}
        <View style={[s.planCard, isBasico && s.planCardActive]}>
          <View style={s.planHeader}>
            <Text style={s.planName}>🚀 Básico</Text>
            {isBasico && <View style={s.activeBadge}><Text style={s.activeBadgeText}>Tu plan actual</Text></View>}
          </View>
          <Text style={s.planPrice}>$990 MXN</Text>
          <Text style={s.planPeriod}>por mes</Text>
          <View style={s.features}>
            {PLAN_FEATURES.Basico.map((f, i) => {
              const isAI = f.includes('IA');
              return (
                <View key={i} style={s.featureRow}>
                  <MaterialIcons name="check" size={16} color={isAI ? '#10B981' : colors.primary} />
                  <Text style={[s.featureText, isAI && s.featureAI]}>{f}</Text>
                  {isAI && (
                    <View style={s.aiChip}>
                      <MaterialIcons name="auto-awesome" size={10} color="#10B981" />
                      <Text style={s.aiChipText}>IA</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
          {isGratuito && (
            <TouchableOpacity style={s.ctaBtn} onPress={() => handleActivatePlan('Basico')}>
              <MaterialIcons name="lock-open" size={18} color="#fff" />
              <Text style={s.ctaBtnText}>Activar Plan Básico</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Plan Premium */}
        <View style={[s.planCard, s.planCardPremium, isPremium && s.planCardPremiumActive]}>
          <View style={s.premiumBadge}><Text style={s.premiumBadgeText}>⭐ RECOMENDADO</Text></View>
          <View style={s.planHeader}>
            <Text style={[s.planName, { color: '#6366F1' }]}>Premium</Text>
            {isPremium && <View style={[s.activeBadge, { backgroundColor: '#6366F1' }]}><Text style={s.activeBadgeText}>Tu plan actual</Text></View>}
          </View>
          <Text style={[s.planPrice, { color: '#6366F1' }]}>$1,490 MXN</Text>
          <Text style={s.planPeriod}>por mes</Text>
          <View style={s.features}>
            {PLAN_FEATURES.Premium.map((f, i) => {
              const isAI = f.includes('IA');
              return (
                <View key={i} style={s.featureRow}>
                  <MaterialIcons name="check" size={16} color={isAI ? '#6366F1' : '#6366F1'} />
                  <Text style={[s.featureText, isAI && s.featureAIPremium]}>{f}</Text>
                  {isAI && (
                    <View style={[s.aiChip, { backgroundColor: '#EEF2FF', borderColor: '#6366F1' }]}>
                      <MaterialIcons name="auto-awesome" size={10} color="#6366F1" />
                      <Text style={[s.aiChipText, { color: '#6366F1' }]}>IA</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
          {!isPremium && (
            <TouchableOpacity style={[s.ctaBtn, { backgroundColor: '#6366F1' }]} onPress={() => handleActivatePlan('Premium')}>
              <MaterialIcons name="lock-open" size={18} color="#fff" />
              <Text style={s.ctaBtnText}>Activar Plan Premium</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={s.secureNote}>
          <MaterialIcons name="lock" size={14} color="#94A3B8" />
          <Text style={s.secureNoteText}>
            Pago seguro procesado por Stripe. Puedes cancelar tu suscripción en cualquier momento.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, paddingTop: 16, backgroundColor: colors.card,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: { padding: 4 },
  title: { fontSize: 20, fontWeight: 'bold', color: colors.text },
  scroll: { padding: 20, paddingBottom: 60 },
  currentCard: {
    backgroundColor: colors.card, borderRadius: 16, padding: 20,
    marginBottom: 24, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  currentRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  currentIconBox: { width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  currentEmoji: { fontSize: 28 },
  currentInfo: { flex: 1 },
  currentLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  currentName: { fontSize: 22, fontWeight: '800', marginTop: 2 },
  currentPrice: { fontSize: 14, color: colors.textSecondary, marginTop: 3, fontWeight: '500' },
  upgradeBanner: { marginTop: 14, backgroundColor: '#ECFDF5', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#10B981' },
  upgradeBannerText: { fontSize: 13, color: '#065F46', lineHeight: 18 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: colors.textSecondary, marginBottom: 12, letterSpacing: 1 },
  planCard: {
    backgroundColor: colors.card, borderRadius: 16, padding: 20,
    marginBottom: 16, borderWidth: 1.5, borderColor: 'transparent',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  planCardActive:        { borderColor: colors.primary },
  planCardPremium:       { borderColor: '#C7D2FE' },
  planCardPremiumActive: { borderColor: '#6366F1' },
  premiumBadge: { alignSelf: 'flex-start', backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 12 },
  premiumBadgeText: { fontSize: 11, fontWeight: '800', color: '#6366F1' },
  planHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  planName: { fontSize: 20, fontWeight: '700', color: colors.text },
  activeBadge: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  activeBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  planPrice: { fontSize: 28, fontWeight: '800', color: colors.text },
  planPeriod: { fontSize: 13, color: colors.textSecondary, marginBottom: 16 },
  features: { gap: 10 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { fontSize: 14, color: colors.text, flex: 1 },
  featureAI: { color: '#065F46', fontWeight: '600' },
  featureAIPremium: { color: '#3730A3', fontWeight: '600' },
  aiChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 0.5, borderColor: '#10B981' },
  aiChipText: { fontSize: 9, fontWeight: '800', color: '#10B981' },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 12, padding: 14, marginTop: 18,
  },
  ctaBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secureNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.card, borderRadius: 10, padding: 12, marginTop: 4,
  },
  secureNoteText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
});
