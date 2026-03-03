
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { apiGet, apiPut } from '@/utils/api';

interface Subscription {
  planType: 'Básico' | 'Premium';
  price: string;
  features?: string[];
}

const PLAN_FEATURES = {
  Básico: [
    'Hasta 50 citas por mes',
    'Gestión de clientes ilimitada',
    'Calendario y recordatorios',
    'Reportes básicos',
    'Soporte por email',
  ],
  Premium: [
    'Citas ilimitadas',
    'Gestión de clientes ilimitada',
    'Calendario y recordatorios',
    'Reportes avanzados y analytics',
    'WhatsApp Business integrado',
    'Lista de espera automática',
    'Recordatorios automáticos',
    'Soporte prioritario 24/7',
    'Múltiples usuarios',
  ],
};

export default function SubscriptionScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [confirmModal, setConfirmModal] = useState(false);
  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });
  const [successModal, setSuccessModal] = useState(false);

  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    console.log('[Subscription] Loading subscription');
    setLoading(true);
    try {
      const data = await apiGet<Subscription>('/api/subscription');
      setSubscription(data);
      console.log('[Subscription] Loaded:', data.planType);
    } catch (error) {
      console.error('[Subscription] Failed to load:', error);
      setSubscription({ planType: 'Básico', price: '$990 MXN' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async () => {
    setConfirmModal(false);
    setUpgrading(true);
    try {
      console.log('[Subscription] Upgrading to Premium');
      await apiPut('/api/subscription', { planType: 'Premium' });
      await loadSubscription();
      setSuccessModal(true);
      console.log('[Subscription] Upgraded successfully');
    } catch (error: any) {
      console.error('[Subscription] Upgrade failed:', error);
      setErrorModal({ visible: true, message: error?.message || 'Error al actualizar el plan' });
    } finally {
      setUpgrading(false);
    }
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

  const currentPlan = subscription?.planType || 'Básico';
  const isPremium = currentPlan === 'Premium';

  return (
    <SafeAreaView style={styles.container}>
      <ConfirmModal
        visible={confirmModal}
        title="Mejorar a Premium"
        message="¿Deseas actualizar tu plan a Premium por $1,490 MXN/mes? Tendrás acceso a todas las funciones avanzadas."
        buttons={[
          {
            text: 'Actualizar',
            onPress: handleUpgrade,
            style: 'default',
          },
          {
            text: 'Cancelar',
            onPress: () => setConfirmModal(false),
            style: 'cancel',
          },
        ]}
        onDismiss={() => setConfirmModal(false)}
      />

      <ConfirmModal
        visible={errorModal.visible}
        title="Error"
        message={errorModal.message}
        buttons={[
          {
            text: 'Aceptar',
            onPress: () => setErrorModal({ visible: false, message: '' }),
            style: 'cancel',
          },
        ]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })}
      />

      <ConfirmModal
        visible={successModal}
        title="¡Bienvenido a Premium!"
        message="Tu plan ha sido actualizado exitosamente. Ahora tienes acceso a todas las funciones Premium."
        buttons={[
          {
            text: 'Aceptar',
            onPress: () => {
              setSuccessModal(false);
              router.back();
            },
            style: 'default',
          },
        ]}
        onDismiss={() => {
          setSuccessModal(false);
          router.back();
        }}
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Plan y Suscripción</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Current plan card */}
        <View style={styles.currentPlanCard}>
          <View style={styles.currentPlanHeader}>
            <IconSymbol
              android_material_icon_name="star"
              size={32}
              color={isPremium ? colors.accent : colors.primary}
            />
            <View style={styles.currentPlanInfo}>
              <Text style={styles.currentPlanLabel}>Plan Actual</Text>
              <Text style={styles.currentPlanName}>{currentPlan}</Text>
              <Text style={styles.currentPlanPrice}>
                {isPremium ? '$1,490 MXN' : '$990 MXN'} / mes
              </Text>
            </View>
          </View>
        </View>

        {/* Plan comparison */}
        <Text style={styles.sectionTitle}>COMPARACIÓN DE PLANES</Text>

        {/* Básico plan */}
        <View style={[styles.planCard, currentPlan === 'Básico' && styles.planCardActive]}>
          <View style={styles.planHeader}>
            <Text style={styles.planName}>Básico</Text>
            {currentPlan === 'Básico' && (
              <View style={styles.currentBadge}>
                <Text style={styles.currentBadgeText}>Actual</Text>
              </View>
            )}
          </View>
          <Text style={styles.planPrice}>$990 MXN</Text>
          <Text style={styles.planPeriod}>por mes</Text>

          <View style={styles.featuresList}>
            {PLAN_FEATURES.Básico.map((feature, index) => (
              <View key={index} style={styles.featureItem}>
                <IconSymbol
                  android_material_icon_name="check"
                  size={20}
                  color={colors.primary}
                />
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Premium plan */}
        <View style={[styles.planCard, styles.planCardPremium, currentPlan === 'Premium' && styles.planCardActive]}>
          <View style={styles.premiumBadge}>
            <IconSymbol android_material_icon_name="star" size={16} color="#FFFFFF" />
            <Text style={styles.premiumBadgeText}>RECOMENDADO</Text>
          </View>

          <View style={styles.planHeader}>
            <Text style={[styles.planName, styles.planNamePremium]}>Premium</Text>
            {currentPlan === 'Premium' && (
              <View style={[styles.currentBadge, styles.currentBadgePremium]}>
                <Text style={styles.currentBadgeText}>Actual</Text>
              </View>
            )}
          </View>
          <Text style={[styles.planPrice, styles.planPricePremium]}>$1,490 MXN</Text>
          <Text style={styles.planPeriod}>por mes</Text>

          <View style={styles.featuresList}>
            {PLAN_FEATURES.Premium.map((feature, index) => (
              <View key={index} style={styles.featureItem}>
                <IconSymbol
                  android_material_icon_name="check"
                  size={20}
                  color={colors.accent}
                />
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>

          {!isPremium && (
            <TouchableOpacity
              style={[styles.upgradeButton, upgrading && styles.upgradeButtonDisabled]}
              onPress={() => setConfirmModal(true)}
              disabled={upgrading}
            >
              {upgrading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <IconSymbol android_material_icon_name="star" size={20} color="#FFFFFF" />
                  <Text style={styles.upgradeButtonText}>Mejorar a Premium</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.infoCard}>
          <IconSymbol android_material_icon_name="info" size={20} color={colors.primary} />
          <Text style={styles.infoText}>
            Puedes cambiar o cancelar tu plan en cualquier momento. Los cambios se aplicarán en tu
            próximo ciclo de facturación.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 48,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  placeholder: {
    width: 32,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  currentPlanCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  currentPlanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currentPlanInfo: {
    marginLeft: 16,
    flex: 1,
  },
  currentPlanLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  currentPlanName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 4,
  },
  currentPlanPrice: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  planCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    position: 'relative',
  },
  planCardActive: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  planCardPremium: {
    borderWidth: 2,
    borderColor: colors.accent,
  },
  premiumBadge: {
    position: 'absolute',
    top: -10,
    right: 20,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  premiumBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  planName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
  },
  planNamePremium: {
    color: colors.accent,
  },
  currentBadge: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  currentBadgePremium: {
    backgroundColor: colors.accent,
  },
  currentBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  planPrice: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
  },
  planPricePremium: {
    color: colors.accent,
  },
  planPeriod: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  featuresList: {
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  upgradeButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
  },
  upgradeButtonDisabled: {
    opacity: 0.6,
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
