import { getTodayString } from '@/utils/dateUtils';
import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { usePlan } from '@/contexts/PlanContext';
import { useTheme } from '@/contexts/ThemeContext';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { getCurrentUserId } from '@/utils/api';
import { getCached, setCached, CACHE_TTL } from '@/utils/cache';

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

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  'Confirmada':  { color: '#10B981', label: 'Confirmada' },
  'Pendiente':   { color: '#F59E0B', label: 'Pendiente' },
  'Completada':  { color: '#6366F1', label: 'Completada' },
  'Cancelada':   { color: '#EF4444', label: 'Cancelada' },
  'No-show':     { color: '#9CA3AF', label: 'No-show' },
  'Reagendada':  { color: '#3B82F6', label: 'Reagendada' },
  'Pagado':      { color: '#10B981', label: 'Pagado' },
};

export default function ReportsScreen() {
  const { canViewReports, loading: planLoading } = usePlan();
  const router = useRouter();
  const { colors: tc, isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentAppointment[]>([]);
  const [activeTab, setActiveTab] = useState<'hoy' | 'semana' | 'mes'>('hoy');

  useFocusEffect(
    useCallback(() => {
      const cachedStats = getCached<any>('reports_stats');
      const cachedRecent = getCached<any[]>('reports_recent');
      if (cachedStats && cachedRecent) {
        setStats(cachedStats);
        setRecent(cachedRecent);
        setLoading(false);
        loadData(true, false, true);
      } else {
        loadData();
      }
    }, [])
  );

  const loadData = async (forceRefresh = false, isPullRefresh = false, silent = false) => {
    if (!forceRefresh && !isPullRefresh) {
      const cachedStats = getCached<any>('reports_stats');
      const cachedRecent = getCached<any[]>('reports_recent');
      if (cachedStats && cachedRecent) {
        setStats(cachedStats); setRecent(cachedRecent); setLoading(false); return;
      }
    }
    if (isPullRefresh) setRefreshing(true);
    else if (!silent) setLoading(true);

    try {
      const userId = await getCurrentUserId();
      const today = getTodayString();
      const weekStart = new Date();
      const dow = weekStart.getDay();
      weekStart.setDate(weekStart.getDate() - (dow === 0 ? 6 : dow - 1));
      const weekStartStr = weekStart.toISOString().split('T')[0];
      const monthStart = new Date(); monthStart.setDate(1);
      const monthStartStr = monthStart.toISOString().split('T')[0];

      const [{ data: tA }, { data: wA }, { data: mA }, { count: tC }, { count: tAC }, { data: rA }, { count: cC }] =
        await Promise.all([
          supabase.from('appointments').select('status').eq('user_id', userId).eq('date', today),
          supabase.from('appointments').select('id, status').eq('user_id', userId).gte('date', weekStartStr),
          supabase.from('appointments').select('id, status').eq('user_id', userId).gte('date', monthStartStr),
          supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('appointments').select('id, service_name, date, start_time, status, client:clients(name)').eq('user_id', userId).order('date', { ascending: false }).order('start_time', { ascending: false }).limit(10),
          supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'Completada'),
        ]);

      setRecent((rA || []) as any);
      const { data: revD } = await supabase.from('appointments').select('service_cost').eq('user_id', userId).eq('status', 'Pagado').gte('date', monthStartStr);
      const { data: penD } = await supabase.from('appointments').select('service_cost').eq('user_id', userId).eq('status', 'Completada').gte('date', monthStartStr);
      const monthRevenue = revD?.reduce((s: number, a: any) => s + (a.service_cost || 0), 0) || 0;
      const pendingRevenue = penD?.reduce((s: number, a: any) => s + (a.service_cost || 0), 0) || 0;

      const fs: Stats = {
        todayAppointments: tA?.length || 0,
        confirmedToday: tA?.filter((a: any) => a.status === 'Confirmada').length || 0,
        pendingToday: tA?.filter((a: any) => a.status === 'Pendiente').length || 0,
        cancelledToday: tA?.filter((a: any) => a.status === 'Cancelada').length || 0,
        confirmedWeek: wA?.filter((a: any) => a.status === 'Confirmada').length || 0,
        pendingWeek: wA?.filter((a: any) => a.status === 'Pendiente').length || 0,
        cancelledWeek: wA?.filter((a: any) => a.status === 'Cancelada').length || 0,
        confirmedMonth: mA?.filter((a: any) => a.status === 'Confirmada').length || 0,
        pendingMonth: mA?.filter((a: any) => a.status === 'Pendiente').length || 0,
        cancelledMonth: mA?.filter((a: any) => a.status === 'Cancelada').length || 0,
        totalClients: tC || 0, totalAppointments: tAC || 0, completedAppointments: cC || 0,
        weekAppointments: wA?.length || 0, monthAppointments: mA?.length || 0,
        monthRevenue, pendingRevenue,
      };
      setStats(fs);
      setCached('reports_stats', fs, CACHE_TTL.REPORTS);
      setCached('reports_recent', rA || [], CACHE_TTL.REPORTS);
    } catch (e) {
      console.error('[Reports]', e);
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  };

  const formatDate = (d: string) => {
    return new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  };

  if (planLoading || loading) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]}>
        <View style={s.loadingWrap}><ActivityIndicator size="large" color="#10B981" /></View>
      </SafeAreaView>
    );
  }

  if (!canViewReports) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]}>
        <View style={s.paywall}>
          <View style={[s.paywallIconWrap, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
            <Text style={{ fontSize: 36 }}>📊</Text>
          </View>
          <Text style={[s.paywallTitle, { color: tc.text }]}>Reportes en Plan Básico</Text>
          <Text style={[s.paywallDesc, { color: tc.textMuted }]}>
            Accede a reportes de ingresos, citas completadas y clientes con el Plan Básico o Premium.
          </Text>
          <TouchableOpacity style={s.paywallBtn} onPress={() => router.push('/settings/subscription')}>
            <Text style={s.paywallBtnText}>Ver planes</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const completionRate = stats && stats.totalAppointments > 0
    ? Math.round((stats.completedAppointments / stats.totalAppointments) * 100) : 0;
  const tabApts = activeTab === 'hoy' ? stats?.todayAppointments
    : activeTab === 'semana' ? stats?.weekAppointments : stats?.monthAppointments;
  const tabConf = activeTab === 'hoy' ? stats?.confirmedToday : activeTab === 'semana' ? stats?.confirmedWeek : stats?.confirmedMonth;
  const tabPend = activeTab === 'hoy' ? stats?.pendingToday : activeTab === 'semana' ? stats?.pendingWeek : stats?.pendingMonth;
  const tabCanc = activeTab === 'hoy' ? stats?.cancelledToday : activeTab === 'semana' ? stats?.cancelledWeek : stats?.cancelledMonth;

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true, true)}
            tintColor="#10B981" colors={['#10B981']} />
        }
      >
        {/* Header */}
        <View style={[s.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
          <Text style={[s.headerTitle, { color: tc.text }]}>Reportes</Text>
          <Text style={[s.headerSubtitle, { color: tc.textMuted }]}>Resumen de tu negocio</Text>
        </View>

        {/* Tabs */}
        <View style={[s.tabs, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
          {(['hoy', 'semana', 'mes'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[
                s.tab,
                { backgroundColor: tc.inputBg },
                activeTab === tab && { backgroundColor: isDark ? '#F8FAFC' : '#0F172A' },
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[
                s.tabText,
                { color: tc.textMuted },
                activeTab === tab && { color: isDark ? '#0F172A' : '#fff' },
              ]}>
                {tab === 'hoy' ? 'Hoy' : tab === 'semana' ? 'Semana' : 'Mes'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Hero card */}
        <View style={[s.heroCard, { backgroundColor: isDark ? '#1E293B' : '#0F172A' }]}>
          <View style={s.heroLeft}>
            <Text style={s.heroLabel}>
              Citas {activeTab === 'hoy' ? 'hoy' : activeTab === 'semana' ? 'esta semana' : 'este mes'}
            </Text>
            <Text style={s.heroValue}>{tabApts}</Text>
          </View>
          <View style={s.heroRight}>
            <View style={s.heroMini}>
              <View style={[s.heroDot, { backgroundColor: '#10B981' }]} />
              <Text style={s.heroMiniText}>{tabConf} confirmadas</Text>
            </View>
            <View style={s.heroMini}>
              <View style={[s.heroDot, { backgroundColor: '#F59E0B' }]} />
              <Text style={s.heroMiniText}>{tabPend} pendientes</Text>
            </View>
            <View style={s.heroMini}>
              <View style={[s.heroDot, { backgroundColor: '#EF4444' }]} />
              <Text style={s.heroMiniText}>{tabCanc} canceladas</Text>
            </View>
          </View>
        </View>

        {/* Stats generales */}
        <View style={s.statsRow}>
          <View style={[s.statCard, { backgroundColor: tc.surface, borderColor: tc.border, borderLeftColor: '#10B981' }]}>
            <Text style={s.statEmoji}>👥</Text>
            <Text style={[s.statValue, { color: tc.text }]}>{stats?.totalClients}</Text>
            <Text style={[s.statLabel, { color: tc.textMuted }]}>Clientes</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: tc.surface, borderColor: tc.border, borderLeftColor: '#6366F1' }]}>
            <Text style={s.statEmoji}>📅</Text>
            <Text style={[s.statValue, { color: tc.text }]}>{stats?.totalAppointments}</Text>
            <Text style={[s.statLabel, { color: tc.textMuted }]}>Total citas</Text>
          </View>
        </View>
        <View style={s.statsRow}>
          <View style={[s.statCard, { backgroundColor: tc.surface, borderColor: tc.border, borderLeftColor: '#F59E0B' }]}>
            <Text style={s.statEmoji}>✅</Text>
            <Text style={[s.statValue, { color: tc.text }]}>{completionRate}%</Text>
            <Text style={[s.statLabel, { color: tc.textMuted }]}>Completadas</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: tc.surface, borderColor: tc.border, borderLeftColor: '#94A3B8' }]}>
            <Text style={s.statEmoji}>📊</Text>
            <Text style={[s.statValue, { color: tc.text }]}>{stats?.completedAppointments}</Text>
            <Text style={[s.statLabel, { color: tc.textMuted }]}>Servicios dados</Text>
          </View>
        </View>

        {/* Finanzas */}
        <Text style={[s.sectionTitle, { color: tc.textMuted, paddingHorizontal: 20, marginBottom: 8, marginTop: 4, fontSize: 12, fontWeight: '800', letterSpacing: 1 }]}>
          FINANZAS DEL MES
        </Text>
        <View style={s.statsRow}>
          <View style={[s.statCard, { backgroundColor: isDark ? '#052E16' : '#ECFDF5', borderLeftColor: '#10B981', borderColor: '#10B981' }]}>
            <Text style={s.statEmoji}>💰</Text>
            <Text style={[s.statValue, { color: '#10B981' }]}>
              ${(stats?.monthRevenue || 0).toLocaleString('es-MX')}
            </Text>
            <Text style={[s.statLabel, { color: isDark ? '#6EE7B7' : '#065F46' }]}>Cobrado</Text>
          </View>
          <TouchableOpacity
            style={[s.statCard, { backgroundColor: isDark ? '#431407' : '#FFFBEB', borderLeftColor: '#F59E0B', borderColor: '#F59E0B' }]}
            onPress={() => router.push('/reports/pending-payments')}
          >
            <Text style={s.statEmoji}>⏳</Text>
            <Text style={[s.statValue, { color: '#F59E0B' }]}>
              ${(stats?.pendingRevenue || 0).toLocaleString('es-MX')}
            </Text>
            <Text style={[s.statLabel, { color: isDark ? '#FED7AA' : '#92400E' }]}>Por cobrar</Text>
            <Text style={{ fontSize: 10, color: '#F59E0B', marginTop: 4 }}>Ver detalle →</Text>
          </TouchableOpacity>
        </View>

        {/* Barra de progreso */}
        <View style={[s.progressCard, { backgroundColor: tc.surface, borderColor: tc.border }]}>
          <View style={s.progressHeader}>
            <Text style={[s.progressTitle, { color: tc.text }]}>Tasa de completación</Text>
            <Text style={s.progressPct}>{completionRate}%</Text>
          </View>
          <View style={[s.progressBg, { backgroundColor: tc.inputBg }]}>
            <View style={[s.progressFill, { width: `${completionRate}%` as any }]} />
          </View>
          <Text style={[s.progressSub, { color: tc.textMuted }]}>
            {stats?.completedAppointments} de {stats?.totalAppointments} citas completadas
          </Text>
        </View>

        {/* Citas recientes */}
        <Text style={[s.sectionTitle, { color: tc.text, paddingHorizontal: 20, marginBottom: 10 }]}>Citas recientes</Text>
        {recent.length === 0 ? (
          <View style={[s.emptyRecent, { backgroundColor: tc.surface }]}>
            <Text style={[{ fontSize: 14 }, { color: tc.textMuted }]}>No hay citas registradas aún</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20 }}>
            {recent.map(apt => {
              const cfg = STATUS_CONFIG[apt.status] || STATUS_CONFIG['Pendiente'];
              return (
                <View key={apt.id} style={[s.recentItem, { backgroundColor: tc.surface, borderColor: tc.border }]}>
                  <View style={[s.recentAccent, { backgroundColor: cfg.color }]} />
                  <View style={s.recentLeft}>
                    <Text style={[s.recentClient, { color: tc.text }]}>{(apt.client as any)?.name || 'Cliente'}</Text>
                    <Text style={[s.recentService, { color: tc.textMuted }]}>{apt.service_name}</Text>
                    <Text style={[s.recentDate, { color: tc.textMuted }]}>{formatDate(apt.date)} · {apt.start_time}</Text>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: cfg.color + '22' }]}>
                    <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1 },
  loadingWrap:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:         { paddingBottom: 100 },
  // Paywall
  paywall:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36, gap: 16 },
  paywallIconWrap:{ width: 80, height: 80, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  paywallTitle:   { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  paywallDesc:    { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  paywallBtn:     { backgroundColor: '#10B981', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 },
  paywallBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  // Header
  header:         { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1 },
  headerTitle:    { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, marginTop: 2 },
  // Tabs
  tabs:           { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 16, paddingTop: 12, gap: 8, borderBottomWidth: 1 },
  tab:            { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabText:        { fontSize: 14, fontWeight: '600' },
  // Hero
  heroCard:       { margin: 20, marginBottom: 12, borderRadius: 20, padding: 24, flexDirection: 'row', alignItems: 'center' },
  heroLeft:       { flex: 1 },
  heroLabel:      { fontSize: 13, color: '#94A3B8', marginBottom: 4 },
  heroValue:      { fontSize: 56, fontWeight: '800', color: '#10B981', lineHeight: 60 },
  heroRight:      { gap: 10 },
  heroMini:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroDot:        { width: 8, height: 8, borderRadius: 4 },
  heroMiniText:   { fontSize: 13, color: '#CBD5E1' },
  // Stats
  statsRow:       { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 12 },
  statCard:       { flex: 1, borderRadius: 14, padding: 16, borderLeftWidth: 4, borderWidth: 1, alignItems: 'center' },
  statEmoji:      { fontSize: 20, marginBottom: 6 },
  statValue:      { fontSize: 28, fontWeight: '800', marginTop: 4 },
  statLabel:      { fontSize: 12, marginTop: 4, fontWeight: '500' },
  sectionTitle:   { fontSize: 18, fontWeight: '700' },
  // Progress
  progressCard:   { marginHorizontal: 20, marginBottom: 20, borderRadius: 16, padding: 20, borderWidth: 1 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  progressTitle:  { fontSize: 15, fontWeight: '600' },
  progressPct:    { fontSize: 15, fontWeight: '700', color: '#10B981' },
  progressBg:     { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressFill:   { height: '100%', backgroundColor: '#10B981', borderRadius: 4 },
  progressSub:    { fontSize: 12 },
  // Recent
  emptyRecent:    { marginHorizontal: 20, borderRadius: 14, padding: 32, alignItems: 'center' },
  recentItem:     { borderRadius: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderWidth: 1 },
  recentAccent:   { width: 3, alignSelf: 'stretch' },
  recentLeft:     { flex: 1, padding: 14 },
  recentClient:   { fontSize: 15, fontWeight: '700' },
  recentService:  { fontSize: 13, marginTop: 2 },
  recentDate:     { fontSize: 12, marginTop: 4 },
  statusBadge:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginRight: 12 },
  statusText:     { fontSize: 12, fontWeight: '600' },
});
