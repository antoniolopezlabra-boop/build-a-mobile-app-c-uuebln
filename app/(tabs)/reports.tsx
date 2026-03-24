import { getTodayString } from '@/utils/dateUtils';
import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { usePlan } from '@/contexts/PlanContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, TouchableOpacity, RefreshControl, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { getCurrentUserId } from '@/utils/api';
import { getCached, setCached, CACHE_TTL } from '@/utils/cache';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

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
  // Clientes nuevos por semana del mes (para la gráfica)
  clientsThisMonth: number;
  clientsLastMonth: number;
  clientsPerWeek: number[];
}

interface AppointmentItem {
  id: string;
  service_name: string;
  date: string;
  start_time: string;
  status: string;
  client_name: string;
}

interface StaffStat {
  id: string;
  name: string;
  color: string;
  role: string | null;
  total: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  noshow: number;
  completionRate: number;
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  'Confirmada': { color: '#10B981', label: 'Confirmada' },
  'Pendiente':  { color: '#F59E0B', label: 'Pendiente' },
  'Completada': { color: '#6366F1', label: 'Completada' },
  'Cancelada':  { color: '#EF4444', label: 'Cancelada' },
  'No asistió':{ color: '#9CA3AF', label: 'No asistió' },
  'Reagendada': { color: '#3B82F6', label: 'Reagendada' },
  'Pagado':     { color: '#10B981', label: 'Pagado' },
};

