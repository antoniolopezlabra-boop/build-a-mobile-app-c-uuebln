import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { ConfirmModal } from '@/components/button';
import { apiGet, apiPut } from '@/utils/api';
import { usePlan } from '@/contexts/PlanContext';
import { useTheme } from '@/contexts/ThemeContext';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface WhatsAppConfig {
  isConnected: boolean;
  reminder24h: boolean;
  reminder2h: boolean;
  confirmationOnBooking: boolean;
  waitlistNotification: boolean;
}

// ─── Burbuja de WhatsApp simulada ─────────────────────────────────────────────
function WaBubble({ text }: { text: string }) {
  return (
    <View style={wb.container}>
      <View style={wb.header}>
        <View style={wb.avatar}>
          <MaterialIcons name="storefront" size={14} color="#fff" />
        </View>
        <Text style={wb.from}>VYLTA • Tu Negocio</Text>
      </View>
      <View style={wb.bubble}>
        <Text style={wb.text}>{text}</Text>
        <Text style={wb.time}>10:32 AM ✓✓</Text>
      </View>
    </View>
  );
}

const wb = StyleSheet.create({
  container:  { backgroundColor: '#E5EFDB', borderRadius: 16, overflow: 'hidden' },
  header:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#075E54', padding: 12 },
  avatar:     { width: 30, height: 30, borderRadius: 15, backgroundColor: '#128C7E', justifyContent: 'center', alignItems: 'center' },
  from:       { fontSize: 13, fontWeight: '700', color: '#fff' },
  bubble:     { backgroundColor: '#fff', margin: 12, borderRadius: 12, borderTopLeftRadius: 2, padding: 12 },
  text:       { fontSize: 13, color: '#0F172A', lineHeight: 20 },
  time:       { fontSize: 10, color: '#94A3B8', textAlign: 'right', marginTop: 6 },
});

