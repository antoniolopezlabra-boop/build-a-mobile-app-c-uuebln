
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { apiGet, apiPut } from '@/utils/api';
import { usePlan } from '@/contexts/PlanContext';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface WhatsAppConfig {
  apiKey?: string;
  phoneNumber?: string;
  isConnected: boolean;
  reminder24h: boolean;
  reminder2h: boolean;
  confirmationOnBooking: boolean;
  waitlistNotification: boolean;
}

export default function WhatsAppSettingsScreen() {
  const router = useRouter();
  const { isBasico, isPremium } = usePlan();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });
  const [successModal, setSuccessModal] = useState({ visible: false, message: '' });

  useEffect(() => { loadConfig(); }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await apiGet<WhatsAppConfig | null>('/api/whatsapp-config');
      setConfig(data || {
        isConnected: false, reminder24h: true, reminder2h: true,
        confirmationOnBooking: true, waitlistNotification: false,
      });
    } catch {
      setConfig({
        isConnected: false, reminder24h: true, reminder2h: true,
        confirmationOnBooking: true, waitlistNotification: false,
      });
    } finally {
      setLoading(false);
    }
  };

  const updateToggle = async (field: keyof WhatsAppConfig, value: boolean) => {
    if (!config) return;
    const prev = config;
    setConfig({ ...config, [field]: value });
    try {
      await apiPut('/api/whatsapp-config', { ...config, [field]: value });
    } catch {
      setConfig(prev);
      setErrorModal({ visible: true, message: 'Error al guardar la configuración' });
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ConfirmModal visible={errorModal.visible} title="Error" message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'cancel' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })} />
      <ConfirmModal visible={successModal.visible} title="¡Listo!" message={successModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setSuccessModal({ visible: false, message: '' }), style: 'default' }]}
        onDismiss={() => setSuccessModal({ visible: false, message: '' })} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <MaterialIcons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={s.headerMid}>
          <Text style={s.title}>WhatsApp Business</Text>
          <Text style={s.subtitle}>Recordatorios automáticos</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── PLAN BÁSICO ── */}
        {(isBasico || isPremium) && (
          <>
            {/* Banner cómo funciona */}
            <View style={s.infoBanner}>
              <View style={s.infoBannerIcon}>
                <MaterialIcons name="chat" size={24} color="#25D366" />
              </View>
              <View style={s.infoBannerText}>
                <Text style={s.infoBannerTitle}>VYLTA envía los mensajes por ti</Text>
                <Text style={s.infoBannerDesc}>
                  Tus clientes reciben WhatsApp automáticos desde el número verificado de VYLTA.
                  {isPremium ? ' Con tu plan Premium puedes conectar tu propio número.' : ' No necesitas configurar nada — solo activa lo que quieras.'}
                </Text>
              </View>
            </View>

            {/* Así lo ve tu cliente */}
            <Text style={s.sectionLabel}>ASÍ LO VE TU CLIENTE</Text>
            <View style={s.chatPreview}>
              <View style={s.chatHeader}>
                <View style={s.chatAvatar}>
                  <MaterialIcons name="storefront" size={16} color="#fff" />
                </View>
                <View>
                  <Text style={s.chatName}>
                    {isPremium ? 'Tu Negocio (tu número)' : 'VYLTA • Notificaciones'}
                  </Text>
                  <Text style={s.chatStatus}>En línea</Text>
                </View>
              </View>
              <View style={s.chatBubble}>
                <Text style={s.chatText}>
                  {'Hola 👋 Te recordamos tu cita en *Tu Negocio* mañana a las 10:00 AM.\n\n¿Confirmas tu asistencia?\n\n1️⃣ Sí, confirmo\n2️⃣ Reagendar\n3️⃣ Cancelar'}
                </Text>
                <Text style={s.chatTime}>10:32 AM ✓✓</Text>
              </View>
            </View>

            {/* Automatizaciones */}
            <Text style={s.sectionLabel}>MENSAJES AUTOMÁTICOS</Text>
            <View style={s.automationsCard}>

              <View style={s.autoRow}>
                <View style={s.autoIcon}>
                  <MaterialIcons name="check-circle" size={20} color="#10B981" />
                </View>
                <View style={s.autoInfo}>
                  <Text style={s.autoTitle}>Confirmación al agendar</Text>
                  <Text style={s.autoDesc}>WhatsApp inmediato al crear la cita</Text>
                </View>
                <Switch
                  value={config?.confirmationOnBooking || false}
                  onValueChange={v => updateToggle('confirmationOnBooking', v)}
                  trackColor={{ false: '#E2E8F0', true: '#25D366' }}
                  thumbColor="#fff"
                />
              </View>

              <View style={s.divider} />

              <View style={s.autoRow}>
                <View style={[s.autoIcon, { backgroundColor: '#EFF6FF' }]}>
                  <MaterialIcons name="schedule" size={20} color="#3B82F6" />
                </View>
                <View style={s.autoInfo}>
                  <Text style={s.autoTitle}>Recordatorio 24 horas antes</Text>
                  <Text style={s.autoDesc}>Con botones Confirmar / Reagendar / Cancelar</Text>
                </View>
                <Switch
                  value={config?.reminder24h || false}
                  onValueChange={v => updateToggle('reminder24h', v)}
                  trackColor={{ false: '#E2E8F0', true: '#3B82F6' }}
                  thumbColor="#fff"
                />
              </View>

              <View style={s.divider} />

              <View style={s.autoRow}>
                <View style={[s.autoIcon, { backgroundColor: '#FFFBEB' }]}>
                  <MaterialIcons name="alarm" size={20} color="#F59E0B" />
                </View>
                <View style={s.autoInfo}>
                  <Text style={s.autoTitle}>Recordatorio 2 horas antes</Text>
                  <Text style={s.autoDesc}>Solo si el cliente no confirmó en el de 24h</Text>
                </View>
                <Switch
                  value={config?.reminder2h || false}
                  onValueChange={v => updateToggle('reminder2h', v)}
                  trackColor={{ false: '#E2E8F0', true: '#F59E0B' }}
                  thumbColor="#fff"
                />
              </View>

            </View>

            {/* Estado de activación */}
            <View style={s.statusCard}>
              <View style={s.statusRow}>
                <View style={[s.statusDot, { backgroundColor: '#F59E0B' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.statusTitle}>Activación pendiente</Text>
                  <Text style={s.statusDesc}>
                    Los mensajes automáticos se activarán cuando VYLTA complete la verificación del número con Meta. Te notificaremos por email cuando esté listo.
                  </Text>
                </View>
              </View>
            </View>

            {/* Premium: número propio */}
            {isPremium && (
              <>
                <Text style={s.sectionLabel}>TU NÚMERO PROPIO</Text>
                <View style={s.premiumCard}>
                  <View style={s.premiumHeader}>
                    <MaterialIcons name="verified" size={24} color="#6366F1" />
                    <Text style={s.premiumTitle}>Número de WhatsApp Business propio</Text>
                  </View>
                  <Text style={s.premiumDesc}>
                    Con tu plan Premium puedes conectar tu propio número para que tus clientes vean exactamente tu negocio al recibir mensajes.
                  </Text>
                  <View style={s.comingSoonBadge}>
                    <Text style={s.comingSoonText}>Próximamente — en configuración</Text>
                  </View>
                </View>
              </>
            )}

            {/* Si es Básico: mostrar diferencia con Premium */}
            {isBasico && (
              <>
                <Text style={s.sectionLabel}>¿QUIERES MÁS CONFIANZA?</Text>
                <TouchableOpacity style={s.upgradeCard} onPress={() => router.push('/settings/subscription')} activeOpacity={0.85}>
                  <View style={s.upgradeLeft}>
                    <Text style={s.upgradeEmoji}>⭐</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.upgradeTitle}>Plan Premium</Text>
                      <Text style={s.upgradeDesc}>Tus clientes ven tu propio número de WhatsApp — mayor confianza y reconocimiento de marca.</Text>
                    </View>
                  </View>
                  <MaterialIcons name="arrow-forward-ios" size={16} color="#6366F1" />
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0',
  },
  back: { padding: 4 },
  headerMid: { flex: 1, paddingHorizontal: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 12, color: '#94A3B8', marginTop: 1 },
  scroll: { padding: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.2, marginBottom: 10, marginTop: 20 },

  // Banner info
  infoBanner: {
    flexDirection: 'row', gap: 14, backgroundColor: '#F0FDF4',
    borderRadius: 16, padding: 16, marginBottom: 4,
    borderWidth: 0.5, borderColor: '#BBF7D0',
  },
  infoBannerIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center' },
  infoBannerText: { flex: 1 },
  infoBannerTitle: { fontSize: 14, fontWeight: '700', color: '#065F46', marginBottom: 4 },
  infoBannerDesc: { fontSize: 12, color: '#047857', lineHeight: 18 },

  // Preview chat
  chatPreview: {
    backgroundColor: '#E5EFDB', borderRadius: 16, overflow: 'hidden', marginBottom: 4,
  },
  chatHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#075E54', padding: 14,
  },
  chatAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#128C7E', justifyContent: 'center', alignItems: 'center',
  },
  chatName: { fontSize: 14, fontWeight: '700', color: '#fff' },
  chatStatus: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 1 },
  chatBubble: {
    backgroundColor: '#fff', borderRadius: 12, borderTopLeftRadius: 2,
    margin: 14, padding: 12,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  chatText: { fontSize: 13, color: '#0F172A', lineHeight: 20 },
  chatTime: { fontSize: 10, color: '#94A3B8', textAlign: 'right', marginTop: 8 },

  // Automatizaciones
  automationsCard: {
    backgroundColor: '#fff', borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
    overflow: 'hidden',
  },
  autoRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  autoIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center' },
  autoInfo: { flex: 1 },
  autoTitle: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  autoDesc: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  divider: { height: 0.5, backgroundColor: '#F1F5F9', marginLeft: 68 },

  // Estado activación
  statusCard: {
    backgroundColor: '#FFFBEB', borderRadius: 14, padding: 14,
    borderWidth: 0.5, borderColor: '#FDE68A', marginTop: 12,
  },
  statusRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0 },
  statusTitle: { fontSize: 13, fontWeight: '700', color: '#92400E', marginBottom: 4 },
  statusDesc: { fontSize: 12, color: '#B45309', lineHeight: 18 },

  // Premium
  premiumCard: {
    backgroundColor: '#F5F3FF', borderRadius: 16, padding: 16,
    borderWidth: 0.5, borderColor: '#C4B5FD',
  },
  premiumHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  premiumTitle: { fontSize: 15, fontWeight: '700', color: '#3730A3', flex: 1 },
  premiumDesc: { fontSize: 13, color: '#4338CA', lineHeight: 18, marginBottom: 12 },
  comingSoonBadge: {
    backgroundColor: '#EDE9FE', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start',
  },
  comingSoonText: { fontSize: 12, fontWeight: '600', color: '#6366F1' },

  // Upgrade
  upgradeCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#C7D2FE',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  upgradeLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  upgradeEmoji: { fontSize: 24 },
  upgradeTitle: { fontSize: 15, fontWeight: '700', color: '#3730A3', marginBottom: 4 },
  upgradeDesc: { fontSize: 12, color: '#6366F1', lineHeight: 18 },
});
