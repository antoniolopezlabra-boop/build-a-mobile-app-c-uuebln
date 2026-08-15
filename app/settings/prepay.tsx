import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Switch, TextInput, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ConfirmModal } from '@/components/button';
import { useAuth } from '@/contexts/AuthContext';
import { usePlan } from '@/contexts/PlanContext';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

// ══════════════════════════════════════════════════════════════════════
// COBROS ANTICIPADOS (Ago 2026) — Planes Premium y Luxury
//
// El negocio conecta su PROPIA cuenta de Stripe (Connect Express). El dinero
// del anticipo le llega DIRECTO a su banco. VYLTA nunca ve ni guarda datos
// bancarios: todo el alta (identidad + cuenta) la hospeda Stripe.
//
// Config: % del anticipo (25/50/75/100) y si aplica solo a clientes nuevos
// o a todas las citas. Lo ve el cliente final en el link de reservas.
// ══════════════════════════════════════════════════════════════════════

const PERCENTS = [25, 50, 75, 100];
const SUPABASE_URL = 'https://nhjmwmkaduiaifgztymi.supabase.co';

type ConnectStatus = 'none' | 'pending' | 'active' | 'restricted';

export default function PrepayScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { isBasico, isPremium } = usePlan();
  const hasAccess = isBasico || isPremium;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [percent, setPercent] = useState(50);
  const [scope, setScope] = useState<'first' | 'all'>('all');
  const [policy, setPolicy] = useState('');
  const [connectStatus, setConnectStatus] = useState<ConnectStatus>('none');
  const [successModal, setSuccessModal] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });

  const loadConfig = async () => {
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data } = await supabase
        .from('business_profiles')
        .select('prepay_enabled, prepay_percent, prepay_scope, prepay_refund_policy, stripe_connect_status')
        .eq('user_id', user?.id)
        .single();
      if (data) {
        setEnabled((data as any).prepay_enabled ?? false);
        setPercent((data as any).prepay_percent ?? 50);
        setScope(((data as any).prepay_scope as any) ?? 'all');
        setPolicy((data as any).prepay_refund_policy ?? '');
        setConnectStatus(((data as any).stripe_connect_status as ConnectStatus) ?? 'none');
      }
    } catch {
      // columnas nuevas pueden no existir aún
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadConfig(); }, []);

  // Al volver del onboarding de Stripe (navegador externo), re-consultamos
  // el estado real de la cuenta.
  useFocusEffect(useCallback(() => { refreshConnectStatus(true); }, []));

  const callConnect = async (action: 'create' | 'status' | 'login') => {
    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
    const res = await fetch(`${SUPABASE_URL}/functions/v1/connect-onboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ action, returnUrl: 'https://vylta.lat' }),
    });
    const data = await res.json();
    if (!res.ok || data?.error) throw new Error(data?.error ?? 'Error de conexión con Stripe');
    return data;
  };

  const refreshConnectStatus = async (silent = false) => {
    try {
      const d = await callConnect('status');
      if (d?.status) setConnectStatus(d.status);
    } catch (e: any) {
      if (!silent) setErrorModal({ visible: true, message: e?.message ?? 'No se pudo consultar Stripe' });
    }
  };

  const handleConnect = async () => {
    if (!hasAccess) { router.push('/settings/subscription'); return; }
    setConnecting(true);
    try {
      const d = await callConnect('create');
      if (d?.url) await Linking.openURL(d.url);
    } catch (e: any) {
      setErrorModal({ visible: true, message: e?.message ?? 'No se pudo abrir Stripe' });
    } finally {
      setConnecting(false);
    }
  };

  const handleOpenDashboard = async () => {
    try {
      const d = await callConnect('login');
      if (d?.url) await Linking.openURL(d.url);
    } catch (e: any) {
      setErrorModal({ visible: true, message: e?.message ?? 'No se pudo abrir tu panel de Stripe' });
    }
  };

  const handleSave = async () => {
    if (!hasAccess) { router.push('/settings/subscription'); return; }
    if (enabled && connectStatus !== 'active') {
      setErrorModal({
        visible: true,
        message: 'Primero conecta tu cuenta de Stripe para poder recibir los pagos.',
      });
      return;
    }
    setSaving(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase
        .from('business_profiles')
        .update({
          prepay_enabled: enabled,
          prepay_percent: percent,
          prepay_scope: scope,
          prepay_refund_policy: policy.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user?.id);
      if (error) throw error;
      setSuccessModal(true);
    } catch (e: any) {
      setErrorModal({ visible: true, message: e?.message ?? 'No se pudo guardar' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.loading}><ActivityIndicator size="large" color="#6366F1" /></View>
      </SafeAreaView>
    );
  }

  const statusMeta = {
    none:       { color: '#94A3B8', bg: '#F1F5F9', label: 'Sin conectar',            icon: 'link-off' },
    pending:    { color: '#D97706', bg: '#FFFBEB', label: 'Falta completar datos',   icon: 'hourglass-empty' },
    restricted: { color: '#DC2626', bg: '#FEF2F2', label: 'Cuenta restringida',      icon: 'error-outline' },
    active:     { color: '#059669', bg: '#ECFDF5', label: 'Conectada y lista',       icon: 'verified' },
  }[connectStatus];

  return (
    <SafeAreaView style={s.container}>
      <ConfirmModal
        visible={successModal}
        title="✅ Guardado"
        message={enabled
          ? `Listo. Se pedirá un anticipo del ${percent}% ${scope === 'first' ? 'a los clientes nuevos' : 'en todas las citas'} agendadas por tu link.`
          : 'Los cobros anticipados quedaron desactivados.'}
        buttons={[{ text: 'Entendido', onPress: () => { setSuccessModal(false); router.back(); }, style: 'default' }]}
        onDismiss={() => setSuccessModal(false)}
      />
      <ConfirmModal
        visible={errorModal.visible}
        title="Atención"
        message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'default' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })}
      />

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <MaterialIcons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={s.headerMid}>
          <Text style={s.title}>Cobros anticipados</Text>
          <Text style={s.subtitle}>Asegura tus citas cobrando por adelantado</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        <View style={s.banner}>
          <View style={s.bannerIcon}><MaterialIcons name="payments" size={26} color="#4338CA" /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.bannerTitle}>Menos ausencias, ingreso asegurado</Text>
            <Text style={s.bannerBody}>
              Cuando un cliente agenda por tu link, se le pide pagar un porcentaje por
              adelantado con tarjeta. El dinero llega directo a tu cuenta bancaria.
            </Text>
          </View>
        </View>

        {/* ── Paso 1: Stripe ── */}
        <Text style={s.sectionTitle}>PASO 1 — TU CUENTA PARA RECIBIR EL DINERO</Text>
        <View style={s.card}>
          <View style={[s.statusPill, { backgroundColor: statusMeta.bg }]}>
            <MaterialIcons name={statusMeta.icon as any} size={16} color={statusMeta.color} />
            <Text style={[s.statusText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
          </View>

          <Text style={s.fieldHint}>
            VYLTA usa Stripe para procesar los pagos. Tus datos bancarios los
            captura y resguarda Stripe directamente — VYLTA nunca los ve ni los guarda.
          </Text>

          {connectStatus === 'active' ? (
            <TouchableOpacity style={s.secondaryBtn} onPress={handleOpenDashboard}>
              <MaterialIcons name="open-in-new" size={17} color="#4338CA" />
              <Text style={s.secondaryBtnText}>Ver mis pagos y depósitos</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.primaryBtn} onPress={handleConnect} disabled={connecting}>
              {connecting
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <MaterialIcons name="account-balance" size={18} color="#fff" />
                    <Text style={s.primaryBtnText}>
                      {connectStatus === 'none' ? 'Conectar mi cuenta bancaria' : 'Continuar verificación'}
                    </Text>
                  </>}
            </TouchableOpacity>
          )}

          <TouchableOpacity style={s.refreshRow} onPress={() => refreshConnectStatus(false)}>
            <MaterialIcons name="refresh" size={15} color="#64748B" />
            <Text style={s.refreshText}>Actualizar estado</Text>
          </TouchableOpacity>
        </View>

        {/* ── Paso 2: configuración ── */}
        <Text style={s.sectionTitle}>PASO 2 — CÓMO QUIERES COBRAR</Text>
        <View style={s.card}>
          <View style={s.switchRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={s.switchLabel}>Pedir pago por adelantado</Text>
              <Text style={s.switchHint}>
                {enabled ? 'Activo en tu link de citas' : 'Desactivado'}
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={hasAccess ? setEnabled : () => router.push('/settings/subscription')}
              trackColor={{ false: '#E2E8F0', true: '#6366F1' }}
              thumbColor="#fff"
              disabled={!hasAccess}
            />
          </View>
        </View>

        {enabled && (
          <>
            <View style={s.card}>
              <Text style={s.fieldLabel}>¿Cuánto cobrar por adelantado?</Text>
              <Text style={s.fieldHint}>Porcentaje del costo total del servicio.</Text>
              <View style={s.pctGrid}>
                {PERCENTS.map((p) => {
                  const on = percent === p;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[s.pctCard, on && s.pctCardOn]}
                      onPress={() => setPercent(p)}
                      activeOpacity={0.85}
                    >
                      <Text style={[s.pctValue, on && s.pctValueOn]}>{p}%</Text>
                      <Text style={[s.pctDesc, on && s.pctDescOn]}>
                        {p === 100 ? 'Pago completo' : 'del servicio'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={s.card}>
              <Text style={s.fieldLabel}>¿A quién se le cobra?</Text>
              <TouchableOpacity style={[s.optRow, scope === 'all' && s.optRowOn]} onPress={() => setScope('all')}>
                <MaterialIcons
                  name={scope === 'all' ? 'radio-button-checked' : 'radio-button-unchecked'}
                  size={20} color={scope === 'all' ? '#6366F1' : '#CBD5E1'}
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.optTitle}>A todas las citas</Text>
                  <Text style={s.optDesc}>Cada reserva por tu link pide anticipo.</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={[s.optRow, scope === 'first' && s.optRowOn]} onPress={() => setScope('first')}>
                <MaterialIcons
                  name={scope === 'first' ? 'radio-button-checked' : 'radio-button-unchecked'}
                  size={20} color={scope === 'first' ? '#6366F1' : '#CBD5E1'}
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.optTitle}>Solo la primera visita</Text>
                  <Text style={s.optDesc}>
                    Únicamente a clientes nuevos. Tus clientes de siempre no pagan por adelantado.
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            <View style={s.card}>
              <Text style={s.fieldLabel}>Política de cancelación (opcional)</Text>
              <Text style={s.fieldHint}>
                Se muestra al cliente antes de pagar. Ej: "Si cancelas con 24 h de
                anticipación, te devolvemos tu anticipo."
              </Text>
              <TextInput
                style={s.input}
                value={policy}
                onChangeText={setPolicy}
                placeholder="Escribe tu política…"
                placeholderTextColor="#94A3B8"
                multiline
                maxLength={300}
              />
            </View>

            <View style={s.infoBox}>
              <MaterialIcons name="info-outline" size={16} color="#64748B" />
              <Text style={s.infoText}>
                Comisiones: Stripe cobra ~3.6% + $3 MXN por transacción y VYLTA 2%.
                El horario se aparta 10 minutos mientras el cliente completa su pago;
                si no paga, se libera automáticamente.
              </Text>
            </View>
          </>
        )}

        <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" />
            : <><MaterialIcons name="check" size={18} color="#fff" /><Text style={s.saveBtnText}>Guardar configuración</Text></>}
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
    flexDirection: 'row', gap: 14, backgroundColor: '#EEF2FF',
    borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 0.5, borderColor: '#C7D2FE',
  },
  bannerIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#E0E7FF', justifyContent: 'center', alignItems: 'center' },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: '#312E81', marginBottom: 4 },
  bannerBody: { fontSize: 12.5, color: '#4338CA', lineHeight: 18 },

  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 0.5, borderColor: '#E2E8F0' },

  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, marginBottom: 12 },
  statusText: { fontSize: 12, fontWeight: '700' },

  fieldLabel: { fontSize: 15, fontWeight: '600', color: '#0F172A', marginBottom: 4 },
  fieldHint: { fontSize: 12.5, color: '#64748B', marginBottom: 14, lineHeight: 18 },

  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#6366F1', borderRadius: 12, paddingVertical: 13 },
  primaryBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#EEF2FF', borderRadius: 12, paddingVertical: 13 },
  secondaryBtnText: { color: '#4338CA', fontSize: 14.5, fontWeight: '700' },
  refreshRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 12 },
  refreshText: { fontSize: 12, color: '#64748B', fontWeight: '600' },

  switchRow: { flexDirection: 'row', alignItems: 'center' },
  switchLabel: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  switchHint: { fontSize: 12, color: '#94A3B8', marginTop: 2 },

  pctGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pctCard: { width: '47.5%', backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#E2E8F0' },
  pctCardOn: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  pctValue: { fontSize: 22, fontWeight: '800', color: '#475569' },
  pctValueOn: { color: '#4338CA' },
  pctDesc: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  pctDescOn: { color: '#6366F1' },

  optRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0', marginBottom: 8 },
  optRowOn: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
  optTitle: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  optDesc: { fontSize: 11.5, color: '#64748B', marginTop: 2, lineHeight: 16 },

  input: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 12,
    fontSize: 14, color: '#0F172A', minHeight: 80, textAlignVertical: 'top', backgroundColor: '#F8FAFC',
  },

  infoBox: { flexDirection: 'row', gap: 8, backgroundColor: '#F1F5F9', borderRadius: 12, padding: 12, marginBottom: 16 },
  infoText: { flex: 1, fontSize: 11.5, color: '#64748B', lineHeight: 17 },

  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#6366F1', borderRadius: 14, paddingVertical: 15 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
