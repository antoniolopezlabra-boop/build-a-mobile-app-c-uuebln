import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { ConfirmModal } from '@/components/button';
import { apiGet } from '@/utils/api';
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

// ─── Pantalla ACTIVA (todos los planes) ──────────────────────────────────────
// WhatsApp está incluido en todos los planes (Básico, Premium, Luxury).
// Los mensajes salen desde el número compartido VYLTA verificado por Meta.
function ActiveScreen({ isGratuito }: {
  isGratuito: boolean;
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
          Los mensajes salen desde el número oficial de VYLTA — el mismo para todos los negocios en la plataforma. Esto nos permite mantener el servicio incluido en tu plan.
        </Text>
      </View>

      {/* Aviso del límite 10/mes para Plan Básico (ex-Gratuito) */}
      {isGratuito && (
        <View style={s.limitNoteBox}>
          <MaterialIcons name="info" size={18} color="#0369A1" />
          <Text style={s.limitNoteText}>
            Los recordatorios se envían para tus citas dentro del límite mensual de 10 citas del Plan Básico.
          </Text>
        </View>
      )}

      {/* Estado: Sistema Activo */}
      <View style={s.systemActiveBox}>
        <View style={s.systemActiveTop}>
          <MaterialIcons name="verified" size={22} color="#10B981" />
          <Text style={s.systemActiveTitle}>Sistema activo</Text>
        </View>
        <Text style={s.systemActiveDesc}>
          Tus clientes reciben mensajes automáticos desde el número oficial de VYLTA verificado por Meta. No necesitas configurar nada.
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
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });

  useEffect(() => {
    // Carga rápida — la pantalla es informativa, no requiere config del backend
    setLoading(false);
  }, []);

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
            Número compartido VYLTA · Mensajes automáticos
          </Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {/* Todos los planes tienen acceso a la pantalla informativa.
          isGratuito se pasa solo para mostrar el aviso del límite de 10 citas/mes. */}
      <ActiveScreen isGratuito={isGratuito} />
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

  // Banner activo
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

  limitNoteBox:     { flexDirection: 'row', gap: 10, backgroundColor: '#E0F2FE', borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: '#7DD3FC', marginTop: 10 },
  limitNoteText:    { flex: 1, fontSize: 12, color: '#0369A1', lineHeight: 18 },

  // Banner sistema activo (reemplaza al pendingBox)
  systemActiveBox:  { backgroundColor: '#F0FDF4', borderRadius: 14, padding: 16, borderWidth: 0.5, borderColor: '#BBF7D0', marginTop: 20, marginBottom: 12 },
  systemActiveTop:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  systemActiveTitle:{ fontSize: 14, fontWeight: '700', color: '#065F46' },
  systemActiveDesc: { fontSize: 13, color: '#047857', lineHeight: 20 },
});