// ─── Pantalla Gratuito: upgrade CTA ──────────────────────────────────────────
function GratuitoScreen() {
  const router = useRouter();
  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <View style={s.heroCard}>
        <Text style={s.heroEmoji}>💬</Text>
        <Text style={s.heroTitle}>Automatiza tus recordatorios</Text>
        <Text style={s.heroDesc}>
          Con VYLTA tus clientes reciben mensajes de WhatsApp automáticos al agendar su cita y antes de que llegue el día. Tú no tienes que hacer nada.
        </Text>
      </View>

      <Text style={s.sectionLabel}>LO QUE INCLUYE</Text>
      {[
        { icon: 'check-circle', color: '#10B981', bg: '#ECFDF5', title: 'Confirmación al agendar', desc: 'Tu cliente recibe un WhatsApp en cuanto registras su cita.' },
        { icon: 'schedule',     color: '#3B82F6', bg: '#EFF6FF', title: 'Recordatorio 24 horas antes', desc: 'Un mensaje el día anterior para que no se le olvide.' },
        { icon: 'alarm',        color: '#F59E0B', bg: '#FFFBEB', title: 'Recordatorio 2 horas antes', desc: 'Un segundo aviso el mismo día de la cita.' },
      ].map((item, i) => (
        <View key={i} style={s.featureRow}>
          <View style={[s.featureIcon, { backgroundColor: item.bg }]}>
            <MaterialIcons name={item.icon as any} size={20} color={item.color} />
          </View>
          <View style={s.featureText}>
            <Text style={s.featureTitle}>{item.title}</Text>
            <Text style={s.featureDesc}>{item.desc}</Text>
          </View>
        </View>
      ))}

      <View style={s.upgradeCta}>
        <Text style={s.upgradeCtaLabel}>DISPONIBLE DESDE</Text>
        <Text style={s.upgradeCtaPrice}>Plan Básico — $990 MXN/mes</Text>
        <Text style={s.upgradeCtaDesc}>
          Activa el Plan Básico y VYLTA enviará todos estos mensajes por ti desde un número verificado por Meta.
        </Text>
        <TouchableOpacity style={s.upgradeCtaBtn} onPress={() => router.push('/settings/subscription')}>
          <Text style={s.upgradeCtaBtnText}>Ver planes y activar →</Text>
        </TouchableOpacity>
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Pantalla Básico y Premium: toggles + explicación ────────────────────────
// Con la nueva arquitectura ambos planes usan el número compartido de VYLTA.
// La pantalla Premium ya no tiene flujo de "conecta tu número propio".
function ActiveScreen({ config, onToggle }: {
  config: WhatsAppConfig;
  onToggle: (field: keyof WhatsAppConfig, value: boolean) => void;
}) {
  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

      {/* Banner */}
      <View style={s.activeBanner}>
        <View style={s.activeBannerTop}>
          <View style={s.activeBannerIcon}>
            <MaterialIcons name="check-circle" size={26} color="#10B981" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.activeBannerTitle}>WhatsApp incluido en tu plan</Text>
            <Text style={s.activeBannerSub}>VYLTA envía los mensajes por ti</Text>
          </View>
        </View>
        <Text style={s.activeBannerDesc}>
          Tus clientes reciben los mensajes desde el número oficial de VYLTA, verificado por Meta. No necesitas configurar nada técnico.
        </Text>
      </View>

      {/* Ejemplo visual */}
      <Text style={s.sectionLabel}>ASÍ LO VEN TUS CLIENTES</Text>
      <View style={s.bubbleWrap}>
        <WaBubble
          text={'Hola 👋 Te recordamos tu cita mañana a las 10:00 AM.\nServicio: Uñas acrílicas\n\n¿Confirmas tu asistencia?'}
        />
      </View>

      {/* Cuándo se envían */}
      <Text style={s.sectionLabel}>CUÁNDO SE ENVÍAN LOS MENSAJES</Text>
      <View style={s.timelineCard}>
        {[
          { icon: '📋', time: 'Al agendar',  title: 'Confirmación inmediata',      desc: 'El cliente recibe el detalle de su cita en segundos.',            color: '#10B981' },
          { icon: '🌙', time: '24h antes',   title: 'Recordatorio día anterior',   desc: 'Le avisa con tiempo para que pueda confirmar o cancelar.',        color: '#3B82F6' },
          { icon: '⏰', time: '2h antes',    title: 'Recordatorio final',           desc: 'Un último aviso el mismo día antes de la cita.',                  color: '#F59E0B' },
        ].map((item, i) => (
          <View key={i} style={[s.timelineRow, i < 2 && s.timelineRowBorder]}>
            <Text style={s.timelineEmoji}>{item.icon}</Text>
            <View style={s.timelineInfo}>
              <View style={[s.timeBadge, { backgroundColor: item.color + '20' }]}>
                <Text style={[s.timeBadgeText, { color: item.color }]}>{item.time}</Text>
              </View>
              <Text style={s.timelineTitle}>{item.title}</Text>
              <Text style={s.timelineDesc}>{item.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Nota número compartido */}
      <View style={s.noteBox}>
        <MaterialIcons name="info-outline" size={18} color="#3B82F6" />
        <Text style={s.noteText}>
          Los mensajes salen desde el número oficial de VYLTA — el mismo para todos los negocios en la plataforma. Esto nos permite mantener el servicio incluido en tu plan sin costo adicional.
        </Text>
      </View>

      {/* Toggles */}
      <Text style={s.sectionLabel}>ACTIVAR / DESACTIVAR MENSAJES</Text>
      <View style={s.togglesCard}>
        {[
          { field: 'confirmationOnBooking' as const, icon: 'check-circle', color: '#10B981', bg: '#ECFDF5', title: 'Confirmación al agendar', desc: 'Mensaje inmediato cuando registras una cita' },
          { field: 'reminder24h'           as const, icon: 'schedule',     color: '#3B82F6', bg: '#EFF6FF', title: 'Recordatorio 24h antes',  desc: 'Un día antes de la cita' },
          { field: 'reminder2h'            as const, icon: 'alarm',        color: '#F59E0B', bg: '#FFFBEB', title: 'Recordatorio 2h antes',   desc: 'El mismo día, 2 horas antes' },
        ].map((item, i, arr) => (
          <View key={item.field}>
            <View style={s.toggleRow}>
              <View style={[s.toggleIcon, { backgroundColor: item.bg }]}>
                <MaterialIcons name={item.icon as any} size={20} color={item.color} />
              </View>
              <View style={s.toggleInfo}>
                <Text style={s.toggleTitle}>{item.title}</Text>
                <Text style={s.toggleDesc}>{item.desc}</Text>
              </View>
              <Switch
                value={config[item.field] as boolean}
                onValueChange={v => onToggle(item.field, v)}
                trackColor={{ false: '#E2E8F0', true: item.color }}
                thumbColor="#fff"
              />
            </View>
            {i < arr.length - 1 && <View style={s.toggleDivider} />}
          </View>
        ))}
      </View>

      {/* Estado pendiente de activación WhatsApp */}
      <View style={s.pendingBox}>
        <Text style={s.pendingTitle}>⏳ Activación en progreso</Text>
        <Text style={s.pendingDesc}>
          Los mensajes automáticos se activarán en cuanto VYLTA complete el registro del número con Meta (WhatsApp). Mientras tanto puedes registrar clientes y citas con normalidad.
        </Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function WhatsAppSettingsScreen() {
  const router = useRouter();
  const { isGratuito } = usePlan();
  const { colors: tc } = useTheme();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<WhatsAppConfig>({
    isConnected: false, reminder24h: true, reminder2h: true,
    confirmationOnBooking: true, waitlistNotification: false,
  });
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });

  useEffect(() => { loadConfig(); }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await apiGet<WhatsAppConfig | null>('/api/whatsapp-config');
      if (data) setConfig(data);
    } catch { /* usar defaults */ } finally { setLoading(false); }
  };

  const handleToggle = async (field: keyof WhatsAppConfig, value: boolean) => {
    const prev = config;
    setConfig(c => ({ ...c, [field]: value }));
    try {
      await apiPut('/api/whatsapp-config', { ...config, [field]: value });
    } catch {
      setConfig(prev);
      setErrorModal({ visible: true, message: 'Error al guardar la configuración' });
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]}>
        <View style={s.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>
      <ConfirmModal
        visible={errorModal.visible} title="Error" message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'cancel' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })}
      />

      {/* Header */}
      <View style={[s.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <MaterialIcons name="arrow-back" size={24} color={tc.text} />
        </TouchableOpacity>
        <View style={s.headerMid}>
          <Text style={[s.title, { color: tc.text }]}>WhatsApp Business</Text>
          <Text style={[s.subtitle, { color: tc.textMuted }]}>
            {isGratuito ? 'Disponible desde Plan Básico' : 'Número compartido VYLTA · Mensajes automáticos'}
          </Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {isGratuito
        ? <GratuitoScreen />
        : <ActiveScreen config={config} onToggle={handleToggle} />
      }
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1 },
  loading:          { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5 },
  back:             { padding: 4 },
  headerMid:        { flex: 1, paddingHorizontal: 12 },
  title:            { fontSize: 20, fontWeight: '700' },
  subtitle:         { fontSize: 12, marginTop: 1 },
  scroll:           { padding: 16 },
  sectionLabel:     { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: '#94A3B8', marginBottom: 10, marginTop: 20 },

  // Gratuito
  heroCard:         { backgroundColor: '#ECFDF5', borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 0.5, borderColor: '#BBF7D0', marginBottom: 4 },
  heroEmoji:        { fontSize: 48, marginBottom: 12 },
  heroTitle:        { fontSize: 20, fontWeight: '800', color: '#065F46', marginBottom: 8, textAlign: 'center' },
  heroDesc:         { fontSize: 14, color: '#047857', textAlign: 'center', lineHeight: 22 },
  featureRow:       { flexDirection: 'row', gap: 14, alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  featureIcon:      { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  featureText:      { flex: 1 },
  featureTitle:     { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 3 },
  featureDesc:      { fontSize: 12, color: '#64748B', lineHeight: 18 },
  upgradeCta:       { backgroundColor: '#0F172A', borderRadius: 20, padding: 24, alignItems: 'center', marginTop: 8 },
  upgradeCtaLabel:  { fontSize: 10, fontWeight: '800', color: '#64748B', letterSpacing: 1.5, marginBottom: 6 },
  upgradeCtaPrice:  { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 10 },
  upgradeCtaDesc:   { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  upgradeCtaBtn:    { backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28 },
  upgradeCtaBtnText:{ color: '#fff', fontWeight: '800', fontSize: 15 },

  // Activo (Básico + Premium)
  activeBanner:      { backgroundColor: '#F0FDF4', borderRadius: 16, padding: 16, borderWidth: 0.5, borderColor: '#BBF7D0', marginBottom: 4 },
  activeBannerTop:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  activeBannerIcon:  { width: 48, height: 48, borderRadius: 14, backgroundColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center' },
  activeBannerTitle: { fontSize: 15, fontWeight: '700', color: '#065F46' },
  activeBannerSub:   { fontSize: 12, color: '#10B981', marginTop: 2, fontWeight: '600' },
  activeBannerDesc:  { fontSize: 13, color: '#047857', lineHeight: 20 },

  bubbleWrap:       { marginBottom: 4 },

  timelineCard:     { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1, marginBottom: 4 },
  timelineRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 16 },
  timelineRowBorder:{ borderBottomWidth: 0.5, borderBottomColor: '#F1F5F9' },
  timelineEmoji:    { fontSize: 24, width: 32, textAlign: 'center' },
  timelineInfo:     { flex: 1, gap: 4 },
  timeBadge:        { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  timeBadgeText:    { fontSize: 11, fontWeight: '700' },
  timelineTitle:    { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  timelineDesc:     { fontSize: 12, color: '#64748B', lineHeight: 18 },

  noteBox:          { flexDirection: 'row', gap: 10, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: '#BFDBFE', marginBottom: 4 },
  noteText:         { flex: 1, fontSize: 12, color: '#1E40AF', lineHeight: 18 },

  togglesCard:      { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1, marginBottom: 4 },
  toggleRow:        { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  toggleIcon:       { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  toggleInfo:       { flex: 1 },
  toggleTitle:      { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  toggleDesc:       { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  toggleDivider:    { height: 0.5, backgroundColor: '#F1F5F9', marginLeft: 68 },

  pendingBox:       { backgroundColor: '#FFFBEB', borderRadius: 14, padding: 16, borderWidth: 0.5, borderColor: '#FDE68A', marginBottom: 12 },
  pendingTitle:     { fontSize: 14, fontWeight: '700', color: '#92400E', marginBottom: 6 },
  pendingDesc:      { fontSize: 13, color: '#B45309', lineHeight: 20 },
});
