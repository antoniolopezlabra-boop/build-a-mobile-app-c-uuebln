import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ConfirmModal } from '@/components/button';
import { useAuth } from '@/contexts/AuthContext';
import { usePlan } from '@/contexts/PlanContext';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

// ══════════════════════════════════════════════════════════════════════
// TARJETAS DE LEALTAD (Ago 2026) — Planes Premium y Luxury
//
// El negocio define cada cuántas visitas su cliente gana una recompensa
// y qué descuento otorga (25 / 50 / 75 / 100 %).
//
// Las visitas se acumulan por TELÉFONO del cliente (normalizado a 10
// dígitos en BD), por negocio. El progreso se CALCULA desde las citas
// reales — ver RPC get_loyalty_progress.
//
// La recompensa aplica en la SIGUIENTE visita del cliente: al completar
// las N visitas queda elegible, y el descuento se usa la próxima vez.
// Fase 2: aviso automático por WhatsApp (n8n + 360dialog) al alcanzarla.
// ══════════════════════════════════════════════════════════════════════

const DISCOUNTS = [
  { value: 25,  label: '25%',  desc: 'Cuarta parte de descuento' },
  { value: 50,  label: '50%',  desc: 'Mitad de precio' },
  { value: 75,  label: '75%',  desc: 'Tres cuartas partes' },
  { value: 100, label: '100%', desc: 'Visita totalmente gratis' },
];

const MIN_VISITS = 2;
const MAX_VISITS = 50;
const QUICK_VISITS = [5, 8, 10, 12, 15];

