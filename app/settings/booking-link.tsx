import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Switch, ActivityIndicator, Share, Linking, Alert,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { usePlan } from '@/contexts/PlanContext';
import { useGratuitoUsage } from '@/contexts/useGratuitoUsage';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

const BASE_URL = 'https://book.vylta.lat';

interface BookingLink {
  id: string; slug: string; is_active: boolean;
  require_approval: boolean; whatsapp_confirmation: boolean;
}

interface BookingRequest {
  id: string; client_name_temp: string | null; service_name: string;
  date: string; start_time: string; status: string; notes: string | null;
}

export default function BookingLinkScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { isGratuito } = usePlan();
  const usage = useGratuitoUsage();

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

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('booking_links').select('*').eq('user_id', user?.id).maybeSingle();
      if (data) {
        setLinkData(data); setSlug(data.slug); setIsActive(data.is_active);
        setRequireApproval(data.require_approval); setWhatsappConfirm(data.whatsapp_confirmation);
      } else {
        const { data: bp } = await supabase.from('business_profiles').select('business_name').eq('user_id', user?.id).maybeSingle();
        if (bp?.business_name) {
          const suggested = bp.business_name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40);
          setSlug(suggested);
        }
      }
      await loadRequests();
    } catch (e) { console.error('[BookingLink]', e); } finally { setLoading(false); }
  };

  const loadRequests = async () => {
    try {
      const { data } = await supabase.from('appointments').select('id,client_name_temp,service_name,date,start_time,status,notes')
        .eq('user_id', user?.id).eq('source','public_link').eq('status','Solicitud')
        .order('date', { ascending: true }).limit(20);
      setRequests(data || []);
    } catch { setRequests([]); }
  };

  const validateSlug = (val: string) => {
    if (!val.trim()) { setSlugError('El nombre no puede estar vacío'); return false; }
    if (!/^[a-z0-9-]+$/.test(val)) { setSlugError('Solo letras minúsculas, números y guiones'); return false; }
    if (val.length < 3) { setSlugError('Mínimo 3 caracteres'); return false; }
    setSlugError(''); return true;
  };

  const handleSave = async () => {
    if (!validateSlug(slug)) return;
    setSaving(true);
    try {
      if (linkData) {
        const { error } = await supabase.from('booking_links').update({ slug: slug.trim(), is_active: isActive, require_approval: requireApproval, whatsapp_confirmation: whatsappConfirm, updated_at: new Date().toISOString() }).eq('id', linkData.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('booking_links').insert({ user_id: user?.id, slug: slug.trim(), is_active: isActive, require_approval: requireApproval, whatsapp_confirmation: whatsappConfirm }).select().single();
        if (error) throw error;
        setLinkData(data);
      }
      Alert.alert('Guardado', 'Tu link de citas fue actualizado.');
    } catch (e: any) {
      const msg = e?.message?.includes('duplicate') || e?.code === '23505' ? 'Ese nombre ya está en uso. Elige otro.' : e?.message || 'Error al guardar';
      Alert.alert('Error', msg);
    } finally { setSaving(false); }
  };

  const handleCopy = async () => {
    const url = `${BASE_URL}/${slug}`;
    try {
      Clipboard.setString(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  };

  const handleShare = async () => {
    const url = `${BASE_URL}/${slug}`;
    await Share.share({ message: `Agenda tu cita en línea:\n${url}` });
  };

  const handleOpenLink = async () => {
    const url = `${BASE_URL}/${slug}`;
    if (await Linking.canOpenURL(url)) Linking.openURL(url);
  };

  const handleApprove = async (id: string) => {
    await supabase.from('appointments').update({ status: 'Confirmada', updated_at: new Date().toISOString() }).eq('id', id);
    setRequests(prev => prev.filter(r => r.id !== id));
  };

  const handleReject = async (id: string) => {
    Alert.alert('Rechazar solicitud', '¿Estás seguro? Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Rechazar', style: 'destructive', onPress: async () => {
        await supabase.from('appointments').update({ status: 'Cancelada', updated_at: new Date().toISOString() }).eq('id', id);
        setRequests(prev => prev.filter(r => r.id !== id));
      }},
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
          <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
            <MaterialIcons name="arrow-back-ios" size={18} color="#64748B" />
            <Text style={st.backText}>Ajustes</Text>
          </TouchableOpacity>
          <Text style={st.title}>Link de citas</Text>
          <View style={{ width: 80 }} />
        </View>
        <View style={st.centered}><ActivityIndicator size="large" color="#10B981" /></View>
      </SafeAreaView>
    );
  }

  // ── PLAN BÁSICO/GRATUITO ──
  // El link público ahora está disponible para Plan Básico también.
  // El límite de 10 citas/mes ya está enforced server-side en la Edge Function
  // create-booking-request, por lo que no hay riesgo de abuso.
  // Mostramos un banner informativo con el contador X/10 cuando es Gratuito.

  const publicUrl = `${BASE_URL}/${slug}`;
  const hasLink = !!linkData;

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <MaterialIcons name="arrow-back-ios" size={18} color="#64748B" />
          <Text style={st.backText}>Ajustes</Text>
        </TouchableOpacity>
        <Text style={st.title}>Link de citas</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={st.saveHeaderBtn}>
          {saving ? <ActivityIndicator size="small" color="#10B981" /> : <Text style={st.saveHeaderText}>Guardar</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

        {/* Banner contador X/10 (solo Plan Básico/Gratuito) */}
        {isGratuito && !usage.loading && (
          <TouchableOpacity
            style={[
              st.usageBanner,
              {
                backgroundColor: usage.isAtLimit ? '#450A0A' : usage.isNearLimit ? '#451A03' : '#0F3D2E',
                borderColor: usage.isAtLimit ? '#7F1D1D' : usage.isNearLimit ? '#78350F' : '#065F46',
              },
            ]}
            onPress={() => router.push('/settings/subscription')}
            activeOpacity={0.85}
          >
            <View style={st.usageHeader}>
              <MaterialIcons
                name={usage.isAtLimit ? 'block' : usage.isNearLimit ? 'warning' : 'event-available'}
                size={20}
                color={usage.isAtLimit ? '#EF4444' : usage.isNearLimit ? '#F59E0B' : '#10B981'}
              />
              <View style={{ flex: 1 }}>
                <Text style={[
                  st.usageTitle,
                  { color: usage.isAtLimit ? '#EF4444' : usage.isNearLimit ? '#F59E0B' : '#10B981' },
                ]}>
                  {usage.isAtLimit
                    ? `Límite alcanzado · ${usage.used}/${usage.limit} citas`
                    : `${usage.used}/${usage.limit} citas usadas este mes`}
                </Text>
                <Text style={st.usageDesc}>
                  {usage.isAtLimit
                    ? 'Tu link no aceptará nuevas citas hasta el próximo mes. Toca para mejorar.'
                    : 'Plan Básico — Toca para ver Premium con citas ilimitadas'}
                </Text>
              </View>
              <MaterialIcons name="arrow-forward-ios" size={14} color={usage.isAtLimit ? '#EF4444' : usage.isNearLimit ? '#F59E0B' : '#10B981'} />
            </View>
            <View style={st.usageProgressBg}>
              <View style={[
                st.usageProgressFill,
                {
                  width: `${usage.percentage}%`,
                  backgroundColor: usage.isAtLimit ? '#EF4444' : usage.isNearLimit ? '#F59E0B' : '#10B981',
                },
              ]} />
            </View>
          </TouchableOpacity>
        )}

        {/* Hero card con link y acciones */}
        <View style={st.heroCard}>
          <View style={st.heroRow}>
            <View style={st.heroIconWrap}>
              <MaterialIcons name="link" size={20} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.heroLabel}>Tu link de citas</Text>
              <Text style={st.heroUrl} numberOfLines={1}>{publicUrl}</Text>
            </View>
            <View style={[st.activePill, { backgroundColor: isActive ? '#ECFDF5' : '#1E293B' }]}>
              <View style={[st.activeDot, { backgroundColor: isActive ? '#10B981' : '#475569' }]} />
              <Text style={[st.activeText, { color: isActive ? '#10B981' : '#64748B' }]}>{isActive ? 'Activo' : 'Inactivo'}</Text>
            </View>
          </View>

          <View style={st.actionRow}>
            <TouchableOpacity
              style={[st.actionBtn, copied && st.actionBtnSuccess]}
              onPress={handleCopy}
              activeOpacity={0.75}
            >
              <MaterialIcons name={copied ? 'check' : 'content-copy'} size={16} color={copied ? '#10B981' : '#F8FAFC'} />
              <Text style={[st.actionBtnText, copied && { color: '#10B981' }]}>
                {copied ? '¡Copiado!' : 'Copiar'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.actionBtn} onPress={handleShare} activeOpacity={0.75}>
              <MaterialIcons name="share" size={16} color="#F8FAFC" />
              <Text style={st.actionBtnText}>Compartir</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.actionBtn} onPress={handleOpenLink} activeOpacity={0.75}>
              <MaterialIcons name="open-in-browser" size={16} color="#F8FAFC" />
              <Text style={st.actionBtnText}>Ver página</Text>
            </TouchableOpacity>
          </View>

          {copied && (
            <View style={st.copiedHint}>
              <MaterialIcons name="check-circle" size={13} color="#10B981" />
              <Text style={st.copiedHintText}>Link copiado al portapapeles — pégalo donde quieras</Text>
            </View>
          )}
        </View>

        {/* Solicitudes pendientes */}
        {requests.length > 0 && (
          <View style={st.section}>
            <View style={st.sectionTitleRow}>
              <Text style={st.sectionTitle}>Solicitudes pendientes</Text>
              <View style={st.countBadge}><Text style={st.countBadgeText}>{requests.length}</Text></View>
            </View>
            {requests.map(req => (
              <View key={req.id} style={st.requestCard}>
                <View style={st.requestInfo}>
                  <Text style={st.requestName}>{req.client_name_temp || 'Cliente'}</Text>
                  <Text style={st.requestService}>{req.service_name}</Text>
                  <Text style={st.requestDate}>{formatDate(req.date)}  {req.start_time}</Text>
                  {req.notes ? <Text style={st.requestNotes}>{req.notes}</Text> : null}
                </View>
                <View style={st.requestBtns}>
                  <TouchableOpacity style={st.approveBtn} onPress={() => handleApprove(req.id)}>
                    <MaterialIcons name="check" size={16} color="#fff" />
                    <Text style={st.approveBtnText}>Aceptar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={st.rejectBtn} onPress={() => handleReject(req.id)}>
                    <MaterialIcons name="close" size={16} color="#EF4444" />
                    <Text style={st.rejectBtnText}>Rechazar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Configuración */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>Configuración</Text>
          <View style={st.configCard}>
            <View style={st.configCardHeader}>
              <MaterialIcons name="edit" size={18} color="#10B981" />
              <View style={{ flex: 1 }}>
                <Text style={st.configLabel}>Nombre de tu link</Text>
                <Text style={st.configSub}>Personaliza la dirección que verán tus clientes</Text>
              </View>
            </View>
            <TextInput
              style={[st.slugInput, slugError ? { borderColor: '#EF4444' } : null]}
              value={slug}
              onChangeText={v => { const clean = v.toLowerCase().replace(/[^a-z0-9-]/g,''); setSlug(clean); validateSlug(clean); }}
              placeholder="mi-estetica"
              placeholderTextColor="#334155"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {slugError ? <View style={st.errorRow}><MaterialIcons name="error-outline" size={14} color="#EF4444" /><Text style={st.slugError}>{slugError}</Text></View> : null}
            <View style={st.urlPreviewRow}>
              <MaterialIcons name="link" size={12} color="#334155" />
              <Text style={st.urlPreview} numberOfLines={1}>{publicUrl}</Text>
            </View>
          </View>

          <View style={st.togglesCard}>
            <View style={st.toggleRow}>
              <View style={st.toggleIcon}><MaterialIcons name="public" size={20} color={isActive ? '#10B981' : '#475569'} /></View>
              <View style={{ flex: 1 }}><Text style={st.toggleLabel}>Link activo</Text><Text style={st.toggleSub}>{isActive ? 'Tus clientes pueden agendar ahora' : 'El link está desactivado'}</Text></View>
              <Switch value={isActive} onValueChange={setIsActive} trackColor={{ false: '#1E293B', true: '#10B981' }} thumbColor="#fff" />
            </View>
            <View style={st.divider} />
            <View style={st.toggleRow}>
              <View style={st.toggleIcon}><MaterialIcons name="how-to-reg" size={20} color={requireApproval ? '#F59E0B' : '#475569'} /></View>
              <View style={{ flex: 1 }}><Text style={st.toggleLabel}>Aprobar citas manualmente</Text><Text style={st.toggleSub}>{requireApproval ? 'Debes aprobar cada cita antes de confirmarla' : 'Las citas se confirman de forma automática'}</Text></View>
              <Switch value={requireApproval} onValueChange={setRequireApproval} trackColor={{ false: '#1E293B', true: '#F59E0B' }} thumbColor="#fff" />
            </View>
            <View style={st.divider} />
            <View style={st.toggleRow}>
              <View style={st.toggleIcon}><MaterialIcons name="chat" size={20} color={whatsappConfirm ? '#10B981' : '#475569'} /></View>
              <View style={{ flex: 1 }}><Text style={st.toggleLabel}>Confirmar por WhatsApp</Text><Text style={st.toggleSub}>Enviar mensaje de confirmación al cliente</Text></View>
              <Switch value={whatsappConfirm} onValueChange={setWhatsappConfirm} trackColor={{ false: '#1E293B', true: '#10B981' }} thumbColor="#fff" />
            </View>
          </View>
        </View>

        {/* Dónde compartir */}
        <View style={st.tipsCard}>
          <View style={st.tipsHeader}>
            <MaterialIcons name="lightbulb-outline" size={16} color="#F59E0B" />
            <Text style={st.tipsTitle}>¿Dónde compartir tu link?</Text>
          </View>
          {[
            { icon: 'photo-camera' as const, text: 'Bio de Instagram o Facebook' },
            { icon: 'chat' as const, text: 'Estado de WhatsApp Business' },
            { icon: 'badge' as const, text: 'Tarjeta de presentación digital' },
            { icon: 'place' as const, text: 'Perfil de Google Maps' },
          ].map(({ icon, text }) => (
            <View key={text} style={st.tipRow}>
              <MaterialIcons name={icon} size={14} color="#475569" />
              <Text style={st.tipText}>{text}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={[st.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : (<><MaterialIcons name="save" size={20} color="#fff" /><Text style={st.saveBtnText}>{hasLink ? 'Guardar cambios' : 'Activar mi link de citas'}</Text></>)}
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#0F172A' },
  centered:         { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  backBtn:          { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 80 },
  backText:         { fontSize: 15, color: '#64748B' },
  title:            { fontSize: 17, fontWeight: '700', color: '#F8FAFC' },
  saveHeaderBtn:    { minWidth: 80, alignItems: 'flex-end' },
  saveHeaderText:   { fontSize: 15, fontWeight: '700', color: '#10B981' },
  scroll:           { padding: 16, paddingBottom: 60, gap: 16 },

  // Banner X/10 para Plan Básico
  usageBanner:      { borderRadius: 14, padding: 14, borderWidth: 1 },
  usageHeader:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  usageTitle:       { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  usageDesc:        { fontSize: 11, color: '#94A3B8', lineHeight: 15 },
  usageProgressBg:  { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' },
  usageProgressFill: { height: '100%', borderRadius: 3 },

  heroCard:         { backgroundColor: '#1E293B', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#334155' },
  heroRow:          { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  heroIconWrap:     { width: 40, height: 40, borderRadius: 12, backgroundColor: '#0F3D2E', justifyContent: 'center', alignItems: 'center' },
  heroLabel:        { fontSize: 11, fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  heroUrl:          { fontSize: 12, color: '#10B981', fontFamily: 'monospace' },
  activePill:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  activeDot:        { width: 6, height: 6, borderRadius: 3 },
  activeText:       { fontSize: 11, fontWeight: '700' },
  actionRow:        { flexDirection: 'row', gap: 8 },
  actionBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#0F172A', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#334155' },
  actionBtnSuccess: { borderColor: '#065F46', backgroundColor: '#022C22' },
  actionBtnText:    { fontSize: 12, fontWeight: '600', color: '#F8FAFC' },
  copiedHint:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 4 },
  copiedHintText:   { fontSize: 11, color: '#10B981', fontWeight: '500' },
  section:          { gap: 10 },
  sectionTitleRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle:     { fontSize: 13, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.6 },
  countBadge:       { backgroundColor: '#EF4444', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  countBadgeText:   { fontSize: 12, fontWeight: '800', color: '#fff' },
  requestCard:      { backgroundColor: '#1E293B', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#450A0A' },
  requestInfo:      { marginBottom: 12 },
  requestName:      { fontSize: 15, fontWeight: '700', color: '#F8FAFC', marginBottom: 2 },
  requestService:   { fontSize: 13, color: '#94A3B8' },
  requestDate:      { fontSize: 12, color: '#64748B', marginTop: 4 },
  requestNotes:     { fontSize: 12, color: '#94A3B8', marginTop: 4, fontStyle: 'italic' },
  requestBtns:      { flexDirection: 'row', gap: 10 },
  approveBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 10 },
  approveBtnText:   { color: '#fff', fontWeight: '700', fontSize: 13 },
  rejectBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'transparent', borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: '#450A0A' },
  rejectBtnText:    { color: '#EF4444', fontWeight: '700', fontSize: 13 },
  configCard:       { backgroundColor: '#1E293B', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#334155' },
  configCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  configLabel:      { fontSize: 14, fontWeight: '600', color: '#F8FAFC' },
  configSub:        { fontSize: 12, color: '#475569', marginTop: 2 },
  slugInput:        { backgroundColor: '#0F172A', borderWidth: 1.5, borderColor: '#334155', borderRadius: 10, padding: 12, fontSize: 14, color: '#10B981', fontFamily: 'monospace', marginBottom: 8 },
  errorRow:         { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  slugError:        { fontSize: 12, color: '#EF4444' },
  urlPreviewRow:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  urlPreview:       { fontSize: 11, color: '#334155', fontFamily: 'monospace', flex: 1 },
  togglesCard:      { backgroundColor: '#1E293B', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#334155' },
  toggleRow:        { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  toggleIcon:       { width: 36, height: 36, borderRadius: 10, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center' },
  toggleLabel:      { fontSize: 14, fontWeight: '600', color: '#F8FAFC', marginBottom: 2 },
  toggleSub:        { fontSize: 12, color: '#475569', lineHeight: 16 },
  divider:          { height: 1, backgroundColor: '#0F172A', marginHorizontal: 14 },
  tipsCard:         { backgroundColor: '#1E293B', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#334155' },
  tipsHeader:       { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  tipsTitle:        { fontSize: 13, fontWeight: '700', color: '#94A3B8' },
  tipRow:           { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  tipText:          { fontSize: 13, color: '#64748B' },
  saveBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10B981', borderRadius: 14, padding: 16 },
  saveBtnText:      { color: '#fff', fontWeight: '800', fontSize: 16 },
});
