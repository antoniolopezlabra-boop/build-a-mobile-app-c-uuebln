import { getTodayString, toLocalDateString, getMonthStartString, getMonthEndString } from '@/utils/dateUtils';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { usePlan } from '@/contexts/PlanContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, TouchableOpacity, RefreshControl, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { getCurrentUserId } from '@/utils/api';
import { getCached, setCached, CACHE_TTL } from '@/utils/cache';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import KPICard from '@/components/reports/KPICard';
import LineChartCard from '@/components/reports/LineChartCard';
import DonutChartCard, { ServiceSlice } from '@/components/reports/DonutChartCard';
import InsightsCard, { Insight } from '@/components/reports/InsightsCard';
// ⚡ FIX UX (May 19 2026): refetch automático al volver de background.
// useFocusEffect NO se dispara si el usuario está EN Reportes cuando
// minimiza/vuelve la app. Este hook lo soluciona refetchando tanto
// los datos generales como los del tab "equipo" si está activo.
import { useAppRefreshListener } from '@/hooks/useAppRefreshListener';

// ══════════════════════════════════════════════════════════════════════
// VYLTA — Reportes Ejecutivos (rediseño Mayo 2026)
//
// Commit 1: header + 4 KPI cards + cálculo de variaciones
// Commit 2: + Gráfica de línea de ingresos diarios + Donut de servicios
// Commit 3: + Insights rule-based (sin LLM)
// AJUSTE TIPOGRÁFICO MAY 2026: alineación con clients.tsx para sinergia visual
//   • headerTitle 22 → 28px (igual que clients)
//   • greeting 15 → 18px (más prominente)
//   • todos los textos secundarios subidos 1-2px para consistencia
// ⚡ FIX (May 19 2026): tarjeta "Por cobrar" siempre visible con estado
//   semántico — verde con $0, amarillo con adeudo.
// ⚡ FIX UX (May 19 2026): refetch automático al volver de background
//   (4to commit del feature de splash de reconexión).
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
  lastMonthRevenue: number;
  lastMonthAppointments: number;
  avgTicket: number;
  avgTicketLastMonth: number;
  dailyRevenue: { label: string; value: number }[];
  revenueByService: ServiceSlice[];
  bestWeekday: { name: string; percent: number } | null;
  topService: ServiceSlice | null;
  deadHourRange: string | null;
  inactiveClientsCount: number;
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

const DAY_FULL_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  'Confirmada': { color: '#10B981', label: 'Confirmada' },
  'Pendiente':  { color: '#F59E0B', label: 'Pendiente' },
  'Completada': { color: '#6366F1', label: 'Completada' },
  'Cancelada':  { color: '#EF4444', label: 'Cancelada' },
  'No asistió': { color: '#9CA3AF', label: 'No asistió' },
  'Reagendada': { color: '#3B82F6', label: 'Reagendada' },
  'Pagado':     { color: '#10B981', label: 'Pagado' },
};

const SERVICE_COLORS = ['#10B981', '#6366F1', '#F59E0B', '#F472B6', '#3B82F6', '#A855F7', '#14B8A6'];

const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function getReportsCacheKey(year: number, month: number): string {
  return `reports_stats_${year}_${month}`;
}

function calcChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function buildBestDayInsight(stats: Stats | null): Insight | null {
  if (!stats?.bestWeekday) return null;
  if (stats.bestWeekday.percent < 20) return null;
  return {
    id: 'best-day',
    accent: 'green',
    title: `Tu mejor día es ${stats.bestWeekday.name}`,
    subtitle: `${stats.bestWeekday.percent}% de tus ingresos del mes`,
  };
}

