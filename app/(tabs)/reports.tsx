import { getTodayString, toLocalDateString, getMonthStartString, getMonthEndString } from '@/utils/dateUtils';
import React, { useState, useCallback, useRef, useEffect } from 'react';
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
import KPICard from '@/components/reports/KPICard';

// ══════════════════════════════════════════════════════════════════════
// VYLTA — Reportes Ejecutivos (rediseño Mayo 2026)
//
// Dashboard con look ejecutivo:
//   • Header con saludo personalizado + selector de mes ejecutivo
//   • 4 KPI cards en grid 2x2 con % de variación vs mes anterior
//   • Tab "General" / "Mi equipo" (mantiene funcionalidad Luxury)
//   • Modal de citas y crecimiento de clientes (sin cambios)
//
// Próximos commits agregarán:
//   • Commit 2: Gráfica de línea de ingresos + donut de servicios
//   • Commit 3: Sección de Insights (rule-based, sin LLM)
// ══════════════════════════════════════════════════════════════════════

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
  clientsThisMonth: number;
  clientsLastMonth: number;
  clientsPerWeek: number[];
  // ── NUEVOS campos para dashboard ejecutivo ──
  lastMonthRevenue: number;       // ingresos del mes anterior (para calcular variación)
  lastMonthAppointments: number;  // citas del mes anterior
  avgTicket: number;              // ticket promedio = monthRevenue / completedThisMonth
  avgTicketLastMonth: number;     // ticket promedio del mes anterior
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

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  'Confirmada': { color: '#10B981', label: 'Confirmada' },
  'Pendiente':  { color: '#F59E0B', label: 'Pendiente' },
  'Completada': { color: '#6366F1', label: 'Completada' },
  'Cancelada':  { color: '#EF4444', label: 'Cancelada' },
  'No asistió': { color: '#9CA3AF', label: 'No asistió' },
  'Reagendada': { color: '#3B82F6', label: 'Reagendada' },
  'Pagado':     { color: '#10B981', label: 'Pagado' },
};

function getReportsCacheKey(year: number, month: number): string {
  return `reports_stats_${year}_${month}`;
}

// ── Helper: calcular % variación entre dos números ──
// Retorna null si el valor anterior es 0 (división por cero = no comparable)
function calcChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

