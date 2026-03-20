import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Switch, ActivityIndicator, Share, Linking, Alert, Platform, Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { usePlan } from '@/contexts/PlanContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const BASE_URL = 'https://antoniolopezlabra-boop.github.io/vylta-planes/book.html';

interface BookingLink {
  id: string;
  slug: string;
  is_active: boolean;
  require_approval: boolean;
  whatsapp_confirmation: boolean;
}

interface BookingRequest {
  id: string;
  client_name_temp: string | null;
  service_name: string;
  date: string;
  start_time: string;
  status: string;
  notes: string | null;
}

export default function BookingLinkScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { canUseBookingLink, isGratuito } = usePlan();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const [linkData, setLinkData] = useState<BookingLink | null>(null);
  const [slug, setSlug] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [requireApproval, setRequireApproval] = useState(false);
  const [whatsappConfirm, setWhatsappConfirm] = useState(true);
  const [slugError, setSlugError] = useState('');

  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('booking_links')
        .select('*')
        .eq('user_id', user?.id)
        .single();

      if (data) {
        setLinkData(data);
        setSlug(data.slug);
        setIsActive(data.is_active);
        setRequireApproval(data.require_approval);
        setWhatsappConfirm(data.whatsapp_confirmation);
      } else {
        const { data: bp } = await supabase
          .from('business_profiles')
          .select('business_name')
          .eq('user_id', user?.id)
          .single();
        if (bp?.business_name) {
          const suggested = bp.business_name
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 40);
          setSlug(suggested);
        }
      }

      await loadRequests();
    } catch (e) {
      console.error('[BookingLink] loadData:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async () => {
    setLoadingRequests(true);
    try {
      const { data } = await supabase
        .from('appointments')
        .select('id, client_name_temp, service_name, date, start_time, status, notes')
        .eq('user_id', user?.id)
        .eq('source', 'public_link')
        .eq('status', 'Solicitud')
        .order('date', { ascending: true })
        .limit(20);
      setRequests(data || []);
    } catch (e) {
      setRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  };

  const validateSlug = (val: string) => {
    if (!val.trim()) { setSlugError('El slug no puede estar vacío'); return false; }
    if (!/^[a-z0-9-]+$/.test(val)) { setSlugError('Solo letras minúsculas, números y guiones'); return false; }
    if (val.length < 3) { setSlugError('Mínimo 3 caracteres'); return false; }
    setSlugError('');
    return true;
  };

  const handleSave = async () => {
    if (!validateSlug(slug)) return;
    setSaving(true);
    try {
      if (linkData) {
        const { error } = await supabase.from('booking_links').update({
          slug: slug.trim(),
          is_active: isActive,
          require_approval: requireApproval,
          whatsapp_confirmation: whatsappConfirm,
          updated_at: new Date().toISOString(),
        }).eq('id', linkData.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('booking_links').insert({
          user_id: user?.id,
          slug: slug.trim(),
          is_active: isActive,
          require_approval: requireApproval,
          whatsapp_confirmation: whatsappConfirm,
        }).select().single();
        if (error) throw error;
        setLinkData(data);
      }
      Alert.alert('\u00a1Guardado!', 'La configuraci\u00f3n de tu link fue actualizada.');
    } catch (e: any) {
      const msg = e?.message?.includes('duplicate') || e?.code === '23505'
        ? 'Ese slug ya est\u00e1 en uso. Elige otro nombre \u00fanico.'
        : e?.message || 'Error al guardar';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  // FIX: Copiar pone SOLO la URL en portapapeles — sin duplicado
  const handleCopy = async () => {
    const url = `${BASE_URL}?n=${slug}`;
    try {
      // Intentar copiar al portapapeles directamente
      if (Clipboard && Clipboard.setString) {
        Clipboard.setString(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } else {
        // Fallback: share sheet con solo la URL como mensaje
        await Share.share({ message: url });
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (e) {}
  };

  // Compartir con texto descriptivo + URL (no duplica porque message no incluye la URL)
  const handleShare = async () => {
    const url = `${BASE_URL}?n=${slug}`;
    try {
      await Share.share({
        message: `Agenda tu cita en l\u00ednea con nosotros:\n${url}`,
      });
    } catch (e) {}
  };

  // Ver página — abre directamente en el navegador
  const handleOpenLink = async () => {
    const url = `${BASE_URL}?n=${slug}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      Linking.openURL(url);
    }
  };

  const handleApproveRequest = async (id: string) => {
    await supabase.from('appointments').update({ status: 'Confirmada', updated_at: new Date().toISOString() }).eq('id', id);
    setRequests(prev => prev.filter(r => r.id !== id));
  };

  const handleRejectRequest = async (id: string) => {
    Alert.alert('Rechazar solicitud', '\u00bfEst\u00e1s seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Rechazar', style: 'destructive',
        onPress: async () => {
          await supabase.from('appointments').update({ status: 'Cancelada', updated_at: new Date().toISOString() }).eq('id', id);
          setRequests(prev => prev.filter(r => r.id !== id));
        },
      },
    ]);
  };

  const formatDate = (d: string) => {
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  if (loading) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => router.back()}><Text style={st.back}>\u2190 Volver</Text></TouchableOpacity>
          <Text style={st.title}>Link de cita</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      </SafeAreaView>
    );
  }

  if (isGratuito) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => router.back()}><Text style={st.back}>\u2190 Volver</Text></TouchableOpacity>
          <Text style={st.title}>Link de cita</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={st.paywall}>
          <Text style={st.paywallIcon}>\ud83d\udd17</Text>
          <Text style={st.paywallTitle}>Link de cita p\u00fablica</Text>
          <Text style={st.paywallDesc}>
            Genera un link \u00fanico que tus clientes pueden abrir desde Instagram, WhatsApp o Facebook
            para agendar citas 24/7 sin llamarte.
          </Text>
          <TouchableOpacity style={st.paywallBtn} onPress={() => router.push('/settings/subscription')}>
            <Text style={st.paywallBtnText}>Ver Plan B\u00e1sico \u2192</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const publicUrl = `${BASE_URL}?n=${slug}`;
  const hasLink = !!linkData;

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={st.back}>\u2190 Volver</Text></TouchableOpacity>
        <Text style={st.title}>Link de cita</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={[st.saveBtn, saving && { opacity: 0.5 }]}>{saving ? 'Guardando...' : 'Guardar'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={st.heroCard}>
          <View style={st.heroTop}>
            <Text style={st.heroLabel}>Tu link de citas</Text>
            <View style={[st.statusPill, { backgroundColor: isActive ? '#ECFDF5' : '#1E293B' }]}>
              <View style={[st.statusDot, { backgroundColor: isActive ? '#10B981' : '#475569' }]} />
              <Text style={[st.statusText, { color: isActive ? '#10B981' : '#94A3B8' }]}>
                {isActive ? 'Activo' : 'Inactivo'}
              </Text>
            </View>
          </View>
          <Text style={st.heroUrl} numberOfLines={2}>{publicUrl}</Text>
          <View style={st.heroActions}>
            <TouchableOpacity style={[st.heroBtn, { backgroundColor: copied ? '#065F46' : '#1E293B' }]} onPress={handleCopy}>
              <Text style={[st.heroBtnText, { color: copied ? '#10B981' : '#fff' }]}>{copied ? '\u2713 Copiado' : '\ud83d\udccb Copiar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.heroBtn, { backgroundColor: '#1E293B' }]} onPress={handleShare}>
              <Text style={st.heroBtnText}>\u2197 Compartir</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.heroBtn, { backgroundColor: '#1E293B' }]} onPress={handleOpenLink}>
              <Text style={st.heroBtnText}>\ud83d\udc41 Ver</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Solicitudes pendientes */}
        {requests.length > 0 && (
          <>
            <View style={st.sectionHeader}>
              <Text style={st.sectionTitle}>Solicitudes pendientes</Text>
              <View style={st.badge}><Text style={st.badgeText}>{requests.length}</Text></View>
            </View>
            {requests.map(req => (
              <View key={req.id} style={st.requestCard}>
                <View style={st.requestTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.requestName}>{req.client_name_temp || 'Cliente'}</Text>
                    <Text style={st.requestService}>{req.service_name}</Text>
                    <Text style={st.requestDate}>{formatDate(req.date)} \u00b7 {req.start_time}</Text>
                    {req.notes ? <Text style={st.requestNotes}>{req.notes}</Text> : null}
                  </View>
                </View>
                <View style={st.requestActions}>
                  <TouchableOpacity style={st.acceptBtn} onPress={() => handleApproveRequest(req.id)}>
                    <Text style={st.acceptBtnText}>\u2713 Aceptar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={st.rejectBtn} onPress={() => handleRejectRequest(req.id)}>
                    <Text style={st.rejectBtnText}>\u2715 Rechazar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Configuraci\u00f3n */}
        <Text style={st.sectionTitle}>Configuraci\u00f3n</Text>
        <View style={st.configCard}>
          <View style={st.configRow}>
            <Text style={st.configLabel}>Nombre \u00fanico del link (slug)</Text>
            <Text style={st.configSub}>Aparece en tu URL \u00b7 solo letras, n\u00fameros y guiones</Text>
          </View>
          <TextInput
            style={[st.slugInput, slugError ? { borderColor: '#EF4444' } : null]}
            value={slug}
            onChangeText={v => {
              const clean = v.toLowerCase().replace(/[^a-z0-9-]/g, '');
              setSlug(clean); validateSlug(clean);
            }}
            placeholder="mi-estetica"
            placeholderTextColor="#475569"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {slugError ? <Text style={st.slugError}>{slugError}</Text> : null}
          <Text style={st.slugPreview}>{publicUrl}</Text>

          <View style={st.divider} />

          <View style={st.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={st.configLabel}>Link activo</Text>
              <Text style={st.configSub}>Clientes pueden ver tu p\u00e1gina y agendar</Text>
            </View>
            <Switch value={isActive} onValueChange={setIsActive} trackColor={{ false: '#334155', true: '#10B981' }} thumbColor="#fff" />
          </View>

          <View style={st.divider} />

          <View style={st.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={st.configLabel}>Aprobaci\u00f3n manual</Text>
              <Text style={st.configSub}>
                {requireApproval
                  ? '\u26a0\ufe0f Debes aprobar cada cita \u2014 el cliente queda en espera'
                  : '\u2705 Las citas se confirman solas \u2014 sin fricci\u00f3n para el cliente'}
              </Text>
            </View>
            <Switch value={requireApproval} onValueChange={setRequireApproval} trackColor={{ false: '#334155', true: '#F59E0B' }} thumbColor="#fff" />
          </View>

          <View style={st.divider} />

          <View style={st.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={st.configLabel}>WhatsApp al confirmar</Text>
              <Text style={st.configSub}>Avisar al cliente por WhatsApp cuando se confirme</Text>
            </View>
            <Switch value={whatsappConfirm} onValueChange={setWhatsappConfirm} trackColor={{ false: '#334155', true: '#10B981' }} thumbColor="#fff" />
          </View>
        </View>

        {/* Tip */}
        <View style={st.tipCard}>
          <Text style={st.tipTitle}>D\u00f3nde compartir tu link</Text>
          <Text style={st.tipText}>
            {'\u2022 Bio de Instagram o Facebook\n\u2022 Estado de WhatsApp Business\n\u2022 Tarjeta de presentaci\u00f3n digital\n\u2022 Perfil de Google Maps de tu negocio'}
          </Text>
        </View>

        <TouchableOpacity style={[st.saveFullBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={st.saveFullBtnText}>{hasLink ? 'Guardar cambios' : 'Activar mi link de citas'}</Text>
          }
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1E293B', backgroundColor: '#0F172A' },
  back: { color: '#64748B', fontSize: 15 },
  title: { fontSize: 17, fontWeight: '700', color: '#F8FAFC' },
  saveBtn: { color: '#10B981', fontSize: 15, fontWeight: '700' },
  scroll: { padding: 20, paddingBottom: 60 },
  heroCard: { backgroundColor: '#1E293B', borderRadius: 20, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#334155' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  heroLabel: { fontSize: 11, color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '700' },
  heroUrl: { fontSize: 12, color: '#10B981', fontFamily: 'monospace', marginBottom: 16, lineHeight: 18 },
  heroActions: { flexDirection: 'row', gap: 8 },
  heroBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  heroBtnText: { fontSize: 12, fontWeight: '700', color: '#F8FAFC' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#94A3B8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  badge: { backgroundColor: '#EF4444', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  requestCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#7F1D1D' },
  requestTop: { flexDirection: 'row', marginBottom: 12 },
  requestName: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  requestService: { fontSize: 13, color: '#94A3B8', marginTop: 2 },
  requestDate: { fontSize: 12, color: '#64748B', marginTop: 3 },
  requestNotes: { fontSize: 12, color: '#94A3B8', marginTop: 4, fontStyle: 'italic' },
  requestActions: { flexDirection: 'row', gap: 10 },
  acceptBtn: { flex: 1, backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  acceptBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  rejectBtn: { flex: 1, backgroundColor: 'transparent', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#7F1D1D' },
  rejectBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 13 },
  configCard: { backgroundColor: '#1E293B', borderRadius: 16, overflow: 'hidden', marginBottom: 16, borderWidth: 1, borderColor: '#334155' },
  configRow: { padding: 16, paddingBottom: 10 },
  configLabel: { fontSize: 14, fontWeight: '600', color: '#F8FAFC' },
  configSub: { fontSize: 12, color: '#475569', marginTop: 3, lineHeight: 18 },
  slugInput: { marginHorizontal: 16, borderRadius: 10, borderWidth: 1.5, borderColor: '#334155', padding: 12, fontSize: 13, color: '#10B981', backgroundColor: '#0F172A', fontFamily: 'monospace' },
  slugError: { marginHorizontal: 16, marginTop: 4, fontSize: 12, color: '#EF4444' },
  slugPreview: { marginHorizontal: 16, marginTop: 6, marginBottom: 12, fontSize: 10, color: '#475569', fontFamily: 'monospace' },
  divider: { height: 1, backgroundColor: '#334155' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  tipCard: { backgroundColor: '#1E293B', borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#334155' },
  tipTitle: { fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  tipText: { fontSize: 13, color: '#94A3B8', lineHeight: 24 },
  saveFullBtn: { backgroundColor: '#10B981', borderRadius: 16, padding: 18, alignItems: 'center' },
  saveFullBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  paywall: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  paywallIcon: { fontSize: 56, marginBottom: 16 },
  paywallTitle: { fontSize: 22, fontWeight: '800', color: '#F8FAFC', marginBottom: 12, textAlign: 'center' },
  paywallDesc: { fontSize: 15, color: '#64748B', textAlign: 'center', lineHeight: 24, marginBottom: 28 },
  paywallBtn: { backgroundColor: '#10B981', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  paywallBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
