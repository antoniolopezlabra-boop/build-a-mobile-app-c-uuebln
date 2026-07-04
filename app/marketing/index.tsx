import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '@/contexts/AuthContext';
import { usePlan } from '@/contexts/PlanContext';
import { colors } from '@/styles/commonStyles';

interface Campaign {
  id: string;
  subject: string;
  body: string;
  segment: 'todos' | 'activos' | 'inactivos';
  status: 'enviada' | 'borrador' | 'fallida';
  sentAt: string | null;
  recipientCount: number;
  createdAt: string;
}

const STATUS_META: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  enviada:  { color: '#10B981', bg: '#ECFDF5', label: 'Enviada',  icon: 'check-circle' },
  borrador: { color: '#F59E0B', bg: '#FFFBEB', label: 'Borrador', icon: 'edit' },
  fallida:  { color: '#EF4444', bg: '#FEF2F2', label: 'Fallida',  icon: 'error' },
};

const SEGMENT_LABELS: Record<string, string> = {
  todos:     'Todos los clientes',
  activos:   'Solo activos',
  inactivos: 'Solo inactivos',
};

export default function MarketingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { isPremium } = usePlan();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState({ total: 0, sent: 0, recipients: 0 });

  // ⚡ FIX BUG (jul 2026): Email Marketing es feature de plan Luxury, pero esta pantalla
  // (lista) no tenía candado de plan — solo la de crear campaña. Redirigimos si no aplica.
  useEffect(() => {
    if (!isPremium) { router.replace('/settings/subscription'); }
  }, [isPremium]);

  useEffect(() => { loadCampaigns(); }, []);

  const loadCampaigns = async (isPull = false) => {
    if (isPull) setRefreshing(true); else setLoading(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data, error } = await supabase
        .from('email_campaigns')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list: Campaign[] = (data || []).map((c: any) => ({
        id: c.id,
        subject: c.subject,
        body: c.body,
        segment: c.segment,
        status: c.status,
        sentAt: c.sent_at,
        recipientCount: c.recipient_count || 0,
        createdAt: c.created_at,
      }));
      setCampaigns(list);
      setStats({
        total: list.length,
        sent: list.filter(c => c.status === 'enviada').length,
        recipients: list.filter(c => c.status === 'enviada').reduce((s, c) => s + c.recipientCount, 0),
      });
    } catch (e) {
      console.error('[Marketing] Error loading campaigns:', e);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.loading}><ActivityIndicator size="large" color="#6366F1" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <MaterialIcons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={s.headerMid}>
          <Text style={s.title}>Campañas de correo</Text>
          <Text style={s.subtitle}>Campañas a tus clientes</Text>
        </View>
        <TouchableOpacity style={s.newBtn} onPress={() => router.push('/marketing/new')}>
          <MaterialIcons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadCampaigns(true)}
            tintColor="#6366F1" colors={['#6366F1']} />
        }
      >
        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statNum}>{stats.total}</Text>
            <Text style={s.statLabel}>Campañas</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statNum, { color: '#10B981' }]}>{stats.sent}</Text>
            <Text style={s.statLabel}>Enviadas</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statNum, { color: '#6366F1' }]}>{stats.recipients}</Text>
            <Text style={s.statLabel}>Destinatarios</Text>
          </View>
        </View>

        {/* Banner si no hay campañas */}
        {campaigns.length === 0 ? (
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <MaterialIcons name="email" size={40} color="#6366F1" />
            </View>
            <Text style={s.emptyTitle}>Sin campañas aún</Text>
            <Text style={s.emptyDesc}>
              Crea tu primera campaña y envía promociones, descuentos o novedades a tus clientes directamente a su email.
            </Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/marketing/new')}>
              <MaterialIcons name="add" size={18} color="#fff" />
              <Text style={s.emptyBtnText}>Crear primera campaña</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={s.sectionLabel}>HISTORIAL DE CAMPAÑAS</Text>
            {campaigns.map(c => {
              const meta = STATUS_META[c.status] || STATUS_META.borrador;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={s.card}
                  onPress={() => router.push(`/marketing/${c.id}`)}
                  activeOpacity={0.75}
                >
                  <View style={[s.cardStripe, { backgroundColor: meta.color }]} />
                  <View style={s.cardBody}>
                    <View style={s.cardTop}>
                      <Text style={s.cardSubject} numberOfLines={1}>{c.subject}</Text>
                      <View style={[s.statusBadge, { backgroundColor: meta.bg }]}>
                        <MaterialIcons name={meta.icon as any} size={12} color={meta.color} />
                        <Text style={[s.statusText, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                    </View>
                    <Text style={s.cardSegment}>{SEGMENT_LABELS[c.segment]}</Text>
                    <View style={s.cardMeta}>
                      {c.status === 'enviada' && (
                        <View style={s.metaChip}>
                          <MaterialIcons name="group" size={12} color="#94A3B8" />
                          <Text style={s.metaText}>{c.recipientCount} destinatarios</Text>
                        </View>
                      )}
                      <View style={s.metaChip}>
                        <MaterialIcons name="access-time" size={12} color="#94A3B8" />
                        <Text style={s.metaText}>
                          {c.status === 'enviada' ? formatDate(c.sentAt) : formatDate(c.createdAt)}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color="#CBD5E1" />
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* CTA nueva campaña si ya hay campañas */}
        {campaigns.length > 0 && (
          <TouchableOpacity style={s.fab} onPress={() => router.push('/marketing/new')}>
            <MaterialIcons name="add" size={24} color="#fff" />
            <Text style={s.fabText}>Nueva campaña</Text>
          </TouchableOpacity>
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
  newBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  statNum: { fontSize: 24, fontWeight: '800', color: '#0F172A' },
  statLabel: { fontSize: 11, color: '#94A3B8', marginTop: 3, fontWeight: '500' },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.2, marginBottom: 10 },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 20, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  emptyDesc: { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#6366F1', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 20, marginTop: 8 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, flexDirection: 'row', alignItems: 'center',
    marginBottom: 8, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  cardStripe: { width: 4, alignSelf: 'stretch' },
  cardBody: { flex: 1, padding: 14, gap: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardSubject: { fontSize: 15, fontWeight: '700', color: '#0F172A', flex: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardSegment: { fontSize: 12, color: '#94A3B8' },
  cardMeta: { flexDirection: 'row', gap: 12, marginTop: 4 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  fab: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#6366F1', borderRadius: 14, padding: 16, marginTop: 8,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
