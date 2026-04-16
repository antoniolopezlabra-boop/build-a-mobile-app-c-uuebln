import { getDateStringDaysFromNow } from '@/utils/dateUtils';
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '@/contexts/AuthContext';
import { usePlan } from '@/contexts/PlanContext';
import { ConfirmModal } from '@/components/button';

type Segment = 'todos' | 'activos' | 'inactivos';

const SEGMENTS: { key: Segment; label: string; desc: string; icon: string }[] = [
  { key: 'todos',     label: 'Todos los clientes', desc: 'Con email registrado', icon: 'group' },
  { key: 'activos',   label: 'Solo activos',        desc: 'Con visita reciente', icon: 'person' },
  { key: 'inactivos', label: 'Solo inactivos',      desc: 'Sin visita en 90+ días', icon: 'person-off' },
];

const VARIABLES = [
  { key: '{{nombre}}',  label: 'Nombre cliente' },
  { key: '{{negocio}}', label: 'Tu negocio' },
];

export default function NewCampaignScreen() {
  const router = useRouter();
  const { user, businessProfile } = useAuth();
  const { isPremium } = usePlan();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [segment, setSegment] = useState<Segment>('todos');
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });
  const [successModal, setSuccessModal] = useState({ visible: false, count: 0 });

  useEffect(() => {
    if (!isPremium) {
      router.replace('/settings/subscription');
    }
  }, [isPremium]);

  useEffect(() => { countRecipients(); }, [segment]);

  const countRecipients = async () => {
    setLoadingCount(true);
    setRecipientCount(null);
    try {
      const { supabase } = await import('@/lib/supabase');
      let query = supabase.from('clients').select('id', { count: 'exact', head: true })
        .eq('user_id', user?.id)
        .not('email', 'is', null)
        .neq('email', '');
      if (segment === 'activos') query = query.eq('is_active', true);
      else if (segment === 'inactivos') {
        // Hace 90 días en timezone local
        const d90Str = getDateStringDaysFromNow(-90);
        query = query.lt('last_visit', d90Str);
      }
      const { count } = await query;
      setRecipientCount(count || 0);
    } catch (e) {
      setRecipientCount(0);
    } finally {
      setLoadingCount(false);
    }
  };

  const validate = () => {
    if (!subject.trim()) { setErrorModal({ visible: true, message: 'El asunto del email es requerido' }); return false; }
    if (!body.trim())    { setErrorModal({ visible: true, message: 'El contenido del email es requerido' }); return false; }
    if (recipientCount === 0) { setErrorModal({ visible: true, message: 'No hay clientes con email registrado para este segmento. Agrega emails a tus clientes desde su perfil.' }); return false; }
    return true;
  };

  const saveDraft = async () => {
    if (!subject.trim() && !body.trim()) {
      setErrorModal({ visible: true, message: 'Agrega al menos un asunto o contenido para guardar el borrador' }); return;
    }
    setSavingDraft(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      await supabase.from('email_campaigns').insert({
        user_id: user?.id,
        subject: subject.trim() || '(Sin asunto)',
        body: body.trim(),
        segment,
        status: 'borrador',
        recipient_count: recipientCount || 0,
      });
      router.back();
    } catch (e: any) {
      setErrorModal({ visible: true, message: e?.message || 'Error al guardar borrador' });
    } finally {
      setSavingDraft(false);
    }
  };

  const sendCampaign = async () => {
    setConfirmSend(false);
    setSending(true);
    try {
      const { supabase } = await import('@/lib/supabase');

      // supabase.functions.invoke retorna { data, error }
      // Cuando la función retorna 4xx/5xx, 'error' tiene mensaje genérico del SDK
      // y 'data' contiene el body real con el mensaje de error de la función.
      // Por eso siempre revisamos data?.error primero.
      const { data, error } = await supabase.functions.invoke('send-campaign', {
        body: {
          userId: user?.id,
          subject: subject.trim(),
          body: body.trim(),
          segment,
          recipientCount: recipientCount || 0,
        },
      });

      // El mensaje real de error de la función está en data?.error
      if (data?.error) {
        throw new Error(data.error);
      }

      // Si no hay data (la función falló antes de responder JSON)
      if (error && !data) {
        throw new Error(
          'No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.'
        );
      }

      if (error) throw error;

      setSuccessModal({ visible: true, count: data?.sent || recipientCount || 0 });
    } catch (e: any) {
      setErrorModal({ visible: true, message: e?.message || 'Error al enviar la campaña' });
    } finally {
      setSending(false);
    }
  };

  const previewBody    = body.replace(/{{nombre}}/g, 'María').replace(/{{negocio}}/g, businessProfile?.businessName || 'Tu Negocio');
  const previewSubject = subject.replace(/{{nombre}}/g, 'María').replace(/{{negocio}}/g, businessProfile?.businessName || 'Tu Negocio');

  if (!isPremium) return null;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ConfirmModal visible={errorModal.visible} title="Error" message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'default' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })} />
      <ConfirmModal visible={confirmSend} title="Enviar campaña"
        message={`Se enviará a ${recipientCount} cliente${recipientCount !== 1 ? 's' : ''} con email registrado. ¿Continuar?`}
        buttons={[
          { text: 'Cancelar', onPress: () => setConfirmSend(false), style: 'cancel' },
          { text: 'Sí, enviar ahora', onPress: sendCampaign, style: 'default' },
        ]}
        onDismiss={() => setConfirmSend(false)} />
      <ConfirmModal visible={successModal.visible} title="¡Campaña enviada!"
        message={`Tu campaña fue enviada exitosamente a ${successModal.count} cliente${successModal.count !== 1 ? 's' : ''}.`}
        buttons={[{ text: 'Ver campañas', onPress: () => { setSuccessModal({ visible: false, count: 0 }); router.back(); }, style: 'default' }]}
        onDismiss={() => { setSuccessModal({ visible: false, count: 0 }); router.back(); }} />

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <MaterialIcons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={s.headerMid}><Text style={s.title}>Nueva campaña</Text></View>
        <TouchableOpacity onPress={saveDraft} disabled={savingDraft} style={s.draftBtn}>
          {savingDraft ? <ActivityIndicator size="small" color="#6366F1" /> : <Text style={s.draftText}>Guardar borrador</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={s.sectionLabel}>DESTINATARIOS</Text>
        <View style={s.segmentRow}>
          {SEGMENTS.map(seg => (
            <TouchableOpacity key={seg.key} style={[s.segBtn, segment === seg.key && s.segBtnActive]} onPress={() => setSegment(seg.key)}>
              <MaterialIcons name={seg.icon as any} size={16} color={segment === seg.key ? '#6366F1' : '#94A3B8'} />
              <Text style={[s.segLabel, segment === seg.key && s.segLabelActive]}>{seg.label}</Text>
              <Text style={[s.segDesc, segment === seg.key && s.segDescActive]}>{seg.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.recipientBanner}>
          <MaterialIcons name="email" size={16} color="#6366F1" />
          {loadingCount ? <ActivityIndicator size="small" color="#6366F1" /> :
            <Text style={s.recipientText}>{recipientCount === null ? '—' : recipientCount} cliente{recipientCount !== 1 ? 's' : ''} con email registrado</Text>
          }
        </View>

        <Text style={s.sectionLabel}>ASUNTO DEL EMAIL</Text>
        <View style={s.card}>
          <TextInput style={s.subjectInput} value={subject} onChangeText={setSubject} placeholder="Ej: ¡Oferta especial solo para ti!" placeholderTextColor="#CBD5E1" returnKeyType="next" />
        </View>

        <Text style={s.sectionLabel}>CONTENIDO</Text>
        <View style={s.card}>
          <TextInput style={s.bodyInput} value={body} onChangeText={setBody} placeholder="Escribe el contenido de tu email..." placeholderTextColor="#CBD5E1" multiline numberOfLines={8} textAlignVertical="top" />
          <View style={s.varsRow}>
            {VARIABLES.map(v => (
              <TouchableOpacity key={v.key} style={s.varChip} onPress={() => setBody(p => p + ` ${v.key}`)}>
                <Text style={s.varChipText}>{v.key}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.previewChip} onPress={() => { if (validate()) setShowPreview(true); }}>
              <MaterialIcons name="visibility" size={12} color="#6366F1" />
              <Text style={s.previewChipText}>Vista previa</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={[s.sendBtn, (sending || recipientCount === 0) && s.sendBtnDisabled]}
          onPress={() => { if (validate()) setConfirmSend(true); }}
          disabled={sending || recipientCount === 0}>
          {sending ? <ActivityIndicator color="#fff" /> : (
            <><MaterialIcons name="send" size={18} color="#fff" />
              <Text style={s.sendBtnText}>Enviar ahora{recipientCount !== null ? ` · ${recipientCount} destinatarios` : ''}</Text></>
          )}
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={showPreview} animationType="slide" transparent onRequestClose={() => setShowPreview(false)}>
        <View style={s.previewOverlay}>
          <View style={s.previewSheet}>
            <View style={s.previewHeader}>
              <Text style={s.previewTitle}>Vista previa del email</Text>
              <TouchableOpacity onPress={() => setShowPreview(false)}><MaterialIcons name="close" size={22} color="#64748B" /></TouchableOpacity>
            </View>
            <ScrollView style={s.previewBody} showsVerticalScrollIndicator={false}>
              <View style={s.emailFrame}>
                <View style={s.emailHeader}>
                  <View style={s.emailLogo}><MaterialIcons name="storefront" size={20} color="#fff" /></View>
                  <Text style={s.emailFromName}>{businessProfile?.businessName || 'Tu Negocio'}</Text>
                </View>
                <Text style={s.emailSubject}>{previewSubject || '(sin asunto)'}</Text>
                <View style={s.emailDivider} />
                <Text style={s.emailBody}>{previewBody || '(sin contenido)'}</Text>
                <View style={s.emailFooter}><Text style={s.emailFooterText}>Enviado con VYLTA</Text></View>
              </View>
              <Text style={s.previewNote}>El nombre "María" es solo un ejemplo.</Text>
              <View style={{ height: 30 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0' },
  back: { padding: 4 },
  headerMid: { flex: 1, paddingHorizontal: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  draftBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  draftText: { fontSize: 13, color: '#6366F1', fontWeight: '600' },
  scroll: { padding: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.2, marginBottom: 8, marginTop: 16 },
  segmentRow: { flexDirection: 'row', gap: 8 },
  segBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 10, alignItems: 'center', gap: 4, borderWidth: 0.5, borderColor: '#E2E8F0' },
  segBtnActive: { borderColor: '#6366F1', borderWidth: 1.5, backgroundColor: '#EEF2FF' },
  segLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', textAlign: 'center' },
  segLabelActive: { color: '#6366F1' },
  segDesc: { fontSize: 10, color: '#CBD5E1', textAlign: 'center' },
  segDescActive: { color: '#818CF8' },
  recipientBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EEF2FF', borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 0.5, borderColor: '#C7D2FE' },
  recipientText: { fontSize: 13, color: '#4338CA', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  subjectInput: { fontSize: 15, color: '#0F172A', paddingVertical: 4 },
  bodyInput: { fontSize: 14, color: '#0F172A', minHeight: 180, lineHeight: 22 },
  varsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, borderTopWidth: 0.5, borderTopColor: '#E2E8F0', paddingTop: 10 },
  varChip: { backgroundColor: '#F0FDF4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 0.5, borderColor: '#BBF7D0' },
  varChipText: { fontSize: 12, fontWeight: '700', color: '#065F46' },
  previewChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 0.5, borderColor: '#C7D2FE' },
  previewChipText: { fontSize: 12, fontWeight: '700', color: '#6366F1' },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#6366F1', borderRadius: 14, padding: 16, marginTop: 20 },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  previewSheet: { backgroundColor: '#F1F5F9', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0' },
  previewTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  previewBody: { padding: 16 },
  emailFrame: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 0.5, borderColor: '#E2E8F0' },
  emailHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, backgroundColor: '#6366F1' },
  emailLogo: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  emailFromName: { fontSize: 14, fontWeight: '700', color: '#fff' },
  emailSubject: { fontSize: 16, fontWeight: '700', color: '#0F172A', padding: 16, paddingBottom: 8 },
  emailDivider: { height: 0.5, backgroundColor: '#E2E8F0', marginHorizontal: 16 },
  emailBody: { fontSize: 14, color: '#374151', padding: 16, lineHeight: 22 },
  emailFooter: { backgroundColor: '#F8FAFC', padding: 12, borderTopWidth: 0.5, borderTopColor: '#E2E8F0' },
  emailFooterText: { fontSize: 11, color: '#94A3B8', textAlign: 'center' },
  previewNote: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 12, fontStyle: 'italic' },
});
