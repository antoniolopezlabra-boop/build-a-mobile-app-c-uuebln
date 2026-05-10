import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '@/contexts/AuthContext';
import { ConfirmModal } from '@/components/button';

interface Campaign {
  id: string;
  subject: string;
  body: string;
  segment: 'todos' | 'activos' | 'inactivos';
  status: 'enviada' | 'borrador' | 'fallida';
  sent_at: string | null;
  recipient_count: number;
  created_at: string;
}

const STATUS_META: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  enviada:  { color: '#10B981', bg: '#ECFDF5', label: 'Enviada',  icon: 'check-circle' },
  borrador: { color: '#F59E0B', bg: '#FFFBEB', label: 'Borrador', icon: 'edit' },
  fallida:  { color: '#EF4444', bg: '#FEF2F2', label: 'Fallida',  icon: 'error' },
  error:    { color: '#EF4444', bg: '#FEF2F2', label: 'Error',    icon: 'error' },
};

const SEGMENT_LABELS: Record<string, string> = {
  todos:     'Todos los clientes',
  activos:   'Solo activos',
  inactivos: 'Solo inactivos',
};

export default function CampaignDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user, businessProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });

  useEffect(() => {
    if (id) loadCampaign();
  }, [id]);

  const loadCampaign = async () => {
    setLoading(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data, error } = await supabase
        .from('email_campaigns')
        .select('*')
        .eq('id', id)
        .eq('user_id', user?.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setErrorModal({ visible: true, message: 'Esta campaña no existe o fue eliminada.' });
        return;
      }
      setCampaign(data);
    } catch (e: any) {
      console.error('[CampaignDetail] Error:', e);
      setErrorModal({ visible: true, message: e?.message || 'Error al cargar la campaña' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    setDeleting(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase
        .from('email_campaigns')
        .delete()
        .eq('id', id)
        .eq('user_id', user?.id);
      if (error) throw error;
      router.back();
    } catch (e: any) {
      console.error('[CampaignDetail] Delete error:', e);
      setErrorModal({ visible: true, message: e?.message || 'Error al eliminar la campaña' });
    } finally {
      setDeleting(false);
    }
  };

  // Continuar editando un borrador → ir a new.tsx con datos precargados
  const handleEditDraft = () => {
    if (!campaign) return;
    router.push({
      pathname: '/marketing/new',
      params: {
        draftId:  campaign.id,
        subject:  campaign.subject,
        body:     campaign.body,
        segment:  campaign.segment,
      },
    });
  };

  // Duplicar una campaña enviada → ir a new.tsx con datos precargados (sin draftId)
  const handleDuplicate = () => {
    if (!campaign) return;
    router.push({
      pathname: '/marketing/new',
      params: {
        subject:  campaign.subject,
        body:     campaign.body,
        segment:  campaign.segment,
      },
    });
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-MX', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.loading}><ActivityIndicator size="large" color="#10B981" /></View>
      </SafeAreaView>
    );
  }

  if (!campaign) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <ConfirmModal
          visible={errorModal.visible}
          title="Campaña no encontrada"
          message={errorModal.message}
          buttons={[{
            text: 'Volver',
            onPress: () => { setErrorModal({ visible: false, message: '' }); router.back(); },
            style: 'default',
          }]}
          onDismiss={() => { setErrorModal({ visible: false, message: '' }); router.back(); }}
        />
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.back}>
            <MaterialIcons name="arrow-back" size={24} color="#0F172A" />
          </TouchableOpacity>
          <Text style={s.title}>Detalle de campaña</Text>
          <View style={{ width: 32 }} />
        </View>
      </SafeAreaView>
    );
  }

  const meta = STATUS_META[campaign.status] || STATUS_META.borrador;
  const isDraft = campaign.status === 'borrador';
  const isSent  = campaign.status === 'enviada';
  const businessName = businessProfile?.businessName || 'Tu Negocio';

  // Preview con personalización demo
  const previewSubject = campaign.subject
    .replace(/\{\{nombre\}\}/g, 'María')
    .replace(/\{\{negocio\}\}/g, businessName);
  const previewBody = campaign.body
    .replace(/\{\{nombre\}\}/g, 'María')
    .replace(/\{\{negocio\}\}/g, businessName);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ConfirmModal
        visible={errorModal.visible}
        title="Error"
        message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'default' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })}
      />

      <ConfirmModal
        visible={confirmDelete}
        title="Eliminar campaña"
        message={`¿Seguro que deseas eliminar "${campaign.subject}"? Esta acción no se puede deshacer.`}
        buttons={[
          { text: 'Cancelar', onPress: () => setConfirmDelete(false), style: 'cancel' },
          { text: 'Eliminar', onPress: handleDelete, style: 'destructive' },
        ]}
        onDismiss={() => setConfirmDelete(false)}
      />

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <MaterialIcons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={s.headerMid}>
          <Text style={s.title}>Detalle de campaña</Text>
        </View>
        <TouchableOpacity onPress={() => setConfirmDelete(true)} disabled={deleting} style={s.deleteBtn}>
          {deleting ? <ActivityIndicator size="small" color="#EF4444" /> : <MaterialIcons name="delete-outline" size={22} color="#EF4444" />}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Estado de la campaña */}
        <View style={[s.statusCard, { backgroundColor: meta.bg, borderColor: meta.color + '40' }]}>
          <View style={[s.statusIconWrap, { backgroundColor: meta.color + '20' }]}>
            <MaterialIcons name={meta.icon as any} size={22} color={meta.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.statusLabel, { color: meta.color }]}>{meta.label}</Text>
            <Text style={s.statusDate}>
              {isSent
                ? `Enviada el ${formatDate(campaign.sent_at)}`
                : `Creada el ${formatDate(campaign.created_at)}`}
            </Text>
          </View>
          {isSent && (
            <View style={s.recipientPill}>
              <MaterialIcons name="group" size={14} color="#10B981" />
              <Text style={s.recipientText}>{campaign.recipient_count}</Text>
            </View>
          )}
        </View>

        {/* Info básica */}
        <Text style={s.sectionLabel}>SEGMENTO</Text>
        <View style={s.infoCard}>
          <MaterialIcons name="filter-list" size={18} color="#10B981" />
          <Text style={s.infoText}>{SEGMENT_LABELS[campaign.segment] || campaign.segment}</Text>
        </View>

        {/* Vista previa del email */}
        <Text style={s.sectionLabel}>VISTA PREVIA</Text>
        <View style={s.emailFrame}>
          <View style={s.emailHeader}>
            <View style={s.emailLogo}>
              <MaterialIcons name="storefront" size={20} color="#fff" />
            </View>
            <Text style={s.emailFromName}>{businessName}</Text>
          </View>
          <Text style={s.emailSubject}>{previewSubject || '(sin asunto)'}</Text>
          <View style={s.emailDivider} />
          <Text style={s.emailBody}>{previewBody || '(sin contenido)'}</Text>
          <View style={s.emailFooter}>
            <Text style={s.emailFooterText}>Enviado con VYLTA</Text>
          </View>
        </View>

        <Text style={s.previewNote}>
          {isSent
            ? 'Así se vio el email enviado. El nombre "María" es solo un ejemplo de personalización.'
            : 'Así se verá el email cuando lo envíes. El nombre "María" es solo un ejemplo de personalización.'}
        </Text>

        {/* Acciones según estado */}
        <View style={s.actionsRow}>
          {isDraft && (
            <TouchableOpacity style={s.primaryBtn} onPress={handleEditDraft}>
              <MaterialIcons name="edit" size={18} color="#fff" />
              <Text style={s.primaryBtnText}>Continuar editando</Text>
            </TouchableOpacity>
          )}
          {isSent && (
            <TouchableOpacity style={s.primaryBtn} onPress={handleDuplicate}>
              <MaterialIcons name="content-copy" size={18} color="#fff" />
              <Text style={s.primaryBtnText}>Duplicar campaña</Text>
            </TouchableOpacity>
          )}
          {(campaign.status === 'fallida' || campaign.status === 'error') && (
            <TouchableOpacity style={s.primaryBtn} onPress={handleDuplicate}>
              <MaterialIcons name="refresh" size={18} color="#fff" />
              <Text style={s.primaryBtnText}>Reintentar campaña</Text>
            </TouchableOpacity>
          )}
        </View>

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
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  deleteBtn: { padding: 6 },
  scroll: { padding: 16 },

  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 20,
  },
  statusIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  statusLabel: { fontSize: 15, fontWeight: '800' },
  statusDate: { fontSize: 12, color: '#64748B', marginTop: 2 },
  recipientPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#fff', borderRadius: 99,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  recipientText: { fontSize: 12, fontWeight: '700', color: '#10B981' },

  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.2, marginBottom: 8, marginTop: 8 },

  infoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 16,
    borderWidth: 0.5, borderColor: '#E2E8F0',
  },
  infoText: { fontSize: 14, color: '#0F172A', fontWeight: '500' },

  emailFrame: {
    backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
    borderWidth: 0.5, borderColor: '#E2E8F0',
  },
  emailHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 16, backgroundColor: '#10B981',
  },
  emailLogo: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  emailFromName: { fontSize: 14, fontWeight: '700', color: '#fff' },
  emailSubject: {
    fontSize: 16, fontWeight: '700', color: '#0F172A',
    padding: 16, paddingBottom: 8,
  },
  emailDivider: { height: 0.5, backgroundColor: '#E2E8F0', marginHorizontal: 16 },
  emailBody: { fontSize: 14, color: '#374151', padding: 16, lineHeight: 22 },
  emailFooter: {
    backgroundColor: '#F8FAFC', padding: 12,
    borderTopWidth: 0.5, borderTopColor: '#E2E8F0',
  },
  emailFooterText: { fontSize: 11, color: '#94A3B8', textAlign: 'center' },

  previewNote: {
    fontSize: 11, color: '#94A3B8', textAlign: 'center',
    marginTop: 10, fontStyle: 'italic',
  },

  actionsRow: { gap: 10, marginTop: 24 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#10B981', borderRadius: 14, padding: 16,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
