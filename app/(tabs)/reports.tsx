import { getTodayString } from '@/utils/dateUtils';
import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { getCurrentUserId } from '@/utils/api';
import { getCached, setCached, invalidateCache } from '@/utils/cache';

interface Stats {
  todayAppointments: number;
  confirmedToday: number;
  pendingToday: number;
  cancelledToday: number;
  confirmedWeek: number;
  pendingWeek: number;
  cancelledWeek: number;
  confirmedMonth: number;
  pendingMonth: number;
  cancelledMonth: number;
  totalClients: number;
  totalAppointments: number;
  completedAppointments: number;
  weekAppointments: number;
  monthAppointments: number;
  monthRevenue: number;
  pendingRevenue: number;
}

interface RecentAppointment {
  id: string;
  service_name: string;
  date: string;
  start_time: string;
  status: string;
  client: { name: string };
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  'Confirmada':  { color: '#10B981', bg: '#ECFDF5', label: 'Confirmada' },
  'Pendiente':   { color: '#F59E0B', bg: '#FFFBEB', label: 'Pendiente' },
  'Completada':  { color: '#6366F1', bg: '#EEF2FF', label: 'Completada' },
  'Cancelada':   { color: '#EF4444', bg: '#FEF2F2', label: 'Cancelada' },
  'No-show':     { color: '#9CA3AF', bg: '#F9FAFB', label: 'No-show' },
};

