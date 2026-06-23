
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { usePlan } from '@/contexts/PlanContext';
import { useAuth } from '@/contexts/AuthContext';
import { openStripePaymentLink, openStripePortal, openVipCeoWhatsApp, PurchasablePlan } from '@/services/stripe';
import { supabase } from '@/lib/supabase';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

// ═══════════════════════════════════════════════════════════════
// PALETA VIP — negro elegante + dorado premium
// ═══════════════════════════════════════════════════════════════
const VIP_COLORS = {
  black: '#0A0A0A',
  blackSoft: '#1A1A1A',
  gold: '#D4AF37',
  goldSoft: '#E8C76C',
  goldDark: '#A88928',
  goldBg: '#FFF8E1',
};

const PLAN_FEATURES = {
  Gratuito: [
    'Perfil del negocio',
    'Configuración de horarios',
    'Catálogo de servicios (visualización)',
    'Link de citas público',
    'Citas desde la app y desde el link',
    'Hasta 10 citas al mes (combinadas)',
    'Recordatorios WhatsApp automáticos',
    'Gestión básica de clientes',
    'Sin reportes de ingresos',
    'Sin soporte con IA',
  ],
  Basico: [
    'Todo lo del Plan Básico',
    'Citas ilimitadas desde la app y link público',
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
    'Todo lo del Plan Premium',
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

// Beneficios EXCLUSIVOS de los planes VIP (suma a lo del plan base)
const VIP_BENEFITS = [
  'Comunicación directa con el CEO/Director de Operaciones por WhatsApp',
  'Capacitación 1-a-1 sobre el uso de la herramienta',
  'Sesiones estratégicas de crecimiento para tu negocio',
  'Configuración inicial asistida (servicios, horarios, plantillas)',
  'Capacitación personalizada para tu equipo',
  'Capacitación para 1 colaborador adicional sin costo',
  'Acceso anticipado a nuevas funciones',
  '1 mes GRATIS al pagar la anualidad completa',
];

const PLAN_LABEL: Record<string, string> = {
  Gratuito: 'Básico',
  Basico: 'Premium', 'Básico': 'Premium',
  Premium: 'Luxury',
  VipBasico: 'VIP Premium',
  VipPremium: 'VIP Luxury',
};
const PLAN_PRICE: Record<string, string> = {
  Gratuito: '$0 MXN',
  Basico: '$399 MXN / mes', 'Básico': '$399 MXN / mes',
  Premium: '$799 MXN / mes',
  VipBasico: '$4,390 MXN / año',
  VipPremium: '$8,790 MXN / año',
};
const PLAN_EMOJI: Record<string, string> = {
  Gratuito: '🌱',
  Basico: '🚀', 'Básico': '🚀',
  Premium: '⭐',
  VipBasico: '💎',
  VipPremium: '👑',
};

interface SubscriptionDetails {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  updated_at: string | null;
  created_at: string | null;
  status: string | null;
}

// Traducción de los estados crudos de Stripe a etiquetas en español
const STRIPE_STATUS_LABELS: Record<string, string> = {
  active: 'Activa',
  past_due: 'Pago pendiente',
  canceled: 'Cancelada',
  trialing: 'Prueba',
  unpaid: 'Sin pagar',
  incomplete: 'Incompleta',
  incomplete_expired: 'Expirada',
};

export default function SubscriptionScreen() {
  const router = useRouter();
  const {
    plan, loading,
    isGratuito, isBasico, isPremium,
    isVip, isVipBasico, isVipPremium,
    daysUntilVipExpiry,
  } = usePlan();
  const { user } = useAuth();
  const [confirmModal, setConfirmModal] = useState<{ visible: boolean; target: PurchasablePlan | null }>({ visible: false, target: null });
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });
  const [portalLoading, setPortalLoading] = useState(false);
  const [subDetails, setSubDetails] = useState<SubscriptionDetails | null>(null);
  const [businessName, setBusinessName] = useState<string>('');

  const currentPlan = plan.planType;
  const currentPlanLabel = PLAN_LABEL[currentPlan] || 'Básico';
  const priceLabel = PLAN_PRICE[currentPlan] || '$0 MXN';
  const emoji = PLAN_EMOJI[currentPlan] || '🌱';
  const hasPaidPlan = isBasico || isPremium;

  // App Store Guideline 3.1.1: en iOS no se permite vender ni enlazar a la
  // compra externa (Stripe) de suscripciones digitales. Ocultamos toda la UI
  // de compra/portal SOLO en iOS; web y Android conservan el flujo completo.
  const isIOS = Platform.OS === 'ios';

  useEffect(() => {
    if (user?.id && hasPaidPlan) loadSubscriptionDetails();
    if (user?.id) loadBusinessName();
  }, [user?.id, hasPaidPlan]);

  const loadSubscriptionDetails = async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase
        .from('subscription_plans')
        .select('stripe_customer_id, stripe_subscription_id, updated_at, created_at, status')
        .eq('user_id', user.id)
        .single();
      if (data) setSubDetails(data);
    } catch (e) {
      console.error('[Subscription] Error loading details:', e);
    }
  };

  const loadBusinessName = async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase
        .from('business_profiles')
        .select('business_name')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data?.business_name) setBusinessName(data.business_name);
    } catch (e) {
      console.error('[Subscription] Error loading business name:', e);
    }
  };

  const handleActivatePlan = (target: PurchasablePlan) => setConfirmModal({ visible: true, target });

  const handleConfirmRedirect = () => {
    const target = confirmModal.target;
    setConfirmModal({ visible: false, target: null });
    if (!target || !user?.id) {
      setErrorModal({ visible: true, message: 'Error: No se pudo obtener tu ID de usuario.' });
      return;
    }
    openStripePaymentLink(target, user.id);
  };

  const handleOpenPortal = async () => {
    if (!user?.id) { setErrorModal({ visible: true, message: 'Error: No se pudo obtener tu ID de usuario.' }); return; }
    setPortalLoading(true);
    const result = await openStripePortal(user.id);
    setPortalLoading(false);
    if (!result.success) setErrorModal({ visible: true, message: result.error || 'No se pudo abrir el portal.' });
  };

  const handleContactCeo = () => {
    openVipCeoWhatsApp(businessName);
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  // Modal de confirmación: nombre y precio según target
  const targetDisplayName = (() => {
    switch (confirmModal.target) {
      case 'basico': return 'Premium';
      case 'premium': return 'Luxury';
      case 'vip_basico': return 'VIP Premium Anual';
      case 'vip_premium': return 'VIP Luxury Anual';
      default: return '';
    }
  })();
  const targetDisplayPrice = (() => {
    switch (confirmModal.target) {
      case 'basico': return '$399 MXN/mes';
      case 'premium': return '$799 MXN/mes';
      case 'vip_basico': return '$4,390 MXN/año (ahorras 1 mes)';
      case 'vip_premium': return '$8,790 MXN/año (ahorras 1 mes)';
      default: return '';
    }
  })();

  const getNextBillingDate = () => {
    if (!subDetails?.updated_at) return null;
    const lastUpdate = new Date(subDetails.updated_at);
    const next = new Date(lastUpdate);
    // Anual o mensual según billing_cycle
    if (plan.billingCycle === 'annual') {
      next.setFullYear(next.getFullYear() + 1);
    } else {
      next.setDate(next.getDate() + 30);
    }
    return next;
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return '—';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const nextBilling = getNextBillingDate();

  return (
    <SafeAreaView style={s.container}>
      <ConfirmModal
        visible={confirmModal.visible}
        title={`Activar Plan ${targetDisplayName}`}
        message={`Serás redirigido a la página de pago seguro de Stripe para completar tu suscripción de ${targetDisplayPrice}.\n\n¿Continuar?`}
        buttons={[
          { text: 'Cancelar', onPress: () => setConfirmModal({ visible: false, target: null }), style: 'cancel' },
          { text: 'Ir al pago →', onPress: handleConfirmRedirect, style: 'default' }
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
        <View style={[s.currentCard, isVip && s.currentCardVip]}>
          <View style={s.currentRow}>
            <View style={[
              s.currentIconBox,
              {
                backgroundColor: isVip ? VIP_COLORS.black
                  : isPremium ? '#EDE9FE'
                  : isBasico ? '#ECFDF5'
                  : '#F1F5F9'
              }
            ]}>
              <Text style={s.currentEmoji}>{emoji}</Text>
            </View>
            <View style={s.currentInfo}>
              <Text style={[s.currentLabel, isVip && { color: VIP_COLORS.goldDark }]}>
                {isVip ? '⭐ PLAN VIP ACTUAL' : 'Plan actual'}
              </Text>
              <Text style={[
                s.currentName,
                {
                  color: isVip ? VIP_COLORS.black
                    : isPremium ? '#6366F1'
                    : isBasico ? '#10B981'
                    : '#64748B'
                }
              ]}>{currentPlanLabel}</Text>
              <Text style={s.currentPrice}>{priceLabel}</Text>
            </View>
          </View>

          {/* Sección exclusiva VIP — botón Contactar a Antonio */}
          {isVip && (
            <View style={s.vipPanel}>
              <View style={s.vipPanelHeader}>
                <MaterialIcons name="stars" size={18} color={VIP_COLORS.gold} />
                <Text style={s.vipPanelTitle}>Tu contacto directo</Text>
              </View>
              <Text style={s.vipPanelText}>
                Antonio López, CEO/Director de Operaciones de VYLTA, está disponible para ti por WhatsApp.
              </Text>
              <TouchableOpacity style={s.vipCtaBtn} onPress={handleContactCeo}>
                <MaterialIcons name="chat" size={18} color={VIP_COLORS.gold} />
                <Text style={s.vipCtaBtnText}>Contactar a Antonio</Text>
                <MaterialIcons name="open-in-new" size={14} color={VIP_COLORS.goldSoft} />
              </TouchableOpacity>

              {daysUntilVipExpiry !== null && (
                <View style={s.vipExpiryRow}>
                  <MaterialIcons name="event-available" size={14} color={VIP_COLORS.goldDark} />
                  <Text style={s.vipExpiryText}>
                    Tu plan VIP se renueva en {daysUntilVipExpiry} días
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Detalles de suscripción — solo para planes de pago */}
          {hasPaidPlan && subDetails && (
            <View style={s.detailsSection}>
              <View style={s.detailsDivider} />

              <View style={s.detailRow}>
                <View style={s.detailIconWrap}>
                  <MaterialIcons name="event" size={16} color="#3B82F6" />
                </View>
                <View style={s.detailTextWrap}>
                  <Text style={s.detailLabel}>Suscrito desde</Text>
                  <Text style={s.detailValue}>{formatDate(subDetails.created_at)}</Text>
                </View>
              </View>

              <View style={s.detailRow}>
                <View style={s.detailIconWrap}>
                  <MaterialIcons name="autorenew" size={16} color="#10B981" />
                </View>
                <View style={s.detailTextWrap}>
                  <Text style={s.detailLabel}>{isVip ? 'Renovación anual' : 'Próximo cobro'}</Text>
                  <Text style={s.detailValue}>{nextBilling ? formatDate(nextBilling) : '—'}</Text>
                </View>
              </View>

              <View style={s.detailRow}>
                <View style={s.detailIconWrap}>
                  <MaterialIcons name="verified" size={16} color="#10B981" />
                </View>
                <View style={s.detailTextWrap}>
                  <Text style={s.detailLabel}>Estado</Text>
                  <View style={s.statusBadgeRow}>
                    <View style={[s.statusBadge, { backgroundColor: subDetails.status === 'active' ? '#ECFDF5' : '#FEF3C7' }]}>
                      <View style={[s.statusDot, { backgroundColor: subDetails.status === 'active' ? '#10B981' : '#F59E0B' }]} />
                      <Text style={[s.statusBadgeText, { color: subDetails.status === 'active' ? '#065F46' : '#92400E' }]}>
                        {(subDetails.status ? STRIPE_STATUS_LABELS[subDetails.status] : undefined) ?? 'Desconocido'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Botón Gestionar suscripción — oculto en iOS (Guideline 3.1.1) */}
          {!isIOS && hasPaidPlan && (
            <TouchableOpacity style={s.manageBtn} onPress={handleOpenPortal} disabled={portalLoading}>
              {portalLoading ? <ActivityIndicator size="small" color="#6366F1" /> : <MaterialIcons name="settings" size={18} color="#6366F1" />}
              <Text style={s.manageBtnText}>{portalLoading ? 'Abriendo portal...' : 'Gestionar suscripción'}</Text>
              {!portalLoading && <MaterialIcons name="open-in-new" size={14} color="#94A3B8" />}
            </TouchableOpacity>
          )}
          {!isIOS && hasPaidPlan && (
            <Text style={s.manageHint}>Cambiar método de pago, ver facturas o cancelar tu suscripción</Text>
          )}

          {isGratuito && (
            <View style={s.upgradeBanner}>
              <Text style={s.upgradeBannerText}>
                💡 Tu Plan Básico permite hasta 10 citas al mes. Actualiza al Plan Premium para citas ilimitadas.
              </Text>
            </View>
          )}
        </View>

        <Text style={s.sectionLabel}>PLANES DISPONIBLES</Text>

        {/* Plan Básico ($0) */}
        <View style={[s.planCard, isGratuito && s.planCardActive]}>
          <View style={s.planHeader}>
            <Text style={s.planName}>🌱 Básico</Text>
            {isGratuito && <View style={s.activeBadge}><Text style={s.activeBadgeText}>Tu plan actual</Text></View>}
          </View>
          <Text style={s.planPriceTag}>$0 MXN</Text>
          <Text style={s.planPeriod}>hasta 10 citas al mes</Text>
          <View style={s.features}>
            {PLAN_FEATURES.Gratuito.map((f, i) => {
              const isLimit = f.startsWith('Sin');
              return (<View key={i} style={s.featureRow}><MaterialIcons name={isLimit ? 'close' : 'check'} size={16} color={isLimit ? '#EF4444' : '#94A3B8'} /><Text style={[s.featureText, { color: isLimit ? '#EF4444' : colors.textSecondary }]}>{f}</Text></View>);
            })}
          </View>
        </View>

        {/* Plan Premium ($399) */}
        <View style={[s.planCard, isBasico && !isVipBasico && s.planCardActive]}>
          <View style={s.planHeader}>
            <Text style={s.planName}>🚀 Premium</Text>
            {isBasico && !isVipBasico && <View style={s.activeBadge}><Text style={s.activeBadgeText}>Tu plan actual</Text></View>}
          </View>
          <Text style={s.planPriceTag}>$399 MXN</Text>
          <Text style={s.planPeriod}>por mes</Text>
          <View style={s.features}>
            {PLAN_FEATURES.Basico.map((f, i) => {
              const isAI = f.includes('IA');
              return (<View key={i} style={s.featureRow}><MaterialIcons name="check" size={16} color={isAI ? '#10B981' : colors.primary} /><Text style={[s.featureText, isAI && s.featureAI]}>{f}</Text>{isAI && (<View style={s.aiChip}><MaterialIcons name="auto-awesome" size={10} color="#10B981" /><Text style={s.aiChipText}>IA</Text></View>)}</View>);
            })}
          </View>
          {!isIOS && isGratuito && (<TouchableOpacity style={s.ctaBtn} onPress={() => handleActivatePlan('basico')}><MaterialIcons name="lock-open" size={18} color="#fff" /><Text style={s.ctaBtnText}>Activar Plan Premium</Text></TouchableOpacity>)}
        </View>

        {/* Plan Luxury ($799) */}
        <View style={[s.planCard, s.planCardPremium, isPremium && !isVipPremium && s.planCardPremiumActive]}>
          <View style={s.premiumBadge}><Text style={s.premiumBadgeText}>⭐ RECOMENDADO</Text></View>
          <View style={s.planHeader}>
            <Text style={[s.planName, { color: '#6366F1' }]}>Luxury</Text>
            {isPremium && !isVipPremium && <View style={[s.activeBadge, { backgroundColor: '#6366F1' }]}><Text style={s.activeBadgeText}>Tu plan actual</Text></View>}
          </View>
          <Text style={[s.planPriceTag, { color: '#6366F1' }]}>$799 MXN</Text>
          <Text style={s.planPeriod}>por mes</Text>
          <View style={s.features}>
            {PLAN_FEATURES.Premium.map((f, i) => {
              const isAI = f.includes('IA');
              return (<View key={i} style={s.featureRow}><MaterialIcons name="check" size={16} color="#6366F1" /><Text style={[s.featureText, isAI && s.featureAIPremium]}>{f}</Text>{isAI && (<View style={[s.aiChip, { backgroundColor: '#EEF2FF', borderColor: '#6366F1' }]}><MaterialIcons name="auto-awesome" size={10} color="#6366F1" /><Text style={[s.aiChipText, { color: '#6366F1' }]}>IA</Text></View>)}</View>);
            })}
          </View>
          {!isIOS && !isPremium && !isVipPremium && (<TouchableOpacity style={[s.ctaBtn, { backgroundColor: '#6366F1' }]} onPress={() => handleActivatePlan('premium')}><MaterialIcons name="lock-open" size={18} color="#fff" /><Text style={s.ctaBtnText}>Activar Plan Luxury</Text></TouchableOpacity>)}
        </View>

        {/* ═════════════════════════════════════════════════════════ */}
        {/*  PLANES VIP ANUALES — diseño negro + dorado premium       */}
        {/* ═════════════════════════════════════════════════════════ */}
        <View style={s.vipSectionDivider}>
          <View style={s.vipDividerLine} />
          <View style={s.vipDividerCenter}>
            <MaterialIcons name="diamond" size={16} color={VIP_COLORS.gold} />
            <Text style={s.vipDividerText}>PLANES VIP · ANUALES</Text>
            <MaterialIcons name="diamond" size={16} color={VIP_COLORS.gold} />
          </View>
          <View style={s.vipDividerLine} />
        </View>

        <Text style={s.vipIntroText}>
          Beneficios premium incluidos en TODOS los planes VIP:
        </Text>

        <View style={s.vipBenefitsCard}>
          {VIP_BENEFITS.map((b, i) => (
            <View key={i} style={s.vipBenefitRow}>
              <MaterialIcons name="auto-awesome" size={14} color={VIP_COLORS.gold} />
              <Text style={s.vipBenefitText}>{b}</Text>
            </View>
          ))}
        </View>

        {/* Plan VIP Premium ($4,390/año) */}
        <View style={[s.vipCard, isVipBasico && s.vipCardActive]}>
          <View style={s.vipSaveBadge}>
            <MaterialIcons name="savings" size={11} color={VIP_COLORS.black} />
            <Text style={s.vipSaveBadgeText}>AHORRAS 1 MES</Text>
          </View>
          <View style={s.planHeader}>
            <Text style={s.vipPlanName}>💎 VIP Premium</Text>
            {isVipBasico && <View style={s.vipActiveBadge}><Text style={s.vipActiveBadgeText}>Tu plan actual</Text></View>}
          </View>
          <View style={s.vipPriceRow}>
            <Text style={s.vipPriceTag}>$4,390 MXN</Text>
            <Text style={s.vipPriceUnit}>/ año</Text>
          </View>
          <Text style={s.vipPriceEquiv}>Equivalente a $399 × 11 meses (1 mes gratis)</Text>

          <View style={s.vipFeatureLine}>
            <MaterialIcons name="check-circle" size={16} color={VIP_COLORS.gold} />
            <Text style={s.vipIncludesText}>Todo lo del Plan Premium</Text>
          </View>
          <View style={s.vipFeatureLine}>
            <MaterialIcons name="stars" size={16} color={VIP_COLORS.gold} />
            <Text style={s.vipIncludesText}>+ los 8 beneficios VIP exclusivos arriba</Text>
          </View>

          {!isIOS && !isVipBasico && !isVipPremium && (
            <TouchableOpacity style={s.vipPurchaseBtn} onPress={() => handleActivatePlan('vip_basico')}>
              <MaterialIcons name="workspace-premium" size={18} color={VIP_COLORS.gold} />
              <Text style={s.vipPurchaseBtnText}>Activar VIP Premium</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Plan VIP Luxury ($8,790/año) */}
        <View style={[s.vipCard, s.vipCardLuxury, isVipPremium && s.vipCardActive]}>
          <View style={s.vipExclusiveBadge}>
            <MaterialIcons name="diamond" size={11} color={VIP_COLORS.gold} />
            <Text style={s.vipExclusiveBadgeText}>EXCLUSIVO</Text>
          </View>
          <View style={s.planHeader}>
            <Text style={s.vipPlanName}>👑 VIP Luxury</Text>
            {isVipPremium && <View style={s.vipActiveBadge}><Text style={s.vipActiveBadgeText}>Tu plan actual</Text></View>}
          </View>
          <View style={s.vipPriceRow}>
            <Text style={s.vipPriceTag}>$8,790 MXN</Text>
            <Text style={s.vipPriceUnit}>/ año</Text>
          </View>
          <Text style={s.vipPriceEquiv}>Equivalente a $799 × 11 meses (1 mes gratis)</Text>

          <View style={s.vipFeatureLine}>
            <MaterialIcons name="check-circle" size={16} color={VIP_COLORS.gold} />
            <Text style={s.vipIncludesText}>Todo lo del Plan Luxury (5 colaboradores, etc.)</Text>
          </View>
          <View style={s.vipFeatureLine}>
            <MaterialIcons name="stars" size={16} color={VIP_COLORS.gold} />
            <Text style={s.vipIncludesText}>+ los 8 beneficios VIP exclusivos arriba</Text>
          </View>

          {!isIOS && !isVipPremium && (
            <TouchableOpacity style={s.vipPurchaseBtn} onPress={() => handleActivatePlan('vip_premium')}>
              <MaterialIcons name="workspace-premium" size={18} color={VIP_COLORS.gold} />
              <Text style={s.vipPurchaseBtnText}>Activar VIP Luxury</Text>
            </TouchableOpacity>
          )}
        </View>

        {!isIOS && (
          <View style={s.secureNote}>
            <MaterialIcons name="lock" size={14} color="#94A3B8" />
            <Text style={s.secureNoteText}>Pago seguro procesado por Stripe. Puedes cancelar tu suscripción en cualquier momento desde "Gestionar suscripción".</Text>
          </View>
        )}

        {/* iOS (Guideline 3.1.1): nota informativa, sin compra ni enlaces externos */}
        {isIOS && (
          <View style={s.secureNote}>
            <MaterialIcons name="info-outline" size={14} color="#94A3B8" />
            <Text style={s.secureNoteText}>
              {isGratuito
                ? 'Tu plan actual es Gratuito. Para activar Premium o Luxury, administra tu suscripción desde tu cuenta de VYLTA en vylta.lat.'
                : 'Administra o cancela tu suscripción desde tu cuenta de VYLTA en vylta.lat.'}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { padding: 4 },
  title: { fontSize: 20, fontWeight: 'bold', color: colors.text },
  scroll: { padding: 20, paddingBottom: 60 },

  currentCard: { backgroundColor: colors.card, borderRadius: 16, padding: 20, marginBottom: 24, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  currentCardVip: { borderWidth: 2, borderColor: VIP_COLORS.gold, backgroundColor: '#FFFEF7' },
  currentRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  currentIconBox: { width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  currentEmoji: { fontSize: 28 },
  currentInfo: { flex: 1 },
  currentLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  currentName: { fontSize: 22, fontWeight: '800', marginTop: 2 },
  currentPrice: { fontSize: 14, color: colors.textSecondary, marginTop: 3, fontWeight: '500' },

  // Panel VIP dentro de la tarjeta del plan actual
  vipPanel: { marginTop: 16, padding: 16, borderRadius: 12, backgroundColor: VIP_COLORS.black, borderWidth: 1, borderColor: VIP_COLORS.gold },
  vipPanelHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  vipPanelTitle: { color: VIP_COLORS.gold, fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  vipPanelText: { color: '#FFFFFF', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  vipCtaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: VIP_COLORS.blackSoft, borderWidth: 1, borderColor: VIP_COLORS.gold, borderRadius: 10, paddingVertical: 12 },
  vipCtaBtnText: { color: VIP_COLORS.gold, fontSize: 14, fontWeight: '700' },
  vipExpiryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  vipExpiryText: { fontSize: 12, color: VIP_COLORS.goldSoft, fontWeight: '500' },

  detailsSection: { marginTop: 4 },
  detailsDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  detailIconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  detailTextWrap: { flex: 1 },
  detailLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  detailValue: { fontSize: 15, color: colors.text, fontWeight: '600', marginTop: 2 },
  statusBadgeRow: { flexDirection: 'row', marginTop: 4 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },

  manageBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, borderColor: '#6366F1', backgroundColor: '#F5F3FF' },
  manageBtnText: { fontSize: 14, fontWeight: '600', color: '#6366F1' },
  manageHint: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 16 },

  upgradeBanner: { marginTop: 14, backgroundColor: '#ECFDF5', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#10B981' },
  upgradeBannerText: { fontSize: 13, color: '#065F46', lineHeight: 18 },

  sectionLabel: { fontSize: 11, fontWeight: '800', color: colors.textSecondary, marginBottom: 12, letterSpacing: 1 },

  // Planes mensuales (sin cambios mayores)
  planCard: { backgroundColor: colors.card, borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1.5, borderColor: 'transparent', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  planCardActive: { borderColor: colors.primary },
  planCardPremium: { borderColor: '#C7D2FE' },
  planCardPremiumActive: { borderColor: '#6366F1' },
  premiumBadge: { alignSelf: 'flex-start', backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 12 },
  premiumBadgeText: { fontSize: 11, fontWeight: '800', color: '#6366F1' },
  planHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  planName: { fontSize: 20, fontWeight: '700', color: colors.text },
  activeBadge: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  activeBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  planPriceTag: { fontSize: 28, fontWeight: '800', color: colors.text },
  planPeriod: { fontSize: 13, color: colors.textSecondary, marginBottom: 16 },
  features: { gap: 10 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { fontSize: 14, color: colors.text, flex: 1 },
  featureAI: { color: '#065F46', fontWeight: '600' },
  featureAIPremium: { color: '#3730A3', fontWeight: '600' },
  aiChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 0.5, borderColor: '#10B981' },
  aiChipText: { fontSize: 9, fontWeight: '800', color: '#10B981' },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 12, padding: 14, marginTop: 18 },
  ctaBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ═══════ Sección VIP — divisor visual ═══════
  vipSectionDivider: { flexDirection: 'row', alignItems: 'center', marginTop: 32, marginBottom: 16 },
  vipDividerLine: { flex: 1, height: 1, backgroundColor: VIP_COLORS.gold, opacity: 0.4 },
  vipDividerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  vipDividerText: { fontSize: 11, fontWeight: '800', color: VIP_COLORS.goldDark, letterSpacing: 1.5 },

  // ═══════ Card resumen de beneficios VIP ═══════
  vipIntroText: { fontSize: 13, color: colors.textSecondary, marginBottom: 12, fontStyle: 'italic' },
  vipBenefitsCard: { backgroundColor: VIP_COLORS.black, borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: VIP_COLORS.gold, gap: 10 },
  vipBenefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  vipBenefitText: { color: '#FFFFFF', fontSize: 13, lineHeight: 18, flex: 1 },

  // ═══════ Cards VIP (negro + dorado) ═══════
  vipCard: {
    backgroundColor: VIP_COLORS.black,
    borderRadius: 16, padding: 20, marginBottom: 16,
    borderWidth: 1.5, borderColor: VIP_COLORS.gold,
    shadowColor: VIP_COLORS.gold, shadowOpacity: 0.15, shadowRadius: 10, elevation: 3,
  },
  vipCardLuxury: { borderWidth: 2 },
  vipCardActive: { backgroundColor: VIP_COLORS.blackSoft, borderColor: VIP_COLORS.goldSoft },
  vipSaveBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: VIP_COLORS.gold, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 12 },
  vipSaveBadgeText: { fontSize: 10, fontWeight: '900', color: VIP_COLORS.black, letterSpacing: 0.5 },
  vipExclusiveBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: VIP_COLORS.blackSoft, borderWidth: 1, borderColor: VIP_COLORS.gold, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 12 },
  vipExclusiveBadgeText: { fontSize: 10, fontWeight: '900', color: VIP_COLORS.gold, letterSpacing: 0.5 },
  vipPlanName: { fontSize: 22, fontWeight: '800', color: VIP_COLORS.gold },
  vipActiveBadge: { backgroundColor: VIP_COLORS.gold, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  vipActiveBadgeText: { fontSize: 11, fontWeight: '800', color: VIP_COLORS.black },
  vipPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 },
  vipPriceTag: { fontSize: 30, fontWeight: '900', color: '#FFFFFF' },
  vipPriceUnit: { fontSize: 14, color: VIP_COLORS.goldSoft, fontWeight: '600' },
  vipPriceEquiv: { fontSize: 12, color: VIP_COLORS.goldSoft, marginTop: 4, marginBottom: 16, fontStyle: 'italic' },
  vipFeatureLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  vipIncludesText: { color: '#FFFFFF', fontSize: 13, flex: 1 },
  vipPurchaseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: VIP_COLORS.gold, borderRadius: 12, padding: 14, marginTop: 16 },
  vipPurchaseBtnText: { color: VIP_COLORS.black, fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },

  secureNote: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 10, padding: 12, marginTop: 4 },
  secureNoteText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
});