// ── Helper: formatear moneda en estilo ejecutivo ──
// $45,250 / $1.2K / $1.5M según magnitud
function formatCurrency(amount: number): string {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 10000)   return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toLocaleString('es-MX')}`;
}

export default function ReportsScreen() {
  const { canViewReports, isPremium, loading: planLoading } = usePlan();
  const { user, businessProfile } = useAuth();
  const router = useRouter();
  const { colors: tc, isDark } = useTheme();

  const now = new Date();
  const [selectedYear,  setSelectedYear]  = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats]           = useState<Stats | null>(null);
  const [staffStats, setStaffStats] = useState<StaffStat[]>([]);
  const [reportTab, setReportTab]   = useState<'general' | 'equipo'>('general');
  const [staffRange, setStaffRange] = useState<'semana' | 'mes' | 'todo'>('mes');

  const [hasStaff, setHasStaff] = useState(false);

  const [aptsModal, setAptsModal]       = useState(false);
  const [aptsLoading, setAptsLoading]   = useState(false);
  const [aptsList, setAptsList]         = useState<AppointmentItem[]>([]);
  const [clientsModal, setClientsModal] = useState(false);

  const [earliestMonth, setEarliestMonth] = useState<{ year: number; month: number } | null>(null);

  const isInitialMount = useRef(true);

  const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();

  const isEarliestMonth = earliestMonth !== null && (
    selectedYear < earliestMonth.year ||
    (selectedYear === earliestMonth.year && selectedMonth <= earliestMonth.month)
  );

  // ── Carga inicial: límite de meses + detección de equipo ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const userId = await getCurrentUserId();

        const [oldestResult, staffResult] = await Promise.all([
          supabase
            .from('appointments')
            .select('date')
            .eq('user_id', userId)
            .order('date', { ascending: true })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('staff_members')
            .select('id')
            .eq('user_id', userId)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        let refDateStr: string | null = oldestResult.data?.date ?? null;
        if (!refDateStr) {
          const { data: profile } = await supabase
            .from('business_profiles')
            .select('created_at')
            .eq('user_id', userId)
            .maybeSingle();
          if (profile?.created_at) refDateStr = profile.created_at;
        }

        if (cancelled) return;

        if (refDateStr) {
          const d = new Date(refDateStr.length === 10 ? refDateStr + 'T12:00:00' : refDateStr);
          setEarliestMonth({ year: d.getFullYear(), month: d.getMonth() });
        } else {
          setEarliestMonth({ year: now.getFullYear(), month: now.getMonth() });
        }

        setHasStaff(!!staffResult.data);
      } catch (e) {
        if (cancelled) return;
        const d = new Date();
        d.setMonth(d.getMonth() - 12);
        setEarliestMonth({ year: d.getFullYear(), month: d.getMonth() });
        setHasStaff(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      const cacheKey = getReportsCacheKey(selectedYear, selectedMonth);
      const cached = getCached<any>(cacheKey);
      if (cached) {
        setStats(cached);
        setLoading(false);
        loadData(true, false, true);
      } else {
        loadData();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const goToPrevMonth = () => {
    if (isEarliestMonth) return;
    if (selectedMonth === 0) {
      setSelectedYear(y => y - 1);
      setSelectedMonth(11);
    } else {
      setSelectedMonth(m => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (isCurrentMonth) return;
    if (selectedMonth === 11) {
      setSelectedYear(y => y + 1);
      setSelectedMonth(0);
    } else {
      setSelectedMonth(m => m + 1);
    }
  };

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    if (!isPremium) return;
    if (reportTab !== 'equipo') return;
    (async () => {
      try {
        const userId = await getCurrentUserId();
        await loadStaffStats(userId, staffRange);
      } catch (e) {
        console.warn('[Reports] staff reload error:', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, selectedMonth, staffRange, reportTab, isPremium]);

  const loadData = async (forceRefresh = false, isPullRefresh = false, silent = false) => {
    const cacheKey = getReportsCacheKey(selectedYear, selectedMonth);

    if (!forceRefresh && !isPullRefresh) {
      const cached = getCached<any>(cacheKey);
      if (cached) { setStats(cached); setLoading(false); return; }
    }
    if (isPullRefresh) setRefreshing(true);
    else if (!silent) setLoading(true);

    try {
      const userId = await getCurrentUserId();
      const today  = getTodayString();

      const weekStart = new Date();
      const dow = weekStart.getDay();
      weekStart.setDate(weekStart.getDate() - (dow === 0 ? 6 : dow - 1));
      const weekStartStr = toLocalDateString(weekStart);

      const monthStartStr = getMonthStartString(selectedYear, selectedMonth);
      const monthEndStr   = getMonthEndString(selectedYear, selectedMonth);

      const lastMonthStartStr = getMonthStartString(selectedYear, selectedMonth - 1);
      const lastMonthEndStr   = getMonthEndString(selectedYear, selectedMonth - 1);

      const [{ data: tA }, { data: wA }, { data: mA }, { count: tC }, { count: tAC }, { count: cC }] =
        await Promise.all([
          supabase.from('appointments').select('status').eq('user_id', userId).eq('date', today),
          supabase.from('appointments').select('id, status').eq('user_id', userId).gte('date', weekStartStr),
          supabase.from('appointments').select('id, status').eq('user_id', userId).gte('date', monthStartStr).lte('date', monthEndStr),
          supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('user_id', userId).in('status', ['Completada', 'Pagado']),
        ]);

      // ── Revenue mes actual ──
      const [{ data: revLegacy }, { data: revNew }] = await Promise.all([
        supabase.from('appointments').select('service_cost').eq('user_id', userId).eq('status', 'Pagado').gte('date', monthStartStr).lte('date', monthEndStr),
        supabase.from('appointments').select('service_cost').eq('user_id', userId).eq('status', 'Completada').eq('paid', true).gte('date', monthStartStr).lte('date', monthEndStr),
      ]);

      const { data: penD } = await supabase.from('appointments')
        .select('service_cost').eq('user_id', userId).eq('status', 'Completada')
        .or('paid.is.null,paid.eq.false').gte('date', monthStartStr).lte('date', monthEndStr);

      const monthRevenue   = [...(revLegacy || []), ...(revNew || [])].reduce((s: number, a: any) => s + (a.service_cost || 0), 0);
      const pendingRevenue = (penD || []).reduce((s: number, a: any) => s + (a.service_cost || 0), 0);

      // ── Revenue mes anterior (para calcular variación %) ──
      const [{ data: revLegacyPrev }, { data: revNewPrev }] = await Promise.all([
        supabase.from('appointments').select('service_cost').eq('user_id', userId).eq('status', 'Pagado').gte('date', lastMonthStartStr).lte('date', lastMonthEndStr),
        supabase.from('appointments').select('service_cost').eq('user_id', userId).eq('status', 'Completada').eq('paid', true).gte('date', lastMonthStartStr).lte('date', lastMonthEndStr),
      ]);
      const lastMonthRevenue = [...(revLegacyPrev || []), ...(revNewPrev || [])].reduce((s: number, a: any) => s + (a.service_cost || 0), 0);

      // ── Citas mes anterior (count) ──
      const { count: lastMonthAppointmentsCount } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('date', lastMonthStartStr)
        .lte('date', lastMonthEndStr);

      // ── Ticket promedio: revenue / citas completadas en cada mes ──
      const completedThisMonth = (mA || []).filter((a: any) => ['Completada', 'Pagado'].includes(a.status)).length;
      const avgTicket = completedThisMonth > 0 ? Math.round(monthRevenue / completedThisMonth) : 0;

      // Para ticket promedio del mes anterior, necesitamos las citas completadas del mes anterior
      const { data: lastMonthCompletedData } = await supabase
        .from('appointments')
        .select('id')
        .eq('user_id', userId)
        .in('status', ['Completada', 'Pagado'])
        .gte('date', lastMonthStartStr)
        .lte('date', lastMonthEndStr);
      const lastMonthCompleted = lastMonthCompletedData?.length || 0;
      const avgTicketLastMonth = lastMonthCompleted > 0 ? Math.round(lastMonthRevenue / lastMonthCompleted) : 0;

      // ── Clientes mes actual / anterior ──
      const { count: clientsThisMonth } = await supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', monthStartStr).lte('created_at', monthEndStr + 'T23:59:59');
      const { count: clientsLastMonth } = await supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', lastMonthStartStr).lte('created_at', lastMonthEndStr + 'T23:59:59');

      const { data: clientsMonthData } = await supabase.from('clients').select('created_at').eq('user_id', userId).gte('created_at', monthStartStr).lte('created_at', monthEndStr + 'T23:59:59').order('created_at');
      const clientsPerWeek = [0, 0, 0, 0];
      (clientsMonthData || []).forEach((c: any) => {
        const d = new Date(c.created_at);
        const weekIdx = Math.min(Math.floor((d.getDate() - 1) / 7), 3);
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
        lastMonthRevenue,
        lastMonthAppointments: lastMonthAppointmentsCount || 0,
        avgTicket,
        avgTicketLastMonth,
      };
      setStats(fs);
      setCached(cacheKey, fs, CACHE_TTL.REPORTS);
    } catch (e) {
      console.error('[Reports]', e);
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  };

  const openAppointmentsHistory = async () => {
    setAptsModal(true);
    setAptsLoading(true);
    try {
      const userId = await getCurrentUserId();
      const mStart = getMonthStartString(selectedYear, selectedMonth);
      const mEnd   = getMonthEndString(selectedYear, selectedMonth);

      const { data } = await supabase
        .from('appointments')
        .select('id, service_name, date, start_time, status, client:clients(name), client_name_temp')
        .eq('user_id', userId)
        .gte('date', mStart)
        .lte('date', mEnd)
        .order('date', { ascending: false })
        .order('start_time', { ascending: false })
        .limit(50);

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
      let toDate:   string | null = null;
      if (range === 'semana') {
        const d = new Date(); const dow = d.getDay();
        d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
        fromDate = toLocalDateString(d);
      } else if (range === 'mes') {
        fromDate = getMonthStartString(selectedYear, selectedMonth);
        toDate   = getMonthEndString(selectedYear, selectedMonth);
      }
      const { data: staffList } = await supabase
        .from('staff_members').select('id, name, color, role')
        .eq('user_id', userId).eq('is_active', true).order('sort_order');
      if (!staffList || staffList.length === 0) { setStaffStats([]); return; }
      let query = supabase.from('appointments').select('staff_id, status').eq('user_id', userId).not('staff_id', 'is', null);
      if (fromDate) query = query.gte('date', fromDate);
      if (toDate)   query = query.lte('date', toDate);
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

  const handleStaffRangeChange = (range: 'semana' | 'mes' | 'todo') => {
    setStaffRange(range);
  };

  const formatDate = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });

  // ── Saludo personalizado: usa primer nombre del owner ──
  const firstName = businessProfile?.businessName?.split(' ')[0] || user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'Antonio';

  // ── Cálculos de variación % para los KPIs ──
  const revenueChange     = stats ? calcChange(stats.monthRevenue, stats.lastMonthRevenue) : null;
  const aptsChange        = stats ? calcChange(stats.monthAppointments, stats.lastMonthAppointments) : null;
  const ticketChange      = stats ? calcChange(stats.avgTicket, stats.avgTicketLastMonth) : null;
  const newClientsChange  = stats ? calcChange(stats.clientsThisMonth, stats.clientsLastMonth) : null;

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
          <Text style={[s.paywallTitle, { color: tc.text }]}>Reportes en Plan Premium</Text>
          <Text style={[s.paywallDesc, { color: tc.textMuted }]}>
            Accede a reportes de ingresos, citas completadas y clientes con el Plan Premium o Luxury.
          </Text>
          <TouchableOpacity style={s.paywallBtn} onPress={() => router.push('/settings/subscription')}>
            <Text style={s.paywallBtnText}>Ver planes</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const maxStaffTotal = staffStats.length > 0 ? Math.max(...staffStats.map(st => st.total), 1) : 1;
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
        {/* ═══════════════════════════════════════════════════════════════
            HEADER EJECUTIVO con saludo + selector de mes
            Inspirado en mockups de dashboards Bloomberg/Stripe
            ═══════════════════════════════════════════════════════════════ */}
        <View style={[s.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
          <View style={s.headerTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={[s.headerTitle, { color: tc.text }]}>
                Reportes <Text style={{ color: '#10B981' }}>Ejecutivos</Text>
              </Text>
            </View>
          </View>

          <View style={s.headerGreetingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[s.greeting, { color: tc.text }]}>
                Hola, {firstName} <Text style={{ fontSize: 16 }}>👋</Text>
              </Text>
              <Text style={[s.greetingSub, { color: tc.textMuted }]}>
                Aquí tienes el panorama general{'\n'}de tu negocio.
              </Text>
            </View>

            {/* Selector de mes ejecutivo */}
            <View style={[s.monthSelector, { backgroundColor: tc.inputBg, borderColor: tc.border }]}>
              <TouchableOpacity
                onPress={goToPrevMonth}
                disabled={isEarliestMonth}
                style={[s.monthSelectorBtn, { opacity: isEarliestMonth ? 0.3 : 1 }]}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <MaterialIcons name="chevron-left" size={16} color={tc.text} />
              </TouchableOpacity>
              <View style={s.monthSelectorMid}>
                <MaterialIcons name="event" size={12} color="#10B981" />
                <Text style={[s.monthSelectorText, { color: tc.text }]}>
                  {MONTHS_ES[selectedMonth].slice(0, 3)} {selectedYear}
                </Text>
              </View>
              <TouchableOpacity
                onPress={goToNextMonth}
                disabled={isCurrentMonth}
                style={[s.monthSelectorBtn, { opacity: isCurrentMonth ? 0.3 : 1 }]}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <MaterialIcons name="chevron-right" size={16} color={tc.text} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ═══════════════════════════════════════════════════════════════
            TABS General / Mi equipo (solo si tiene staff)
            ═══════════════════════════════════════════════════════════════ */}
        {isPremium && hasStaff && (
          <View style={[s.reportTabRow, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
            <TouchableOpacity
              style={[s.reportTab, { backgroundColor: tc.inputBg }, reportTab === 'general' && { backgroundColor: '#0F172A' }]}
              onPress={() => setReportTab('general')}
            >
              <MaterialIcons name="dashboard" size={15} color={reportTab === 'general' ? '#fff' : tc.textMuted} />
              <Text style={[s.reportTabText, { color: reportTab === 'general' ? '#fff' : tc.textMuted }]}>General</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.reportTab, { backgroundColor: tc.inputBg }, reportTab === 'equipo' && { backgroundColor: '#6366F1' }]}
              onPress={() => setReportTab('equipo')}
            >
              <MaterialIcons name="group" size={15} color={reportTab === 'equipo' ? '#fff' : tc.textMuted} />
              <Text style={[s.reportTabText, { color: reportTab === 'equipo' ? '#fff' : tc.textMuted }]}>Mi equipo</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            CONTENIDO TAB GENERAL: 4 KPI cards + (próximamente gráficas e insights)
            ═══════════════════════════════════════════════════════════════ */}
        {reportTab === 'general' && (
          <View style={s.content}>

            {/* Grid 2x2 de KPI cards ejecutivos */}
            <View style={s.kpiGrid}>
              <View style={s.kpiRow}>
                <KPICard
                  label="Ingresos"
                  value={`$${(stats?.monthRevenue || 0).toLocaleString('es-MX')}`}
                  icon="attach-money"
                  iconColor="#10B981"
                  change={revenueChange}
                  comparisonLabel="vs mes ant."
                  surfaceColor={tc.surface}
                  textColor={tc.text}
                  textMutedColor={tc.textMuted}
                  borderColor={tc.border}
                />
                <View style={{ width: 10 }} />
                <KPICard
                  label="Citas"
                  value={`${stats?.monthAppointments || 0}`}
                  icon="event-available"
                  iconColor="#6366F1"
                  change={aptsChange}
                  comparisonLabel="vs mes ant."
                  onPress={openAppointmentsHistory}
                  surfaceColor={tc.surface}
                  textColor={tc.text}
                  textMutedColor={tc.textMuted}
                  borderColor={tc.border}
                />
              </View>

              <View style={{ height: 10 }} />

              <View style={s.kpiRow}>
                <KPICard
                  label="Ticket prom."
                  value={`$${(stats?.avgTicket || 0).toLocaleString('es-MX')}`}
                  icon="track-changes"
                  iconColor="#F59E0B"
                  change={ticketChange}
                  comparisonLabel="vs mes ant."
                  surfaceColor={tc.surface}
                  textColor={tc.text}
                  textMutedColor={tc.textMuted}
                  borderColor={tc.border}
                />
                <View style={{ width: 10 }} />
                <KPICard
                  label="Clientes nuevos"
                  value={`${stats?.clientsThisMonth || 0}`}
                  icon="person-add"
                  iconColor="#F472B6"
                  change={newClientsChange}
                  comparisonLabel="vs mes ant."
                  onPress={() => setClientsModal(true)}
                  surfaceColor={tc.surface}
                  textColor={tc.text}
                  textMutedColor={tc.textMuted}
                  borderColor={tc.border}
                />
              </View>
            </View>

            {/* Hero secundario: ingresos pendientes — destacado */}
            {stats && stats.pendingRevenue > 0 && (
              <TouchableOpacity
                style={[s.pendingCard, {
                  backgroundColor: isDark ? '#431407' : '#FFFBEB',
                  borderColor: '#F59E0B',
                }]}
                onPress={() => router.push('/reports/pending-payments')}
                activeOpacity={0.85}
              >
                <View style={s.pendingIconWrap}>
                  <MaterialIcons name="schedule" size={20} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.pendingLabel, { color: isDark ? '#FED7AA' : '#92400E' }]}>POR COBRAR</Text>
                  <Text style={[s.pendingValue, { color: '#F59E0B' }]}>
                    ${stats.pendingRevenue.toLocaleString('es-MX')}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color="#F59E0B" />
              </TouchableOpacity>
            )}

            {/* Indicadores secundarios: completadas histórico */}
            <View style={s.secondaryRow}>
              <View style={[s.secondaryCard, { backgroundColor: tc.surface, borderColor: tc.border }]}>
                <View style={s.secondaryIconWrap}>
                  <MaterialIcons name="check-circle" size={18} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.secondaryValue, { color: tc.text }]}>{stats?.completedAppointments || 0}</Text>
                  <Text style={[s.secondaryLabel, { color: tc.textMuted }]}>Citas completadas histórico</Text>
                </View>
              </View>
            </View>

            <View style={s.secondaryRow}>
              <View style={[s.secondaryCard, { backgroundColor: tc.surface, borderColor: tc.border }]}>
                <View style={s.secondaryIconWrap}>
                  <MaterialIcons name="people" size={18} color="#6366F1" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.secondaryValue, { color: tc.text }]}>{stats?.totalClients || 0}</Text>
                  <Text style={[s.secondaryLabel, { color: tc.textMuted }]}>Total de clientes</Text>
                </View>
                <TouchableOpacity onPress={() => setClientsModal(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialIcons name="bar-chart" size={18} color="#6366F1" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Placeholder para gráficas e insights (próximos commits) */}
            <View style={[s.placeholder, { backgroundColor: tc.surface, borderColor: tc.border }]}>
              <MaterialIcons name="show-chart" size={28} color={tc.textMuted} />
              <Text style={[s.placeholderTitle, { color: tc.text }]}>Gráficas en camino</Text>
              <Text style={[s.placeholderDesc, { color: tc.textMuted }]}>
                Próximamente verás aquí tu gráfica de ingresos por semana e ingresos por servicio.
              </Text>
            </View>

          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            CONTENIDO TAB MI EQUIPO (sin cambios respecto al fix anterior)
            ═══════════════════════════════════════════════════════════════ */}
        {reportTab === 'equipo' && isPremium && (
          <View>
            <View style={[s.rangePicker, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
              {(['semana', 'mes', 'todo'] as const).map(r => (
                <TouchableOpacity key={r} style={[s.rangeBtn, { backgroundColor: tc.inputBg }, staffRange === r && { backgroundColor: '#6366F1' }]} onPress={() => handleStaffRangeChange(r)}>
                  <Text style={[s.rangeBtnText, { color: staffRange === r ? '#fff' : tc.textMuted }]}>
                    {r === 'semana' ? 'Esta semana' : r === 'mes' ? `${MONTHS_ES[selectedMonth]}` : 'Todo'}
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
      </ScrollView>

      {/* ═══════════════════════════════════════════════════════════════
          MODAL: Historial de citas del mes
          ═══════════════════════════════════════════════════════════════ */}
      <Modal visible={aptsModal} animationType="slide" transparent onRequestClose={() => setAptsModal(false)}>
        <View style={s.modalOverlay}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setAptsModal(false)} />
          <View style={[s.modalBox, { backgroundColor: tc.surface }]}>
            <View style={s.modalHandle} />
            <View style={s.modalHeader}>
              <View>
                <Text style={[s.modalTitle, { color: tc.text }]}>Citas de {MONTHS_ES[selectedMonth]}</Text>
                <Text style={[s.modalSub, { color: tc.textMuted }]}>{stats?.monthAppointments || 0} citas en total</Text>
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
                <Text style={[{ fontSize: 15, fontWeight: '600' }, { color: tc.text }]}>Sin citas este mes</Text>
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

      {/* ═══════════════════════════════════════════════════════════════
          MODAL: Crecimiento de clientes
          ═══════════════════════════════════════════════════════════════ */}
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
            <View style={s.clientKpiRow}>
              <View style={[s.clientKpi, { backgroundColor: isDark ? '#0F2D1A' : '#ECFDF5' }]}>
                <Text style={[s.clientKpiNum, { color: '#10B981' }]}>{stats?.clientsThisMonth || 0}</Text>
                <Text style={[s.clientKpiLabel, { color: isDark ? '#6EE7B7' : '#065F46' }]}>{MONTHS_ES[selectedMonth]}</Text>
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
            <Text style={[s.chartTitle, { color: tc.textMuted }]}>CLIENTES NUEVOS POR SEMANA ({MONTHS_ES[selectedMonth].toUpperCase()} {selectedYear})</Text>
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
  container:         { flex: 1 },
  loadingWrap:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:            { paddingBottom: 100 },

  paywall:           { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36, gap: 16 },
  paywallIconWrap:   { width: 80, height: 80, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  paywallTitle:      { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  paywallDesc:       { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  paywallBtn:        { backgroundColor: '#10B981', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 },
  paywallBtnText:    { color: '#fff', fontWeight: '700', fontSize: 15 },

  // ── Header ejecutivo ──
  header:            { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, borderBottomWidth: 0.5 },
  headerTopRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  headerTitle:       { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  headerGreetingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  greeting:          { fontSize: 15, fontWeight: '700' },
  greetingSub:       { fontSize: 11, marginTop: 2, lineHeight: 14 },
  monthSelector:     { flexDirection: 'row', alignItems: 'center', borderRadius: 9, borderWidth: 0.5, padding: 2, gap: 2 },
  monthSelectorBtn:  { padding: 4, borderRadius: 6 },
  monthSelectorMid:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  monthSelectorText: { fontSize: 11, fontWeight: '700' },

  // ── Tabs ──
  reportTabRow:      { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 0.5 },
  reportTab:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10 },
  reportTabText:     { fontSize: 13, fontWeight: '600' },

  // ── Contenido ──
  content:           { padding: 16, gap: 12 },
  kpiGrid:           { gap: 0 },
  kpiRow:            { flexDirection: 'row' },

  // ── Pending card (destacado) ──
  pendingCard:       { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, borderWidth: 1 },
  pendingIconWrap:   { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(245,158,11,0.18)', justifyContent: 'center', alignItems: 'center' },
  pendingLabel:      { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  pendingValue:      { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },

  // ── Secondary indicators ──
  secondaryRow:      { flexDirection: 'row' },
  secondaryCard:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 12, borderWidth: 0.5 },
  secondaryIconWrap: { width: 34, height: 34, borderRadius: 9, backgroundColor: 'rgba(99,102,241,0.10)', justifyContent: 'center', alignItems: 'center' },
  secondaryValue:    { fontSize: 18, fontWeight: '700' },
  secondaryLabel:    { fontSize: 11, marginTop: 1 },

  // ── Placeholder ──
  placeholder:       { borderRadius: 14, padding: 24, borderWidth: 0.5, alignItems: 'center', gap: 8, marginTop: 4 },
  placeholderTitle:  { fontSize: 14, fontWeight: '700' },
  placeholderDesc:   { fontSize: 12, textAlign: 'center', lineHeight: 18 },

  // ── Rango y staff (sin cambios) ──
  rangePicker:       { flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: 0.5 },
  rangeBtn:          { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  rangeBtnText:      { fontSize: 12, fontWeight: '600' },

  modalOverlay:      { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalBox:          { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 8 },
  modalHandle:       { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 16 },
  modalHeader:       { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle:        { fontSize: 18, fontWeight: '800' },
  modalSub:          { fontSize: 13, marginTop: 2 },

  aptRow:            { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5 },
  aptAccent:         { width: 3, height: '100%', borderRadius: 2, minHeight: 48 },
  aptClient:         { fontSize: 14, fontWeight: '700' },
  aptService:        { fontSize: 12, marginTop: 2 },
  aptDate:           { fontSize: 11, marginTop: 3 },
  aptStatusBadge:    { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  aptStatusText:     { fontSize: 11, fontWeight: '600' },

  clientKpiRow:      { flexDirection: 'row', gap: 8, marginBottom: 20 },
  clientKpi:         { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  clientKpiNum:      { fontSize: 22, fontWeight: '800' },
  clientKpiLabel:    { fontSize: 10, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  chartTitle:        { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 12 },
  chartWrap:         { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 160, paddingBottom: 4, marginBottom: 20 },
  barCol:            { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  barVal:            { fontSize: 13, fontWeight: '800' },
  barBg:             { width: '100%', height: 120, borderRadius: 8, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill:           { width: '100%', borderRadius: 8, minHeight: 4 },
  barLabel:          { fontSize: 11, fontWeight: '600', marginTop: 2 },
  goClientsBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10B981', borderRadius: 14, padding: 14, marginTop: 4 },
  goClientsBtnText:  { color: '#fff', fontWeight: '700', fontSize: 14 },

  // ── Staff (sin cambios) ──
  staffSectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 12, marginTop: 4 },
  staffEmptyWrap:    { alignItems: 'center', justifyContent: 'center', padding: 48, gap: 12 },
  staffEmptyTitle:   { fontSize: 18, fontWeight: '700' },
  staffEmptyDesc:    { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  staffCard:         { borderRadius: 18, padding: 16, marginBottom: 12, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  staffCardHeader:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  rankBadge:         { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  rankNum:           { fontSize: 11, fontWeight: '900' },
  staffAvatar:       { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  staffAvatarText:   { fontSize: 14, fontWeight: '800' },
  staffName:         { fontSize: 15, fontWeight: '700' },
  staffRole:         { fontSize: 12, marginTop: 1 },
  staffTotalNum:     { fontSize: 28, fontWeight: '900', lineHeight: 30 },
  staffTotalLabel:   { fontSize: 11 },
  staffBarBg:        { height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 12 },
  staffBarFill:      { height: '100%', borderRadius: 3 },
  staffMetrics:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metricChip:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  metricDot:         { width: 6, height: 6, borderRadius: 3 },
  metricNum:         { fontSize: 13, fontWeight: '800' },
  metricLabel:       { fontSize: 11, fontWeight: '500' },
  teamTotalsCard:    { borderRadius: 18, padding: 20, marginTop: 4, marginBottom: 16 },
  teamTotalsTitle:   { fontSize: 13, color: '#94A3B8', marginBottom: 14 },
  teamTotalsRow:     { flexDirection: 'row', justifyContent: 'space-between' },
  teamTotalItem:     { alignItems: 'center' },
  teamTotalNum:      { fontSize: 24, fontWeight: '800', color: '#F8FAFC' },
  teamTotalLabel:    { fontSize: 11, color: '#64748B', marginTop: 4 },
});