export default function ReportsScreen() {
  const { canViewReports, isPremium, loading: planLoading } = usePlan();
  const { user } = useAuth();
  const router = useRouter();
  const { colors: tc, isDark } = useTheme();

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats]           = useState<Stats | null>(null);
  const [staffStats, setStaffStats] = useState<StaffStat[]>([]);
  const [activeTab, setActiveTab]   = useState<'hoy' | 'semana' | 'mes'>('hoy');
  const [reportTab, setReportTab]   = useState<'general' | 'equipo'>('general');
  const [staffRange, setStaffRange] = useState<'semana' | 'mes' | 'todo'>('mes');

  // Modal de historial de citas (al tocar Total citas)
  const [aptsModal, setAptsModal]       = useState(false);
  const [aptsLoading, setAptsLoading]   = useState(false);
  const [aptsList, setAptsList]         = useState<AppointmentItem[]>([]);

  // Modal de gráfica de clientes
  const [clientsModal, setClientsModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const cached = getCached<any>('reports_stats');
      if (cached) { setStats(cached); setLoading(false); loadData(true, false, true); }
      else loadData();
    }, [])
  );

  const loadData = async (forceRefresh = false, isPullRefresh = false, silent = false) => {
    if (!forceRefresh && !isPullRefresh) {
      const cached = getCached<any>('reports_stats');
      if (cached) { setStats(cached); setLoading(false); return; }
    }
    if (isPullRefresh) setRefreshing(true);
    else if (!silent) setLoading(true);

    try {
      const userId = await getCurrentUserId();
      const today = getTodayString();
      const weekStart = new Date();
      const dow = weekStart.getDay();
      weekStart.setDate(weekStart.getDate() - (dow === 0 ? 6 : dow - 1));
      const weekStartStr  = weekStart.toISOString().split('T')[0];
      const monthStart    = new Date(); monthStart.setDate(1);
      const monthStartStr = monthStart.toISOString().split('T')[0];
      // Mes anterior para comparar clientes
      const lastMonthStart = new Date(); lastMonthStart.setMonth(lastMonthStart.getMonth() - 1); lastMonthStart.setDate(1);
      const lastMonthEnd   = new Date(); lastMonthEnd.setDate(0);
      const lastMonthStartStr = lastMonthStart.toISOString().split('T')[0];
      const lastMonthEndStr   = lastMonthEnd.toISOString().split('T')[0];

      const [{ data: tA }, { data: wA }, { data: mA }, { count: tC }, { count: tAC }, { count: cC }] =
        await Promise.all([
          supabase.from('appointments').select('status').eq('user_id', userId).eq('date', today),
          supabase.from('appointments').select('id, status').eq('user_id', userId).gte('date', weekStartStr),
          supabase.from('appointments').select('id, status').eq('user_id', userId).gte('date', monthStartStr),
          supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('user_id', userId).in('status', ['Completada', 'Pagado']),
        ]);

      const { data: revD } = await supabase.from('appointments').select('service_cost').eq('user_id', userId).eq('status', 'Pagado').gte('date', monthStartStr);
      const { data: penD } = await supabase.from('appointments').select('service_cost').eq('user_id', userId).eq('status', 'Completada').gte('date', monthStartStr);
      const monthRevenue   = revD?.reduce((s: number, a: any) => s + (a.service_cost || 0), 0) || 0;
      const pendingRevenue = penD?.reduce((s: number, a: any) => s + (a.service_cost || 0), 0) || 0;

      // Clientes nuevos este mes vs mes pasado
      const { count: clientsThisMonth }  = await supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', monthStartStr);
      const { count: clientsLastMonth }  = await supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', lastMonthStartStr).lte('created_at', lastMonthEndStr);

      // Clientes por semana del mes actual (4 semanas)
      const { data: clientsMonthData } = await supabase.from('clients').select('created_at').eq('user_id', userId).gte('created_at', monthStartStr).order('created_at');
      const clientsPerWeek = [0, 0, 0, 0];
      (clientsMonthData || []).forEach((c: any) => {
        const d = new Date(c.created_at);
        const dayOfMonth = d.getDate();
        const weekIdx = Math.min(Math.floor((dayOfMonth - 1) / 7), 3);
        clientsPerWeek[weekIdx]++;
      });

      const fs: Stats = {
        todayAppointments: tA?.length || 0,
        confirmedToday:    tA?.filter((a: any) => a.status === 'Confirmada').length || 0,
        pendingToday:      tA?.filter((a: any) => a.status === 'Pendiente').length || 0,
        cancelledToday:    tA?.filter((a: any) => a.status === 'Cancelada').length || 0,
        confirmedWeek:     wA?.filter((a: any) => a.status === 'Confirmada').length || 0,
        pendingWeek:       wA?.filter((a: any) => a.status === 'Pendiente').length || 0,
        cancelledWeek:     wA?.filter((a: any) => a.status === 'Cancelada').length || 0,
        confirmedMonth:    mA?.filter((a: any) => a.status === 'Confirmada').length || 0,
        pendingMonth:      mA?.filter((a: any) => a.status === 'Pendiente').length || 0,
        cancelledMonth:    mA?.filter((a: any) => a.status === 'Cancelada').length || 0,
        totalClients: tC || 0, totalAppointments: tAC || 0, completedAppointments: cC || 0,
        weekAppointments: wA?.length || 0, monthAppointments: mA?.length || 0,
        monthRevenue, pendingRevenue,
        clientsThisMonth: clientsThisMonth || 0,
        clientsLastMonth: clientsLastMonth || 0,
        clientsPerWeek,
      };
      setStats(fs);
      setCached('reports_stats', fs, CACHE_TTL.REPORTS);

      if (isPremium) await loadStaffStats(userId, staffRange);
    } catch (e) {
      console.error('[Reports]', e);
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  };

  // Cargar historial de citas según el tab activo
  const openAppointmentsHistory = async () => {
    setAptsModal(true);
    setAptsLoading(true);
    try {
      const userId = await getCurrentUserId();
      const today = getTodayString();
      let query = supabase
        .from('appointments')
        .select('id, service_name, date, start_time, status, client:clients(name), client_name_temp')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .order('start_time', { ascending: false });

      if (activeTab === 'hoy') {
        query = query.eq('date', today);
      } else if (activeTab === 'semana') {
        const weekStart = new Date();
        const dow = weekStart.getDay();
        weekStart.setDate(weekStart.getDate() - (dow === 0 ? 6 : dow - 1));
        query = query.gte('date', weekStart.toISOString().split('T')[0]);
      } else {
        const monthStart = new Date(); monthStart.setDate(1);
        query = query.gte('date', monthStart.toISOString().split('T')[0]);
      }

      const { data } = await query.limit(50);
      setAptsList((data || []).map((a: any) => ({
        id: a.id,
        service_name: a.service_name,
        date: a.date,
        start_time: a.start_time,
        status: a.status,
        client_name: (a.client as any)?.name || a.client_name_temp || 'Cliente',
      })));
    } catch (e) {
      console.error('[Reports apts]', e);
    } finally {
      setAptsLoading(false);
    }
  };

  const loadStaffStats = async (userId: string, range: 'semana' | 'mes' | 'todo') => {
    try {
      let fromDate: string | null = null;
      if (range === 'semana') {
        const d = new Date(); const dow = d.getDay();
        d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
        fromDate = d.toISOString().split('T')[0];
      } else if (range === 'mes') {
        const d = new Date(); d.setDate(1);
        fromDate = d.toISOString().split('T')[0];
      }
      const { data: staffList } = await supabase
        .from('staff_members').select('id, name, color, role')
        .eq('user_id', userId).eq('is_active', true).order('sort_order');
      if (!staffList || staffList.length === 0) { setStaffStats([]); return; }
      let query = supabase.from('appointments').select('staff_id, status').eq('user_id', userId).not('staff_id', 'is', null);
      if (fromDate) query = query.gte('date', fromDate);
      const { data: apts } = await query;
      const result: StaffStat[] = staffList.map(m => {
        const mine       = (apts || []).filter((a: any) => a.staff_id === m.id);
        const total      = mine.length;
        const completed  = mine.filter((a: any) => ['Completada', 'Pagado'].includes(a.status)).length;
        const confirmed  = mine.filter((a: any) => a.status === 'Confirmada').length;
        const cancelled  = mine.filter((a: any) => a.status === 'Cancelada').length;
        const noshow     = mine.filter((a: any) => a.status === 'No asistió').length;
        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
        return { id: m.id, name: m.name, color: m.color, role: m.role, total, confirmed, completed, cancelled, noshow, completionRate };
      });
      result.sort((a, b) => b.total - a.total);
      setStaffStats(result);
    } catch (e) { console.error('[Reports staff]', e); }
  };

  const handleStaffRangeChange = async (range: 'semana' | 'mes' | 'todo') => {
    setStaffRange(range);
    const userId = await getCurrentUserId();
    await loadStaffStats(userId, range);
  };

  const formatDate = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });

  const tabLabel = activeTab === 'hoy' ? 'hoy' : activeTab === 'semana' ? 'esta semana' : 'este mes';

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

  const tabApts = activeTab === 'hoy' ? stats?.todayAppointments : activeTab === 'semana' ? stats?.weekAppointments : stats?.monthAppointments;
  const tabConf = activeTab === 'hoy' ? stats?.confirmedToday  : activeTab === 'semana' ? stats?.confirmedWeek  : stats?.confirmedMonth;
  const tabPend = activeTab === 'hoy' ? stats?.pendingToday    : activeTab === 'semana' ? stats?.pendingWeek    : stats?.pendingMonth;
  const tabCanc = activeTab === 'hoy' ? stats?.cancelledToday  : activeTab === 'semana' ? stats?.cancelledWeek  : stats?.cancelledMonth;
  const maxStaffTotal = staffStats.length > 0 ? Math.max(...staffStats.map(s => s.total), 1) : 1;

  // Para la gráfica de clientes por semana
  const cpw = stats?.clientsPerWeek || [0, 0, 0, 0];
  const maxCpw = Math.max(...cpw, 1);
  const clientGrowth = stats && stats.clientsLastMonth > 0
    ? Math.round(((stats.clientsThisMonth - stats.clientsLastMonth) / stats.clientsLastMonth) * 100)
    : null;

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

        {/* Tab principal General / Mi equipo */}
        {isPremium && staffStats.length > 0 && (
          <View style={[s.reportTabRow, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
            <TouchableOpacity style={[s.reportTab, reportTab === 'general' && s.reportTabActive]} onPress={() => setReportTab('general')}>
              <MaterialIcons name="bar-chart" size={16} color={reportTab === 'general' ? '#fff' : tc.textMuted} />
              <Text style={[s.reportTabText, { color: reportTab === 'general' ? '#fff' : tc.textMuted }]}>General</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.reportTab, reportTab === 'equipo' && { backgroundColor: '#6366F1', borderColor: '#6366F1' }]}
              onPress={() => setReportTab('equipo')}
            >
              <MaterialIcons name="group" size={16} color={reportTab === 'equipo' ? '#fff' : tc.textMuted} />
              <Text style={[s.reportTabText, { color: reportTab === 'equipo' ? '#fff' : tc.textMuted }]}>Mi equipo</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ====== REPORTE: MI EQUIPO ====== */}
        {reportTab === 'equipo' && isPremium && (
          <View>
            <View style={[s.rangePicker, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
              {(['semana', 'mes', 'todo'] as const).map(r => (
                <TouchableOpacity key={r} style={[s.rangeBtn, { backgroundColor: tc.inputBg }, staffRange === r && { backgroundColor: '#6366F1' }]} onPress={() => handleStaffRangeChange(r)}>
                  <Text style={[s.rangeBtnText, { color: staffRange === r ? '#fff' : tc.textMuted }]}>
                    {r === 'semana' ? 'Esta semana' : r === 'mes' ? 'Este mes' : 'Todo'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {staffStats.length === 0 ? (
              <View style={s.staffEmptyWrap}>
                <MaterialIcons name="group-off" size={40} color={tc.border} />
                <Text style={[s.staffEmptyTitle, { color: tc.text }]}>Sin datos de equipo</Text>
                <Text style={[s.staffEmptyDesc, { color: tc.textMuted }]}>Asigna colaboradores a tus citas para ver estadísticas aquí.</Text>
              </View>
            ) : (
              <View style={{ padding: 16 }}>
                <Text style={[s.staffSectionLabel, { color: tc.textMuted }]}>RANKING DE ACTIVIDAD</Text>
                {staffStats.map((st, idx) => (
                  <View key={st.id} style={[s.staffCard, { backgroundColor: tc.surface }]}>
                    <View style={s.staffCardHeader}>
                      <View style={[s.rankBadge, { backgroundColor: idx === 0 ? '#FEF3C7' : idx === 1 ? '#F1F5F9' : '#FFF7ED' }]}>
                        <Text style={[s.rankNum, { color: idx === 0 ? '#92400E' : idx === 1 ? '#475569' : '#9A3412' }]}>#{idx + 1}</Text>
                      </View>
                      <View style={[s.staffAvatar, { backgroundColor: st.color + '20', borderColor: st.color }]}>
                        <Text style={[s.staffAvatarText, { color: st.color }]}>{st.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.staffName, { color: tc.text }]}>{st.name}</Text>
                        {st.role && <Text style={[s.staffRole, { color: tc.textMuted }]}>{st.role}</Text>}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[s.staffTotalNum, { color: st.color }]}>{st.total}</Text>
                        <Text style={[s.staffTotalLabel, { color: tc.textMuted }]}>citas</Text>
                      </View>
                    </View>
                    <View style={[s.staffBarBg, { backgroundColor: tc.inputBg }]}>
                      <View style={[s.staffBarFill, { backgroundColor: st.color, width: `${Math.round((st.total / maxStaffTotal) * 100)}%` as any }]} />
                    </View>
                    <View style={s.staffMetrics}>
                      <View style={[s.metricChip, { backgroundColor: '#ECFDF5' }]}>
                        <View style={[s.metricDot, { backgroundColor: '#10B981' }]} />
                        <Text style={[s.metricNum, { color: '#10B981' }]}>{st.completed}</Text>
                        <Text style={[s.metricLabel, { color: '#065F46' }]}>completadas</Text>
                      </View>
                      <View style={[s.metricChip, { backgroundColor: '#EFF6FF' }]}>
                        <View style={[s.metricDot, { backgroundColor: '#3B82F6' }]} />
                        <Text style={[s.metricNum, { color: '#3B82F6' }]}>{st.confirmed}</Text>
                        <Text style={[s.metricLabel, { color: '#1E40AF' }]}>confirmadas</Text>
                      </View>
                      <View style={[s.metricChip, { backgroundColor: '#FEF2F2' }]}>
                        <View style={[s.metricDot, { backgroundColor: '#EF4444' }]} />
                        <Text style={[s.metricNum, { color: '#EF4444' }]}>{st.cancelled + st.noshow}</Text>
                        <Text style={[s.metricLabel, { color: '#991B1B' }]}>canceladas</Text>
                      </View>
                      <View style={[s.metricChip, { backgroundColor: st.color + '15' }]}>
                        <Text style={[s.metricNum, { color: st.color }]}>{st.completionRate}%</Text>
                        <Text style={[s.metricLabel, { color: st.color }]}>completación</Text>
                      </View>
                    </View>
                  </View>
                ))}
                <View style={[s.teamTotalsCard, { backgroundColor: isDark ? '#1E293B' : '#0F172A' }]}>
                  <Text style={s.teamTotalsTitle}>Resumen del equipo</Text>
                  <View style={s.teamTotalsRow}>
                    <View style={s.teamTotalItem}>
                      <Text style={s.teamTotalNum}>{staffStats.reduce((a, b) => a + b.total, 0)}</Text>
                      <Text style={s.teamTotalLabel}>Total citas</Text>
                    </View>
                    <View style={s.teamTotalItem}>
                      <Text style={[s.teamTotalNum, { color: '#10B981' }]}>{staffStats.reduce((a, b) => a + b.completed, 0)}</Text>
                      <Text style={s.teamTotalLabel}>Completadas</Text>
                    </View>
                    <View style={s.teamTotalItem}>
                      <Text style={[s.teamTotalNum, { color: '#EF4444' }]}>{staffStats.reduce((a, b) => a + b.cancelled + b.noshow, 0)}</Text>
                      <Text style={s.teamTotalLabel}>Canceladas</Text>
                    </View>
                    <View style={s.teamTotalItem}>
                      <Text style={[s.teamTotalNum, { color: '#F59E0B' }]}>
                        {staffStats.length > 0 ? Math.round(staffStats.reduce((a, b) => a + b.completionRate, 0) / staffStats.length) : 0}%
                      </Text>
                      <Text style={s.teamTotalLabel}>Promedio</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ====== REPORTE: GENERAL ====== */}
        {reportTab === 'general' && (
          <View>
            {/* Tabs hoy/semana/mes */}
            <View style={[s.tabs, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
              {(['hoy', 'semana', 'mes'] as const).map(tab => (
                <TouchableOpacity
                  key={tab}
                  style={[s.tab, { backgroundColor: tc.inputBg }, activeTab === tab && { backgroundColor: isDark ? '#F8FAFC' : '#0F172A' }]}
                  onPress={() => setActiveTab(tab)}
                >
                  <Text style={[s.tabText, { color: tc.textMuted }, activeTab === tab && { color: isDark ? '#0F172A' : '#fff' }]}>
                    {tab === 'hoy' ? 'Hoy' : tab === 'semana' ? 'Semana' : 'Mes'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Hero */}
            <View style={[s.heroCard, { backgroundColor: isDark ? '#1E293B' : '#0F172A' }]}>
              <View style={s.heroLeft}>
                <Text style={s.heroLabel}>Citas {tabLabel}</Text>
                <Text style={s.heroValue}>{tabApts}</Text>
              </View>
              <View style={s.heroRight}>
                <View style={s.heroMini}><View style={[s.heroDot, { backgroundColor: '#10B981' }]} /><Text style={s.heroMiniText}>{tabConf} confirmadas</Text></View>
                <View style={s.heroMini}><View style={[s.heroDot, { backgroundColor: '#F59E0B' }]} /><Text style={s.heroMiniText}>{tabPend} pendientes</Text></View>
                <View style={s.heroMini}><View style={[s.heroDot, { backgroundColor: '#EF4444' }]} /><Text style={s.heroMiniText}>{tabCanc} canceladas</Text></View>
              </View>
            </View>

            {/* Stats cards: Clientes (clickeable) + Total citas (clickeable) */}
            <Text style={[s.sectionLabel, { color: tc.textMuted }]}>INDICADORES</Text>
            <View style={s.statsRow}>
              {/* Clientes → abre gráfica de crecimiento */}
              <TouchableOpacity
                style={[s.statCard, s.statCardTouchable, { backgroundColor: tc.surface, borderColor: tc.border, borderLeftColor: '#10B981' }]}
                onPress={() => setClientsModal(true)}
                activeOpacity={0.75}
              >
                <Text style={s.statEmoji}>👥</Text>
                <Text style={[s.statValue, { color: tc.text }]}>{stats?.totalClients}</Text>
                <Text style={[s.statLabel, { color: tc.textMuted }]}>Clientes</Text>
                <View style={s.tapHint}>
                  <MaterialIcons name="bar-chart" size={11} color="#10B981" />
                  <Text style={[s.tapHintText, { color: '#10B981' }]}>Ver gráfica</Text>
                </View>
              </TouchableOpacity>

              {/* Total citas → abre historial filtrado por tab */}
              <TouchableOpacity
                style={[s.statCard, s.statCardTouchable, { backgroundColor: tc.surface, borderColor: tc.border, borderLeftColor: '#6366F1' }]}
                onPress={openAppointmentsHistory}
                activeOpacity={0.75}
              >
                <Text style={s.statEmoji}>📅</Text>
                <Text style={[s.statValue, { color: tc.text }]}>{tabApts}</Text>
                <Text style={[s.statLabel, { color: tc.textMuted }]}>Citas {activeTab === 'hoy' ? 'hoy' : activeTab === 'semana' ? 'semana' : 'mes'}</Text>
                <View style={s.tapHint}>
                  <MaterialIcons name="list" size={11} color="#6366F1" />
                  <Text style={[s.tapHintText, { color: '#6366F1' }]}>Ver historial</Text>
                </View>
              </TouchableOpacity>
            </View>

            <View style={s.statsRow}>
              {/* Completadas (informativo) */}
              <View style={[s.statCard, { backgroundColor: tc.surface, borderColor: tc.border, borderLeftColor: '#F59E0B' }]}>
                <Text style={s.statEmoji}>✅</Text>
                <Text style={[s.statValue, { color: tc.text }]}>{stats?.completedAppointments}</Text>
                <Text style={[s.statLabel, { color: tc.textMuted }]}>Completadas</Text>
                <Text style={[s.statSub, { color: tc.textMuted }]}>total histórico</Text>
              </View>
              {/* Servicios dados (informativo) */}
              <View style={[s.statCard, { backgroundColor: tc.surface, borderColor: tc.border, borderLeftColor: '#94A3B8' }]}>
                <Text style={s.statEmoji}>✂️</Text>
                <Text style={[s.statValue, { color: tc.text }]}>{stats?.completedAppointments}</Text>
                <Text style={[s.statLabel, { color: tc.textMuted }]}>Servicios dados</Text>
                <Text style={[s.statSub, { color: tc.textMuted }]}>total histórico</Text>
              </View>
            </View>

            {/* Finanzas del mes */}
            <Text style={[s.sectionLabel, { color: tc.textMuted }]}>FINANZAS DEL MES</Text>
            <View style={s.statsRow}>
              <View style={[s.statCard, { backgroundColor: isDark ? '#052E16' : '#ECFDF5', borderLeftColor: '#10B981', borderColor: '#10B981' }]}>
                <Text style={s.statEmoji}>💰</Text>
                <Text style={[s.statValue, { color: '#10B981' }]}>${(stats?.monthRevenue || 0).toLocaleString('es-MX')}</Text>
                <Text style={[s.statLabel, { color: isDark ? '#6EE7B7' : '#065F46' }]}>Cobrado</Text>
              </View>
              <TouchableOpacity
                style={[s.statCard, { backgroundColor: isDark ? '#431407' : '#FFFBEB', borderLeftColor: '#F59E0B', borderColor: '#F59E0B' }]}
                onPress={() => router.push('/reports/pending-payments')}
              >
                <Text style={s.statEmoji}>⏳</Text>
                <Text style={[s.statValue, { color: '#F59E0B' }]}>${(stats?.pendingRevenue || 0).toLocaleString('es-MX')}</Text>
                <Text style={[s.statLabel, { color: isDark ? '#FED7AA' : '#92400E' }]}>Por cobrar</Text>
                <View style={s.tapHint}>
                  <MaterialIcons name="chevron-right" size={11} color="#F59E0B" />
                  <Text style={[s.tapHintText, { color: '#F59E0B' }]}>Ver detalle</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ====== MODAL: Historial de citas ====== */}
      <Modal visible={aptsModal} animationType="slide" transparent onRequestClose={() => setAptsModal(false)}>
        <View style={s.modalOverlay}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setAptsModal(false)} />
          <View style={[s.modalBox, { backgroundColor: tc.surface }]}>
            <View style={s.modalHandle} />
            <View style={s.modalHeader}>
              <View>
                <Text style={[s.modalTitle, { color: tc.text }]}>Citas {tabLabel}</Text>
                <Text style={[s.modalSub, { color: tc.textMuted }]}>{tabApts} citas en total</Text>
              </View>
              <TouchableOpacity onPress={() => setAptsModal(false)}>
                <MaterialIcons name="close" size={22} color={tc.textMuted} />
              </TouchableOpacity>
            </View>

            {aptsLoading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator color="#10B981" size="large" />
              </View>
            ) : aptsList.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 36 }}>📅</Text>
                <Text style={[{ fontSize: 15, fontWeight: '600' }, { color: tc.text }]}>Sin citas {tabLabel}</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '85%' }}>
                {aptsList.map(apt => {
                  const cfg = STATUS_CONFIG[apt.status] || { color: '#94A3B8', label: apt.status };
                  return (
                    <TouchableOpacity
                      key={apt.id}
                      style={[s.aptRow, { borderBottomColor: tc.border }]}
                      onPress={() => { setAptsModal(false); router.push(`/appointments/${apt.id}` as any); }}
                      activeOpacity={0.7}
                    >
                      <View style={[s.aptAccent, { backgroundColor: cfg.color }]} />
                      <View style={{ flex: 1, paddingLeft: 12 }}>
                        <Text style={[s.aptClient, { color: tc.text }]}>{apt.client_name}</Text>
                        <Text style={[s.aptService, { color: tc.textMuted }]}>{apt.service_name}</Text>
                        <Text style={[s.aptDate, { color: tc.textMuted }]}>{formatDate(apt.date)} · {apt.start_time}</Text>
                      </View>
                      <View style={[s.aptStatusBadge, { backgroundColor: cfg.color + '22' }]}>
                        <Text style={[s.aptStatusText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                      <MaterialIcons name="chevron-right" size={18} color={tc.border} style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  );
                })}
                <View style={{ height: 40 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ====== MODAL: Gráfica de clientes ====== */}
      <Modal visible={clientsModal} animationType="slide" transparent onRequestClose={() => setClientsModal(false)}>
        <View style={s.modalOverlay}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setClientsModal(false)} />
          <View style={[s.modalBox, { backgroundColor: tc.surface }]}>
            <View style={s.modalHandle} />
            <View style={s.modalHeader}>
              <View>
                <Text style={[s.modalTitle, { color: tc.text }]}>Crecimiento de clientes</Text>
                <Text style={[s.modalSub, { color: tc.textMuted }]}>{stats?.totalClients} clientes en total</Text>
              </View>
              <TouchableOpacity onPress={() => setClientsModal(false)}>
                <MaterialIcons name="close" size={22} color={tc.textMuted} />
              </TouchableOpacity>
            </View>

            {/* KPIs de clientes */}
            <View style={s.clientKpiRow}>
              <View style={[s.clientKpi, { backgroundColor: isDark ? '#0F2D1A' : '#ECFDF5' }]}>
                <Text style={[s.clientKpiNum, { color: '#10B981' }]}>{stats?.clientsThisMonth || 0}</Text>
                <Text style={[s.clientKpiLabel, { color: isDark ? '#6EE7B7' : '#065F46' }]}>Nuevos este mes</Text>
              </View>
              <View style={[s.clientKpi, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                <Text style={[s.clientKpiNum, { color: tc.text }]}>{stats?.clientsLastMonth || 0}</Text>
                <Text style={[s.clientKpiLabel, { color: tc.textMuted }]}>Mes anterior</Text>
              </View>
              <View style={[s.clientKpi, { backgroundColor: (clientGrowth ?? 0) >= 0 ? (isDark ? '#0F2D1A' : '#ECFDF5') : (isDark ? '#2D0F0F' : '#FEF2F2') }]}>
                <Text style={[s.clientKpiNum, { color: (clientGrowth ?? 0) >= 0 ? '#10B981' : '#EF4444' }]}>
                  {clientGrowth !== null ? `${clientGrowth >= 0 ? '+' : ''}${clientGrowth}%` : '—'}
                </Text>
                <Text style={[s.clientKpiLabel, { color: tc.textMuted }]}>Variación</Text>
              </View>
            </View>

            {/* Gráfica de barras por semana del mes */}
            <Text style={[s.chartTitle, { color: tc.textMuted }]}>CLIENTES NUEVOS POR SEMANA (MES ACTUAL)</Text>
            <View style={s.chartWrap}>
              {cpw.map((val, i) => {
                const pct = maxCpw > 0 ? (val / maxCpw) : 0;
                const barH = Math.max(pct * 120, 4);
                return (
                  <View key={i} style={s.barCol}>
                    <Text style={[s.barVal, { color: '#10B981' }]}>{val > 0 ? val : ''}</Text>
                    <View style={[s.barBg, { backgroundColor: tc.inputBg }]}>
                      <View style={[s.barFill, { height: barH, backgroundColor: val > 0 ? '#10B981' : tc.border }]} />
                    </View>
                    <Text style={[s.barLabel, { color: tc.textMuted }]}>Sem {i + 1}</Text>
                  </View>
                );
              })}
            </View>

            <TouchableOpacity
              style={s.goClientsBtn}
              onPress={() => { setClientsModal(false); router.push('/clients' as any); }}
            >
              <MaterialIcons name="people" size={16} color="#fff" />
              <Text style={s.goClientsBtnText}>Ver todos mis clientes</Text>
            </TouchableOpacity>

            <View style={{ height: 24 }} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1 },
  loadingWrap:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:          { paddingBottom: 100 },
  paywall:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36, gap: 16 },
  paywallIconWrap: { width: 80, height: 80, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  paywallTitle:    { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  paywallDesc:     { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  paywallBtn:      { backgroundColor: '#10B981', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 },
  paywallBtnText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
  header:          { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1 },
  headerTitle:     { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  headerSubtitle:  { fontSize: 14, marginTop: 2 },
  reportTabRow:    { flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: 0.5 },
  reportTab:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 12, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: 'transparent' },
  reportTabActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  reportTabText:   { fontSize: 14, fontWeight: '600' },
  rangePicker:     { flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: 0.5 },
  rangeBtn:        { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  rangeBtnText:    { fontSize: 12, fontWeight: '600' },
  tabs:            { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 16, paddingTop: 12, gap: 8, borderBottomWidth: 1 },
  tab:             { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabText:         { fontSize: 14, fontWeight: '600' },
  heroCard:        { margin: 20, marginBottom: 12, borderRadius: 20, padding: 24, flexDirection: 'row', alignItems: 'center' },
  heroLeft:        { flex: 1 },
  heroLabel:       { fontSize: 13, color: '#94A3B8', marginBottom: 4 },
  heroValue:       { fontSize: 56, fontWeight: '800', color: '#10B981', lineHeight: 60 },
  heroRight:       { gap: 10 },
  heroMini:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroDot:         { width: 8, height: 8, borderRadius: 4 },
  heroMiniText:    { fontSize: 13, color: '#CBD5E1' },
  sectionLabel:    { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, paddingHorizontal: 20, marginBottom: 10, marginTop: 16 },
  statsRow:        { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 12 },
  statCard:        { flex: 1, borderRadius: 14, padding: 16, borderLeftWidth: 4, borderWidth: 1, alignItems: 'center' },
  statCardTouchable: { shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  statEmoji:       { fontSize: 20, marginBottom: 6 },
  statValue:       { fontSize: 28, fontWeight: '800', marginTop: 4 },
  statLabel:       { fontSize: 12, marginTop: 4, fontWeight: '500' },
  statSub:         { fontSize: 10, marginTop: 3 },
  tapHint:         { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6 },
  tapHintText:     { fontSize: 10, fontWeight: '600' },
  // Modales
  modalOverlay:    { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalBox:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 8 },
  modalHandle:     { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 16 },
  modalHeader:     { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle:      { fontSize: 18, fontWeight: '800' },
  modalSub:        { fontSize: 13, marginTop: 2 },
  // Filas de citas
  aptRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5 },
  aptAccent:       { width: 3, height: '100%', borderRadius: 2, minHeight: 48 },
  aptClient:       { fontSize: 14, fontWeight: '700' },
  aptService:      { fontSize: 12, marginTop: 2 },
  aptDate:         { fontSize: 11, marginTop: 3 },
  aptStatusBadge:  { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  aptStatusText:   { fontSize: 11, fontWeight: '600' },
  // Gráfica clientes
  clientKpiRow:    { flexDirection: 'row', gap: 8, marginBottom: 20 },
  clientKpi:       { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  clientKpiNum:    { fontSize: 22, fontWeight: '800' },
  clientKpiLabel:  { fontSize: 10, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  chartTitle:      { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 12 },
  chartWrap:       { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 160, paddingBottom: 4, marginBottom: 20 },
  barCol:          { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  barVal:          { fontSize: 13, fontWeight: '800' },
  barBg:           { width: '100%', height: 120, borderRadius: 8, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill:         { width: '100%', borderRadius: 8, minHeight: 4 },
  barLabel:        { fontSize: 11, fontWeight: '600', marginTop: 2 },
  goClientsBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10B981', borderRadius: 14, padding: 14, marginTop: 4 },
  goClientsBtnText:{ color: '#fff', fontWeight: '700', fontSize: 14 },
  // Staff
  staffSectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 12, marginTop: 4 },
  staffEmptyWrap:  { alignItems: 'center', justifyContent: 'center', padding: 48, gap: 12 },
  staffEmptyTitle: { fontSize: 18, fontWeight: '700' },
  staffEmptyDesc:  { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  staffCard:       { borderRadius: 18, padding: 16, marginBottom: 12, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  staffCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  rankBadge:       { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  rankNum:         { fontSize: 11, fontWeight: '900' },
  staffAvatar:     { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  staffAvatarText: { fontSize: 14, fontWeight: '800' },
  staffName:       { fontSize: 15, fontWeight: '700' },
  staffRole:       { fontSize: 12, marginTop: 1 },
  staffTotalNum:   { fontSize: 28, fontWeight: '900', lineHeight: 30 },
  staffTotalLabel: { fontSize: 11 },
  staffBarBg:      { height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 12 },
  staffBarFill:    { height: '100%', borderRadius: 3 },
  staffMetrics:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metricChip:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  metricDot:       { width: 6, height: 6, borderRadius: 3 },
  metricNum:       { fontSize: 13, fontWeight: '800' },
  metricLabel:     { fontSize: 11, fontWeight: '500' },
  teamTotalsCard:  { borderRadius: 18, padding: 20, marginTop: 4, marginBottom: 16 },
  teamTotalsTitle: { fontSize: 13, color: '#94A3B8', marginBottom: 14 },
  teamTotalsRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  teamTotalItem:   { alignItems: 'center' },
  teamTotalNum:    { fontSize: 24, fontWeight: '800', color: '#F8FAFC' },
  teamTotalLabel:  { fontSize: 11, color: '#64748B', marginTop: 4 },
});