export default function LoyaltyScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { isBasico, isPremium } = usePlan();
  const hasAccess = isBasico || isPremium; // Premium ($399) y Luxury ($799)

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [visits, setVisits] = useState(10);
  const [percent, setPercent] = useState(100);
  const [successModal, setSuccessModal] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });

  useEffect(() => { loadConfig(); }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data } = await supabase
        .from('business_profiles')
        .select('loyalty_enabled, loyalty_visits_required, loyalty_reward_percent')
        .eq('user_id', user?.id)
        .single();
      if (data) {
        setEnabled((data as any).loyalty_enabled ?? false);
        setVisits((data as any).loyalty_visits_required ?? 10);
        setPercent((data as any).loyalty_reward_percent ?? 100);
      }
    } catch {
      // Columnas nuevas pueden no existir aún — usar defaults
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!hasAccess) { router.push('/settings/subscription'); return; }
    if (visits < MIN_VISITS || visits > MAX_VISITS) {
      setErrorModal({ visible: true, message: `Las visitas deben estar entre ${MIN_VISITS} y ${MAX_VISITS}.` });
      return;
    }
    setSaving(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase
        .from('business_profiles')
        .update({
          loyalty_enabled: enabled,
          loyalty_visits_required: visits,
          loyalty_reward_percent: percent,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user?.id);
      if (error) throw error;
      setSuccessModal(true);
    } catch (e: any) {
      setErrorModal({ visible: true, message: e?.message ?? 'No se pudo guardar la configuración.' });
    } finally {
      setSaving(false);
    }
  };

  const stepVisits = (delta: number) => {
    setVisits((v) => Math.min(MAX_VISITS, Math.max(MIN_VISITS, v + delta)));
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.loading}><ActivityIndicator size="large" color="#F59E0B" /></View>
      </SafeAreaView>
    );
  }

  const rewardWord = percent === 100 ? 'totalmente gratis' : `con ${percent}% de descuento`;

  return (
    <SafeAreaView style={s.container}>
      <ConfirmModal
        visible={successModal}
        title="✅ Guardado"
        message={enabled
          ? `Tus tarjetas de lealtad están activas. Tus clientes ganarán su recompensa al completar ${visits} visitas.`
          : 'Las tarjetas de lealtad quedaron desactivadas.'}
        buttons={[{ text: 'Entendido', onPress: () => { setSuccessModal(false); router.back(); }, style: 'default' }]}
        onDismiss={() => setSuccessModal(false)}
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
          <MaterialIcons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={s.headerMid}>
          <Text style={s.title}>Tarjetas de lealtad</Text>
          <Text style={s.subtitle}>Premia a tus clientes frecuentes</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Banner explicativo */}
        <View style={s.banner}>
          <View style={s.bannerIcon}>
            <MaterialIcons name="card-giftcard" size={26} color="#B45309" />
          </View>
          <View style={s.bannerText}>
            <Text style={s.bannerTitle}>Como una tarjeta de sellos, pero digital</Text>
            <Text style={s.bannerBody}>
              VYLTA cuenta las visitas de cada cliente por su número de teléfono.
              Al completar las que definas, gana su recompensa para la siguiente visita.
            </Text>
          </View>
        </View>

        {/* Activar */}
        <View style={s.card}>
          <View style={s.switchRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={s.switchLabel}>Activar tarjetas de lealtad</Text>
              <Text style={s.switchHint}>
                {enabled ? 'Activo — tus clientes acumulan visitas' : 'Desactivado'}
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={hasAccess ? setEnabled : () => router.push('/settings/subscription')}
              trackColor={{ false: '#E2E8F0', true: '#F59E0B' }}
              thumbColor="#fff"
              disabled={!hasAccess}
            />
          </View>
        </View>

        {enabled && (
          <>
            {/* Visitas necesarias */}
            <Text style={s.sectionTitle}>¿CADA CUÁNTAS VISITAS?</Text>
            <View style={s.card}>
              <Text style={s.fieldHint}>
                Número de visitas que tu cliente debe completar para ganar la recompensa.
              </Text>
              <View style={s.stepperRow}>
                <TouchableOpacity
                  style={[s.stepBtn, visits <= MIN_VISITS && s.stepBtnOff]}
                  onPress={() => stepVisits(-1)}
                  disabled={visits <= MIN_VISITS}
                >
                  <MaterialIcons name="remove" size={22} color={visits <= MIN_VISITS ? '#CBD5E1' : '#B45309'} />
                </TouchableOpacity>
                <View style={s.stepValueBox}>
                  <Text style={s.stepValue}>{visits}</Text>
                  <Text style={s.stepUnit}>visitas</Text>
                </View>
                <TouchableOpacity
                  style={[s.stepBtn, visits >= MAX_VISITS && s.stepBtnOff]}
                  onPress={() => stepVisits(1)}
                  disabled={visits >= MAX_VISITS}
                >
                  <MaterialIcons name="add" size={22} color={visits >= MAX_VISITS ? '#CBD5E1' : '#B45309'} />
                </TouchableOpacity>
              </View>
              <View style={s.quickRow}>
                {QUICK_VISITS.map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[s.quickChip, visits === n && s.quickChipOn]}
                    onPress={() => setVisits(n)}
                  >
                    <Text style={[s.quickChipText, visits === n && s.quickChipTextOn]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Descuento */}
            <Text style={s.sectionTitle}>RECOMPENSA</Text>
            <View style={s.card}>
              <Text style={s.fieldHint}>Descuento que recibirá en su siguiente visita.</Text>
              <View style={s.discountGrid}>
                {DISCOUNTS.map((d) => {
                  const on = percent === d.value;
                  return (
                    <TouchableOpacity
                      key={d.value}
                      style={[s.discountCard, on && s.discountCardOn]}
                      onPress={() => setPercent(d.value)}
                      activeOpacity={0.85}
                    >
                      <Text style={[s.discountValue, on && s.discountValueOn]}>{d.label}</Text>
                      <Text style={[s.discountDesc, on && s.discountDescOn]}>{d.desc}</Text>
                      {on && (
                        <View style={s.discountCheck}>
                          <MaterialIcons name="check-circle" size={18} color="#B45309" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Vista previa */}
            <View style={s.preview}>
              <View style={s.previewHead}>
                <MaterialIcons name="visibility" size={16} color="#B45309" />
                <Text style={s.previewTitle}>Así funcionará</Text>
              </View>
              <Text style={s.previewText}>
                Cuando un cliente complete <Text style={s.bold}>{visits} visitas</Text> en tu
                negocio, su siguiente visita será <Text style={s.bold}>{rewardWord}</Text>.
                Después la tarjeta vuelve a empezar.
              </Text>
              <View style={s.dotsRow}>
                {Array.from({ length: Math.min(visits, 12) }).map((_, i) => (
                  <View key={i} style={s.dot}>
                    <MaterialIcons name="check" size={11} color="#B45309" />
                  </View>
                ))}
                <View style={s.dotReward}>
                  <MaterialIcons name="card-giftcard" size={13} color="#fff" />
                </View>
              </View>
              {visits > 12 && <Text style={s.dotsNote}>+ {visits - 12} visitas más</Text>}
            </View>

            <View style={s.infoBox}>
              <MaterialIcons name="info-outline" size={16} color="#64748B" />
              <Text style={s.infoText}>
                Solo cuentan las citas ya realizadas. Las canceladas, reagendadas y las
                que marcaste como "No asistió" no suman. El cliente debe tener teléfono
                registrado para acumular visitas.
              </Text>
            </View>
          </>
        )}

        <TouchableOpacity
          style={[s.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <>
                <MaterialIcons name="check" size={18} color="#fff" />
                <Text style={s.saveBtnText}>Guardar configuración</Text>
              </>}
        </TouchableOpacity>

        <View style={{ height: 32 }} />
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

  banner: {
    flexDirection: 'row', gap: 14, backgroundColor: '#FFFBEB',
    borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 0.5, borderColor: '#FDE68A',
  },
  bannerIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center' },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: '#78350F', marginBottom: 4 },
  bannerBody: { fontSize: 12.5, color: '#92400E', lineHeight: 18 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 0.5, borderColor: '#E2E8F0',
  },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  switchLabel: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  switchHint: { fontSize: 12, color: '#94A3B8', marginTop: 2 },

  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  fieldHint: { fontSize: 12.5, color: '#64748B', marginBottom: 14, lineHeight: 18 },

  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  stepBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: '#FFFBEB',
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FDE68A',
  },
  stepBtnOff: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' },
  stepValueBox: { alignItems: 'center', minWidth: 90 },
  stepValue: { fontSize: 34, fontWeight: '800', color: '#0F172A', lineHeight: 38 },
  stepUnit: { fontSize: 12, color: '#94A3B8', marginTop: -2 },

  quickRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 16 },
  quickChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10,
    backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: 'transparent',
  },
  quickChipOn: { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' },
  quickChipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  quickChipTextOn: { color: '#B45309' },

  discountGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  discountCard: {
    width: '47.5%', backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14,
    borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  discountCardOn: { backgroundColor: '#FFFBEB', borderColor: '#F59E0B' },
  discountValue: { fontSize: 22, fontWeight: '800', color: '#475569' },
  discountValueOn: { color: '#B45309' },
  discountDesc: { fontSize: 11, color: '#94A3B8', marginTop: 2, lineHeight: 15 },
  discountDescOn: { color: '#92400E' },
  discountCheck: { position: 'absolute', top: 8, right: 8 },

  preview: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  previewTitle: { fontSize: 12, fontWeight: '700', color: '#B45309', letterSpacing: 0.3 },
  previewText: { fontSize: 13.5, color: '#334155', lineHeight: 20 },
  bold: { fontWeight: '700', color: '#0F172A' },
  dotsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14, alignItems: 'center' },
  dot: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#FEF3C7',
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FDE68A',
  },
  dotReward: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#F59E0B',
    justifyContent: 'center', alignItems: 'center',
  },
  dotsNote: { fontSize: 11, color: '#94A3B8', marginTop: 6 },

  infoBox: {
    flexDirection: 'row', gap: 8, backgroundColor: '#F1F5F9',
    borderRadius: 12, padding: 12, marginBottom: 16,
  },
  infoText: { flex: 1, fontSize: 11.5, color: '#64748B', lineHeight: 17 },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#F59E0B', borderRadius: 14, paddingVertical: 15,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