export default function ReportsScreen() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentAppointment[]>([]);
  const [activeTab, setActiveTab] = useState<'hoy' | 'semana' | 'mes'>('hoy');

  useFocusEffect(
    useCallback(() => {
      invalidateCache('reports_stats');
      invalidateCache('reports_recent');
      loadData(true);
    }, [])
  );

  const loadData = async (forceRefresh = false) => {
    const cachedStats = getCached<any>('reports_stats');
    const cachedRecent = getCached<any[]>('reports_recent');
    if (!forceRefresh && cachedStats && cachedRecent) {
      setStats(cachedStats);
      setRecent(cachedRecent);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const userId = await getCurrentUserId();
      const today = getTodayString();
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekStartStr = weekStart.toISOString().split('T')[0];
      const monthStart = new Date();
      monthStart.setDate(1);
      const monthStartStr = monthStart.toISOString().split('T')[0];

      const monthStartStr2 = monthStartStr;
      const [
        { data: todayApts },
        { data: weekApts },
        { data: monthApts },
        { count: totalClients },
        { count: totalAppointments },
        { data: recentApts },
        { count: completedCount },
      ] = await Promise.all([
        supabase.from('appointments').select('status').eq('user_id', userId).eq('date', today),
        supabase.from('appointments').select('id, status').eq('user_id', userId).gte('date', weekStartStr),
        supabase.from('appointments').select('id, status').eq('user_id', userId).gte('date', monthStartStr),
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('appointments').select('id, service_name, date, start_time, status, client:clients(name)').eq('user_id', userId).order('date', { ascending: false }).order('start_time', { ascending: false }).limit(10),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'Completada'),
      ]);

      setRecent((recentApts || []) as any);

      // Calcular ingresos del mes
      const { data: revenueData } = await supabase
        .from('appointments')
        .select('service_cost')
        .eq('user_id', userId)
        .eq('status', 'Pagado')
        .gte('date', monthStartStr);
      const monthRevenue = revenueData?.reduce((sum: number, a: any) => sum + (a.service_cost || 0), 0) || 0;

      const { data: pendingData } = await supabase
        .from('appointments')
        .select('service_cost')
        .eq('user_id', userId)
        .eq('status', 'Completada')
        .gte('date', monthStartStr);
      const pendingRevenue = pendingData?.reduce((sum: number, a: any) => sum + (a.service_cost || 0), 0) || 0;

      const finalStats = {
        todayAppointments: todayApts?.length || 0,
        confirmedToday: todayApts?.filter((a:any) => a.status === 'Confirmada').length || 0,
        pendingToday: todayApts?.filter((a:any) => a.status === 'Pendiente').length || 0,
        cancelledToday: todayApts?.filter((a:any) => a.status === 'Cancelada').length || 0,
        confirmedWeek: weekApts?.filter((a:any) => a.status === 'Confirmada').length || 0,
        pendingWeek: weekApts?.filter((a:any) => a.status === 'Pendiente').length || 0,
        cancelledWeek: weekApts?.filter((a:any) => a.status === 'Cancelada').length || 0,
        confirmedMonth: monthApts?.filter((a:any) => a.status === 'Confirmada').length || 0,
        pendingMonth: monthApts?.filter((a:any) => a.status === 'Pendiente').length || 0,
        cancelledMonth: monthApts?.filter((a:any) => a.status === 'Cancelada').length || 0,
        totalClients: totalClients || 0,
        totalAppointments: totalAppointments || 0,
        completedAppointments: completedCount || 0,
        weekAppointments: weekApts?.length || 0,
        monthAppointments: monthApts?.length || 0,
        monthRevenue,
        pendingRevenue,
      };

      setStats(finalStats);
      setCached('reports_stats', finalStats);
      setCached('reports_recent', recentApts || []);
    } catch (error) {
      console.error('[Reports] Failed to load:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      </SafeAreaView>
    );
  }

  const completionRate = stats && stats.totalAppointments > 0
    ? Math.round((stats.completedAppointments / stats.totalAppointments) * 100) : 0;

  const tabAppointments = activeTab === 'hoy' ? stats?.todayAppointments
    : activeTab === 'semana' ? stats?.weekAppointments : stats?.monthAppointments;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Reportes</Text>
          <Text style={styles.headerSubtitle}>Resumen de tu negocio</Text>
        </View>

        <View style={styles.tabs}>
          {(['hoy', 'semana', 'mes'] as const).map(tab => (
            <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'hoy' ? 'Hoy' : tab === 'semana' ? 'Semana' : 'Mes'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroLabel}>Citas {activeTab === 'hoy' ? 'hoy' : activeTab === 'semana' ? 'esta semana' : 'este mes'}</Text>
            <Text style={styles.heroValue}>{tabAppointments}</Text>
          </View>
          <View style={styles.heroRight}>
            <View style={styles.heroMini}><View style={[styles.heroDot, { backgroundColor: '#10B981' }]} /><Text style={styles.heroMiniText}>{activeTab === 'hoy' ? stats?.confirmedToday : activeTab === 'semana' ? stats?.confirmedWeek : stats?.confirmedMonth} confirmadas</Text></View>
            <View style={styles.heroMini}><View style={[styles.heroDot, { backgroundColor: '#F59E0B' }]} /><Text style={styles.heroMiniText}>{activeTab === 'hoy' ? stats?.pendingToday : activeTab === 'semana' ? stats?.pendingWeek : stats?.pendingMonth} pendientes</Text></View>
            <View style={styles.heroMini}><View style={[styles.heroDot, { backgroundColor: '#EF4444' }]} /><Text style={styles.heroMiniText}>{activeTab === 'hoy' ? stats?.cancelledToday : activeTab === 'semana' ? stats?.cancelledWeek : stats?.cancelledMonth} canceladas</Text></View>
          </View>
        </View>

        {/* Fila 1 — Clientes y Citas */}
        <View style={styles.statsRow}>
          <View style={[styles.statCardLarge, { borderLeftColor: '#10B981' }]}>
            <Text style={styles.statEmoji}>👥</Text>
            <Text style={styles.statValueLarge}>{stats?.totalClients}</Text>
            <Text style={styles.statLabelLarge}>Clientes</Text>
          </View>
          <View style={[styles.statCardLarge, { borderLeftColor: '#6366F1' }]}>
            <Text style={styles.statEmoji}>📅</Text>
            <Text style={styles.statValueLarge}>{stats?.totalAppointments}</Text>
            <Text style={styles.statLabelLarge}>Total citas</Text>
          </View>
        </View>

        {/* Fila 2 — Completadas y % */}
        <View style={styles.statsRow}>
          <View style={[styles.statCardLarge, { borderLeftColor: '#F59E0B' }]}>
            <Text style={styles.statEmoji}>✅</Text>
            <Text style={styles.statValueLarge}>{completionRate}%</Text>
            <Text style={styles.statLabelLarge}>Completadas</Text>
          </View>
          <View style={[styles.statCardLarge, { borderLeftColor: '#94A3B8' }]}>
            <Text style={styles.statEmoji}>📊</Text>
            <Text style={styles.statValueLarge}>{stats?.completedAppointments}</Text>
            <Text style={styles.statLabelLarge}>Servicios dados</Text>
          </View>
        </View>

        {/* Fila 3 — Ingresos */}
        <Text style={styles.ingresoTitle}>💵 Finanzas del mes</Text>
        <View style={styles.statsRow}>
          <View style={[styles.statCardLarge, { borderLeftColor: '#10B981', backgroundColor: '#ECFDF5' }]}>
            <Text style={styles.statEmoji}>💰</Text>
            <Text style={[styles.statValueLarge, { color: '#10B981' }]}>${((stats as any)?.monthRevenue || 0).toLocaleString('es-MX', { minimumFractionDigits: 0 })}</Text>
            <Text style={styles.statLabelLarge}>Cobrado</Text>
          </View>
          <View style={[styles.statCardLarge, { borderLeftColor: '#F59E0B', backgroundColor: '#FFFBEB' }]}>
            <Text style={styles.statEmoji}>⏳</Text>
            <Text style={[styles.statValueLarge, { color: '#F59E0B' }]}>${((stats as any)?.pendingRevenue || 0).toLocaleString('es-MX', { minimumFractionDigits: 0 })}</Text>
            <Text style={styles.statLabelLarge}>Por cobrar</Text>
          </View>
        </View>

        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>Tasa de completación</Text>
            <Text style={styles.progressPct}>{completionRate}%</Text>
          </View>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${completionRate}%` as any }]} />
          </View>
          <Text style={styles.progressSub}>{stats?.completedAppointments} de {stats?.totalAppointments} citas completadas</Text>
        </View>

        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>Citas recientes</Text>
          {recent.length === 0 ? (
            <View style={styles.emptyRecent}>
              <Text style={styles.emptyRecentText}>No hay citas registradas aún</Text>
            </View>
          ) : (
            recent.map(apt => {
              const cfg = STATUS_CONFIG[apt.status] || STATUS_CONFIG['Pendiente'];
              return (
                <View key={apt.id} style={styles.recentItem}>
                  <View style={styles.recentLeft}>
                    <Text style={styles.recentClient}>{(apt.client as any)?.name || 'Cliente'}</Text>
                    <Text style={styles.recentService}>{apt.service_name}</Text>
                    <Text style={styles.recentDate}>{formatDate(apt.date)} · {apt.start_time}</Text>
                  </View>
                  <View style={styles.badgesCol}>
                    {(apt as any).is_rescheduled && (
                      <View style={styles.rescheduledBadge}>
                        <Text style={styles.rescheduledText}>🔄 Reagend.</Text>
                      </View>
                    )}
                    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                      <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingBottom: 100 },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, color: '#94A3B8', marginTop: 2 },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 20, paddingBottom: 16, gap: 8 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center' },
  tabActive: { backgroundColor: '#0F172A' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  tabTextActive: { color: '#fff' },
  heroCard: { margin: 20, marginBottom: 12, backgroundColor: '#0F172A', borderRadius: 20, padding: 24, flexDirection: 'row', alignItems: 'center' },
  heroLeft: { flex: 1 },
  heroLabel: { fontSize: 13, color: '#94A3B8', marginBottom: 4 },
  heroValue: { fontSize: 56, fontWeight: '800', color: '#10B981', lineHeight: 60 },
  heroRight: { gap: 10 },
  heroMini: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroDot: { width: 8, height: 8, borderRadius: 4 },
  heroMiniText: { fontSize: 13, color: '#CBD5E1' },
  statCardLarge: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderLeftWidth: 4,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  statValueLarge: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 4,
  },
  statLabelLarge: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '500',
  },
  ingresoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
    marginTop: 4,
  },
  statsRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderLeftWidth: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  statEmoji: { fontSize: 20, marginBottom: 6 },
  statValue: { fontSize: 24, fontWeight: '800', color: '#0F172A' },
  statLabel: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  progressCard: { marginHorizontal: 20, marginBottom: 20, backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  progressTitle: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  progressPct: { fontSize: 15, fontWeight: '700', color: '#10B981' },
  progressBg: { height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', backgroundColor: '#10B981', borderRadius: 4 },
  progressSub: { fontSize: 12, color: '#94A3B8' },
  recentSection: { paddingHorizontal: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  emptyRecent: { backgroundColor: '#fff', borderRadius: 14, padding: 32, alignItems: 'center' },
  emptyRecentText: { fontSize: 14, color: '#94A3B8' },
  recentItem: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  recentLeft: { flex: 1 },
  recentClient: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  recentService: { fontSize: 13, color: '#64748B', marginTop: 2 },
  recentDate: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '600' },
  badgesCol: { alignItems: 'flex-end', gap: 4 },
  rescheduledBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  rescheduledText: { fontSize: 11, fontWeight: '600', color: '#3B82F6' },
});