function buildTopServiceInsight(stats: Stats | null): Insight | null {
  if (!stats?.topService) return null;
  if (stats.monthRevenue === 0) return null;
  const percent = Math.round((stats.topService.amount / stats.monthRevenue) * 100);
  if (percent < 15) return null;
  return {
    id: 'top-service',
    accent: 'purple',
    title: `Servicio estrella: ${stats.topService.name}`,
    subtitle: `${percent}% de tus ingresos · $${stats.topService.amount.toLocaleString('es-MX')}`,
  };
}

function buildDeadHourInsight(stats: Stats | null): Insight | null {
  if (!stats?.deadHourRange) return null;
  return {
    id: 'dead-hour',
    accent: 'amber',
    title: `Horario muerto: ${stats.deadHourRange}`,
    subtitle: 'Considera promociones en ese rango',
  };
}

function buildInactiveClientsInsight(
  stats: Stats | null,
  onPress: () => void,
): Insight | null {
  if (!stats?.inactiveClientsCount || stats.inactiveClientsCount < 3) return null;
  return {
    id: 'inactive-clients',
    accent: 'blue',
    title: `${stats.inactiveClientsCount} clientes sin venir 60+ días`,
    subtitle: 'Reactivar con campaña de email',
    onPress,
  };
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

  // ⚡ FIX UX (May 19 2026): refetch silencioso cuando vuelve la app de background.
  //
  // Esta pantalla es especial porque tiene 2 fuentes de datos:
  //   1. loadData() — KPIs, gráficas, insights (siempre se refresca)
  //   2. loadStaffStats() — sólo si el usuario está viendo el tab "equipo"
  //
  // Parámetros del callback:
  //   • loadData(true, false, true)
  //     - forceRefresh=true → ignora el cache (que también fue invalidado
  //       por AppStateContext)
  //     - isPullRefresh=false → no muestra el spinner del pull-to-refresh
  //     - silent=true → no muestra el spinner grande de carga inicial
  //       (el splash de reconexión ya cubrió la UI)
  //
  //   • Si reportTab === 'equipo' e isPremium, también refrescamos los
  //     stats del equipo para que no queden viejos.
  //
  // NO causa loop infinito: el callback usa los valores ACTUALES de
  // selectedYear, selectedMonth, reportTab, staffRange — no los captura
  // como closure obsoleto porque el hook useAppRefreshListener internamente
  // usa una ref para acceder a la versión más reciente del callback.
  useAppRefreshListener(() => {
    loadData(true, false, true);
    if (reportTab === 'equipo' && isPremium) {
      getCurrentUserId().then(userId => loadStaffStats(userId, staffRange))
        .catch(e => console.warn('[Reports] staff refresh on app return failed:', e));
    }
  });

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
          supabase.from('appointments').select('id, status, start_time').eq('user_id', userId).gte('date', monthStartStr).lte('date', monthEndStr),
          supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('user_id', userId).in('status', ['Completada', 'Pagado']),
        ]);

      const [{ data: revLegacy }, { data: revNew }] = await Promise.all([
        supabase.from('appointments').select('date, service_cost, service_name').eq('user_id', userId).eq('status', 'Pagado').gte('date', monthStartStr).lte('date', monthEndStr),
        supabase.from('appointments').select('date, service_cost, service_name').eq('user_id', userId).eq('status', 'Completada').eq('paid', true).gte('date', monthStartStr).lte('date', monthEndStr),
      ]);

      const { data: penD } = await supabase.from('appointments')
        .select('service_cost').eq('user_id', userId).eq('status', 'Completada')
        .or('paid.is.null,paid.eq.false').gte('date', monthStartStr).lte('date', monthEndStr);

      const paidAppointments = [...(revLegacy || []), ...(revNew || [])];
      const monthRevenue   = paidAppointments.reduce((s: number, a: any) => s + (a.service_cost || 0), 0);
      const pendingRevenue = (penD || []).reduce((s: number, a: any) => s + (a.service_cost || 0), 0);

      const dailyByWeekday = [0, 0, 0, 0, 0, 0, 0];
      paidAppointments.forEach((a: any) => {
        if (!a.date || !a.service_cost) return;
        const d = new Date(a.date + 'T12:00:00');
        const jsDay = d.getDay();
        const idx = jsDay === 0 ? 6 : jsDay - 1;
        dailyByWeekday[idx] += a.service_cost;
      });
      const dailyRevenue = dailyByWeekday.map((value, i) => ({
        label: DAYS_ES[i],
        value: Math.round(value),
      }));

      const serviceMap = new Map<string, number>();
      paidAppointments.forEach((a: any) => {
        const name = (a.service_name || 'Sin nombre').trim();
        const current = serviceMap.get(name) || 0;
        serviceMap.set(name, current + (a.service_cost || 0));
      });
      const revenueByService: ServiceSlice[] = Array.from(serviceMap.entries())
        .map(([name, amount], idx) => ({
          name,
          amount: Math.round(amount),
          color: SERVICE_COLORS[idx % SERVICE_COLORS.length],
        }))
        .sort((a, b) => b.amount - a.amount)
        .map((slice, idx) => ({ ...slice, color: SERVICE_COLORS[idx % SERVICE_COLORS.length] }));

      let bestWeekday: { name: string; percent: number } | null = null;
      const totalDaily = dailyByWeekday.reduce((s, v) => s + v, 0);
      if (totalDaily > 0) {
        let maxIdx = 0;
        for (let i = 1; i < 7; i++) {
          if (dailyByWeekday[i] > dailyByWeekday[maxIdx]) maxIdx = i;
        }
        const percent = Math.round((dailyByWeekday[maxIdx] / totalDaily) * 100);
        bestWeekday = {
          name: DAY_FULL_NAMES[maxIdx],
          percent,
        };
      }

      const topService: ServiceSlice | null = revenueByService.length > 0 ? revenueByService[0] : null;

      let deadHourRange: string | null = null;
      if ((mA?.length || 0) >= 10) {
        const hourCounts = new Map<number, number>();
        let minHour = 23, maxHour = 0;
        (mA || []).forEach((a: any) => {
          if (!a.start_time) return;
          const hourStr = a.start_time.split(':')[0];
          const h = parseInt(hourStr, 10);
          if (isNaN(h)) return;
          hourCounts.set(h, (hourCounts.get(h) || 0) + 1);
          if (h < minHour) minHour = h;
          if (h > maxHour) maxHour = h;
        });

        if (maxHour - minHour >= 3) {
          let minCount = Infinity;
          let deadHour = -1;
          for (let h = minHour; h < maxHour; h++) {
            const count = hourCounts.get(h) || 0;
            if (count < minCount) {
              minCount = count;
              deadHour = h;
            }
          }
          const avgCount = (mA?.length || 0) / (maxHour - minHour + 1);
          if (deadHour >= 0 && minCount < avgCount * 0.5) {
            deadHourRange = `${deadHour}h-${deadHour + 1}h`;
          }
        }
      }

      // ⚡ FIX (jul 2026): umbral 60→90 días para coincidir con la pantalla
      // "Clientes inactivos" (/api/clients/inactive usa 90 y su texto dice 90).
      // Antes el aviso contaba 60 días y la lista 90 → cifras que no cuadraban.
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 90);
      const sixtyDaysAgoStr = toLocalDateString(sixtyDaysAgo);

      const { count: inactiveCount } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .lt('last_visit', sixtyDaysAgoStr);
      const inactiveClientsCount = inactiveCount || 0;

      const [{ data: revLegacyPrev }, { data: revNewPrev }] = await Promise.all([
        supabase.from('appointments').select('service_cost').eq('user_id', userId).eq('status', 'Pagado').gte('date', lastMonthStartStr).lte('date', lastMonthEndStr),
        supabase.from('appointments').select('service_cost').eq('user_id', userId).eq('status', 'Completada').eq('paid', true).gte('date', lastMonthStartStr).lte('date', lastMonthEndStr),
      ]);
      const lastMonthRevenue = [...(revLegacyPrev || []), ...(revNewPrev || [])].reduce((s: number, a: any) => s + (a.service_cost || 0), 0);

      const { count: lastMonthAppointmentsCount } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('date', lastMonthStartStr)
        .lte('date', lastMonthEndStr);

      // ⚡ FIX BUG (jul 2026): el ticket promedio dividía los ingresos de citas
      // COBRADAS entre TODAS las completadas (incluidas las no cobradas) → ticket
      // artificialmente bajo mientras hubiera cobros pendientes. Ahora se divide
      // entre las citas que realmente generaron ese ingreso (las pagadas).
      const completedThisMonth = (mA || []).filter((a: any) => ['Completada', 'Pagado'].includes(a.status)).length;
      const paidCount = paidAppointments.length;
      const avgTicket = paidCount > 0 ? Math.round(monthRevenue / paidCount) : 0;

      // ⚡ FIX BUG (jul 2026): dividir el ingreso del mes anterior entre las citas
      // PAGADAS que lo generaron (no entre todas las completadas), igual que avgTicket.
      const lastMonthPaidCount = (revLegacyPrev || []).length + (revNewPrev || []).length;
      const avgTicketLastMonth = lastMonthPaidCount > 0 ? Math.round(lastMonthRevenue / lastMonthPaidCount) : 0;

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
        dailyRevenue,
        revenueByService,
        bestWeekday,
        topService,
        deadHourRange,
        inactiveClientsCount,
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

  const firstName = businessProfile?.businessName?.split(' ')[0] || user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'tú';

  const revenueChange     = stats ? calcChange(stats.monthRevenue, stats.lastMonthRevenue) : null;
  const aptsChange        = stats ? calcChange(stats.monthAppointments, stats.lastMonthAppointments) : null;
  const ticketChange      = stats ? calcChange(stats.avgTicket, stats.avgTicketLastMonth) : null;
  const newClientsChange  = stats ? calcChange(stats.clientsThisMonth, stats.clientsLastMonth) : null;

  const insights: Insight[] = [
    buildBestDayInsight(stats),
    buildTopServiceInsight(stats),
    buildDeadHourInsight(stats),
    buildInactiveClientsInsight(stats, () => {
      router.push({
        pathname: '/marketing/new',
        params: { segment: 'inactivos' },
      } as any);
    }),
  ].filter((x): x is Insight => x !== null);

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
          {/* iOS (Guideline 3.1.1): texto neutro y sin CTA de venta */}
          <Text style={[s.paywallTitle, { color: tc.text }]}>{Platform.OS === 'ios' ? 'Reportes' : 'Reportes en Plan Premium'}</Text>
          <Text style={[s.paywallDesc, { color: tc.textMuted }]}>
            {Platform.OS === 'ios'
              ? 'Los reportes no están incluidos en tu plan actual.'
              : 'Accede a reportes de ingresos, citas completadas y clientes con el Plan Premium o Luxury.'}
          </Text>
          {Platform.OS !== 'ios' && (
            <TouchableOpacity style={s.paywallBtn} onPress={() => router.push('/settings/subscription')}>
              <Text style={s.paywallBtnText}>Ver planes</Text>
            </TouchableOpacity>
          )}
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

  // ⚡ FIX (May 19 2026): variables para la tarjeta "Por cobrar" siempre visible.
  // hasPending=true → amarillo + tappable (lleva al detalle)
  // hasPending=false → verde + no tappable (estado "al día")
  const pendingAmount = stats?.pendingRevenue || 0;
  const hasPending = pendingAmount > 0;
  const pendingCardBg     = hasPending
    ? (isDark ? '#431407' : '#FFFBEB')
    : (isDark ? '#0F2D1A' : '#ECFDF5');
  const pendingCardBorder = hasPending ? '#F59E0B' : '#10B981';
  const pendingAccent     = hasPending ? '#F59E0B' : '#10B981';
  const pendingLabelColor = hasPending
    ? (isDark ? '#FED7AA' : '#92400E')
    : (isDark ? '#6EE7B7' : '#065F46');
  const pendingIconBgRgba = hasPending
    ? 'rgba(245,158,11,0.18)'
    : 'rgba(16,185,129,0.18)';

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
                Hola, {firstName} <Text style={{ fontSize: 18 }}>👋</Text>
              </Text>
              <Text style={[s.greetingSub, { color: tc.textMuted }]}>
                Aquí tienes el panorama general{'\n'}de tu negocio.
              </Text>
            </View>

            <View style={[s.monthSelector, { backgroundColor: tc.inputBg, borderColor: tc.border }]}>
              <TouchableOpacity
                onPress={goToPrevMonth}
                disabled={isEarliestMonth}
                style={[s.monthSelectorBtn, { opacity: isEarliestMonth ? 0.3 : 1 }]}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <MaterialIcons name="chevron-left" size={18} color={tc.text} />
              </TouchableOpacity>
              <View style={s.monthSelectorMid}>
                <MaterialIcons name="event" size={14} color="#10B981" />
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
                <MaterialIcons name="chevron-right" size={18} color={tc.text} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {isPremium && hasStaff && (
          <View style={[s.reportTabRow, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
            <TouchableOpacity
              style={[s.reportTab, { backgroundColor: tc.inputBg }, reportTab === 'general' && { backgroundColor: '#0F172A' }]}
              onPress={() => setReportTab('general')}
            >
              <MaterialIcons name="dashboard" size={16} color={reportTab === 'general' ? '#fff' : tc.textMuted} />
              <Text style={[s.reportTabText, { color: reportTab === 'general' ? '#fff' : tc.textMuted }]}>General</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.reportTab, { backgroundColor: tc.inputBg }, reportTab === 'equipo' && { backgroundColor: '#6366F1' }]}
              onPress={() => setReportTab('equipo')}
            >
              <MaterialIcons name="group" size={16} color={reportTab === 'equipo' ? '#fff' : tc.textMuted} />
              <Text style={[s.reportTabText, { color: reportTab === 'equipo' ? '#fff' : tc.textMuted }]}>Mi equipo</Text>
            </TouchableOpacity>
          </View>
        )}

        {reportTab === 'general' && (
          <View style={s.content}>

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

            {/* ⚡ FIX (May 19 2026): tarjeta "Por cobrar" SIEMPRE visible.
                - hasPending=true → amarillo, tappable, navega a detalle
                - hasPending=false → verde, no tappable, "Al día / ¡Todo cobrado!" */}
            <TouchableOpacity
              style={[s.pendingCard, {
                backgroundColor: pendingCardBg,
                borderColor: pendingCardBorder,
              }]}
              onPress={() => {
                if (hasPending) router.push('/reports/pending-payments');
              }}
              activeOpacity={hasPending ? 0.85 : 1}
              disabled={!hasPending}
            >
              <View style={[s.pendingIconWrap, { backgroundColor: pendingIconBgRgba }]}>
                <MaterialIcons
                  name={hasPending ? 'schedule' : 'check-circle'}
                  size={22}
                  color={pendingAccent}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.pendingLabel, { color: pendingLabelColor }]}>
                  {hasPending ? 'POR COBRAR' : 'AL DÍA'}
                </Text>
                <Text style={[s.pendingValue, { color: pendingAccent }]}>
                  ${pendingAmount.toLocaleString('es-MX')}
                </Text>
                {!hasPending && (
                  <Text style={[s.pendingSub, { color: pendingLabelColor }]}>
                    ¡Todo cobrado este mes!
                  </Text>
                )}
              </View>
              {hasPending && (
                <MaterialIcons name="chevron-right" size={22} color={pendingAccent} />
              )}
            </TouchableOpacity>

            <LineChartCard
              title="Ingresos"
              totalValue={`$${(stats?.monthRevenue || 0).toLocaleString('es-MX')}`}
              changePercent={revenueChange}
              changeLabel="vs mes anterior"
              data={stats?.dailyRevenue || []}
              rangeLabel={MONTHS_ES[selectedMonth].slice(0, 3)}
              surfaceColor={tc.surface}
              textColor={tc.text}
              textMutedColor={tc.textMuted}
              borderColor={tc.border}
              isDark={isDark}
            />

            <DonutChartCard
              title="Ingresos por servicio"
              totalLabel="Total"
              totalValue={`$${(stats?.monthRevenue || 0).toLocaleString('es-MX')}`}
              data={stats?.revenueByService || []}
              rangeLabel={MONTHS_ES[selectedMonth].slice(0, 3)}
              surfaceColor={tc.surface}
              textColor={tc.text}
              textMutedColor={tc.textMuted}
              borderColor={tc.border}
              isDark={isDark}
            />

            <InsightsCard
              insights={insights}
              surfaceColor={tc.surface}
              textColor={tc.text}
              textMutedColor={tc.textMuted}
              borderColor={tc.border}
              isDark={isDark}
            />

            <View style={s.secondaryRow}>
              <View style={[s.secondaryCard, { backgroundColor: tc.surface, borderColor: tc.border }]}>
                <View style={s.secondaryIconWrap}>
                  <MaterialIcons name="check-circle" size={20} color="#10B981" />
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
                  <MaterialIcons name="people" size={20} color="#6366F1" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.secondaryValue, { color: tc.text }]}>{stats?.totalClients || 0}</Text>
                  <Text style={[s.secondaryLabel, { color: tc.textMuted }]}>Total de clientes</Text>
                </View>
                <TouchableOpacity onPress={() => setClientsModal(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialIcons name="bar-chart" size={20} color="#6366F1" />
                </TouchableOpacity>
              </View>
            </View>

          </View>
        )}

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
  // Alineado con clients.tsx: paddingHorizontal=20, title=28px, subtitle=13px
  header:            { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 0.5 },
  headerTopRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  headerTitle:       { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  headerGreetingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  greeting:          { fontSize: 18, fontWeight: '700' },
  greetingSub:       { fontSize: 13, marginTop: 3, lineHeight: 18 },
  monthSelector:     { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 0.5, padding: 3, gap: 2 },
  monthSelectorBtn:  { padding: 5, borderRadius: 7 },
  monthSelectorMid:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 6 },
  monthSelectorText: { fontSize: 13, fontWeight: '700' },

  reportTabRow:      { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, gap: 8, borderBottomWidth: 0.5 },
  reportTab:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  reportTabText:     { fontSize: 14, fontWeight: '600' },

  content:           { padding: 16, gap: 12 },
  kpiGrid:           { gap: 0 },
  kpiRow:            { flexDirection: 'row' },

  pendingCard:       { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 16, borderWidth: 1 },
  pendingIconWrap:   { width: 44, height: 44, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  pendingLabel:      { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  pendingValue:      { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  // ⚡ FIX (May 19 2026): nuevo sublabel para estado "al día" ($0).
  pendingSub:        { fontSize: 12, fontWeight: '600', marginTop: 4 },

  secondaryRow:      { flexDirection: 'row' },
  secondaryCard:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 14, borderWidth: 0.5 },
  secondaryIconWrap: { width: 36, height: 36, borderRadius: 9, backgroundColor: 'rgba(99,102,241,0.10)', justifyContent: 'center', alignItems: 'center' },
  secondaryValue:    { fontSize: 20, fontWeight: '700' },
  secondaryLabel:    { fontSize: 13, marginTop: 2 },

  rangePicker:       { flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: 0.5 },
  rangeBtn:          { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  rangeBtnText:      { fontSize: 13, fontWeight: '600' },

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
