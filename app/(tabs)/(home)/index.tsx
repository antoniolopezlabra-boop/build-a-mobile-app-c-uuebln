import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, RefreshControl, Alert, AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { usePlan } from '@/contexts/PlanContext';
import { useGratuitoUsage } from '@/contexts/useGratuitoUsage';
import { colors } from '@/styles/commonStyles';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { apiGet } from '@/utils/api';
import { getCached, setCached, invalidateCache, CACHE_TTL } from '@/utils/cache';
import { getStatusColor } from '@/utils/appointmentUtils';
import { supabase } from '@/lib/supabase';
import { logger } from '@/utils/logger';
import { translateError, buildErrorAlertButtons } from '@/utils/errorMessages';
// ⚡ FIX UX (May 19 2026): hook que ejecuta callback cuando el usuario
// vuelve de background después de >5 min. Coordinado con AppStateContext
// para que las pantallas refetcheen datos frescos automáticamente.
import { useAppRefreshListener } from '@/hooks/useAppRefreshListener';

function getReportsCacheKey() {
  const n = new Date();
  return 'reports_stats_' + n.getFullYear() + '_' + (n.getMonth() + 1);
}

interface DashboardStats {
  todayAppointments: number; confirmedToday: number; unconfirmedToday: number;
  weekAppointments: number; confirmedWeek: number; unconfirmedWeek: number;
  totalClients: number; totalAppointments: number;
}
interface TodayAppointment {
  id: string; time: string; service: string; status: string;
  client: { id: string; name: string; phone: string } | null;
  clientNameTemp?: string | null; source?: string | null;
  staff_id?: string | null; staff?: { name: string; color: string } | null;
}
interface StaffMember { id: string; name: string; color: string; }
interface UnpaidAppointment {
  id: string; date: string; start_time: string;
  service_name: string; service_cost: number | null;
  client: { name: string } | null; client_name_temp: string | null;
  staff: { name: string; color: string } | null;
}

export default function HomeScreen() {
  const router   = useRouter();
  const pathname = usePathname();
  const { user, businessProfile, loading: authLoading } = useAuth();
  const { canSchedule, isGratuito, isBasico, isPremium } = usePlan();
  const usage = useGratuitoUsage();
  const { colors: tc, isDark } = useTheme();

  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    todayAppointments: 0, confirmedToday: 0, unconfirmedToday: 0,
    weekAppointments: 0, confirmedWeek: 0, unconfirmedWeek: 0,
    totalClients: 0, totalAppointments: 0,
  });
  const [todayAppointments, setTodayAppointments] = useState<TodayAppointment[]>([]);
  const [weekAppointments,  setWeekAppointments]  = useState<TodayAppointment[]>([]);
  const [staffMembers,      setStaffMembers]      = useState<StaffMember[]>([]);
  const [selectedStaffId,   setSelectedStaffId]   = useState<string | null>(null);
  const [unpaidAppointments, setUnpaidAppointments] = useState<UnpaidAppointment[]>([]);
  const [markingPaidId,     setMarkingPaidId]     = useState<string | null>(null);

  // ⚡ FIX BUG-002 (May 17 2026): banner visual cuando el dashboard no pudo
  // refrescar (red lenta, error de Supabase, etc.). Se muestra al usuario
  // y se auto-oculta después de 5 segundos.
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadingRef  = useRef(false);
  const userIdRef   = useRef<string | undefined>(undefined);
  const prevPathRef = useRef(pathname);

  useEffect(() => { userIdRef.current = user?.id; }, [user?.id]);
  useEffect(() => { if (user?.id) loadDashboardData(user.id); }, [user?.id]);

  // ⚡ FIX UX (May 19 2026): refetch automático cuando vuelve la app de background.
  // El AppStateContext emite un evento cuando el usuario regresa después de >5min;
  // este hook lo escucha y fuerza un refetch sin cache.
  // forceRefresh=true → ignora el cache (que también fue invalidado por AppStateContext).
  // NO pasamos isPullRefresh=true para evitar mostrar el spinner del pull-to-refresh
  // (el splash de "Reconectando..." ya cubrió la UI durante el refresh).
  useAppRefreshListener(() => {
    if (userIdRef.current) {
      loadDashboardData(userIdRef.current, true);
    }
  });

  // Auto-ocultar el banner de error después de 5 segundos.
  useEffect(() => {
    if (!loadError) return;
    const t = setTimeout(() => setLoadError(null), 5000);
    return () => clearTimeout(t);
  }, [loadError]);

  useEffect(() => {
    const isHome = pathname === '/' || pathname.includes('(home)') ||
      (!pathname.includes('appointments') && !pathname.includes('clients') &&
       !pathname.includes('reports') && !pathname.includes('settings') &&
       !pathname.includes('profile') && !pathname.includes('marketing'));
    const wasAway = prevPathRef.current !== pathname;
    prevPathRef.current = pathname;
    if (isHome && wasAway && userIdRef.current) loadUnpaidAppointments(userIdRef.current);
  }, [pathname]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && userIdRef.current) loadUnpaidAppointments(userIdRef.current);
    });
    return () => sub.remove();
  }, []);

  // ── Suscripción Realtime: cobros pendientes ──
  // ⚡ PERFORMANCE FIX (May 2026): el filtro `user_id=eq.${userId}` se aplica
  // en el SERVIDOR. Antes el WAL parser de Supabase enviaba TODOS los UPDATEs
  // de appointments (de cualquier tenant) y filtrábamos en JavaScript.
  // Esto consumía memoria del server proporcional al # de tenants activos.
  // Con este filtro, solo recibimos los UPDATEs de NUESTRAS appointments.
  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;
    const channel = supabase.channel('paid-watch-' + userId)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'appointments',
        filter: `user_id=eq.${userId}`,
      }, payload => {
        const updated = payload.new as any;
        if (updated.paid === true) setUnpaidAppointments(prev => prev.filter(a => a.id !== updated.id));
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const loadDashboardData = async (userId: string, forceRefresh = false, isPullRefresh = false) => {
    if (loadingRef.current && !forceRefresh) return;
    loadingRef.current = true;
    try {
      loadUnpaidAppointments(userId);
      const cachedStats = getCached<DashboardStats>('dashboard_stats');
      const cachedApts  = getCached<TodayAppointment[]>('today_appointments');
      const cachedWeek  = getCached<TodayAppointment[]>('week_appointments');
      if (!forceRefresh && cachedStats && cachedApts) {
        setStats(cachedStats); setTodayAppointments(cachedApts);
        if (cachedWeek) setWeekAppointments(cachedWeek);
        setLoading(false); loadStaffMembers(userId); return;
      }
      if (isPullRefresh) setRefreshing(true); else setLoading(true);
      const results = await Promise.allSettled([
        apiGet<DashboardStats>('/api/stats/dashboard'),
        apiGet<TodayAppointment[]>('/api/appointments/today'),
        apiGet<TodayAppointment[]>('/api/appointments/week'),
      ]);
      if (results[0].status === 'fulfilled') { setStats(results[0].value); setCached('dashboard_stats', results[0].value, CACHE_TTL.DASHBOARD); }
      if (results[1].status === 'fulfilled') { setTodayAppointments(results[1].value); setCached('today_appointments', results[1].value, CACHE_TTL.APPOINTMENTS); }
      if (results[2].status === 'fulfilled') { setWeekAppointments(results[2].value); setCached('week_appointments', results[2].value, CACHE_TTL.APPOINTMENTS); }

      // ⚡ FIX BUG-002: detectar fallas parciales en el dashboard.
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        failed.forEach((r: any) => logger.error('[Dashboard] partial load failed:', r.reason));
        if (failed.length === results.length) {
          setLoadError('No pudimos actualizar el dashboard. Verifica tu conexión.');
        }
      }

      await loadStaffMembers(userId);
    } catch (e) {
      // ⚡ FIX BUG-002 (May 17 2026): antes este catch estaba vacío.
      logger.error('[Dashboard] loadDashboardData failed:', e);
      setLoadError('No pudimos actualizar el dashboard. Verifica tu conexión.');
    } finally {
      setLoading(false); setRefreshing(false); loadingRef.current = false;
    }
  };

  const loadStaffMembers = async (userId: string) => {
    try {
      const { data } = await supabase.from('staff_members').select('id, name, color')
        .eq('user_id', userId).eq('is_active', true).order('sort_order');
      setStaffMembers(data || []);
    } catch (e) {
      // ⚡ FIX BUG-002: staff es opcional, no bloqueamos UX. Solo log.
      logger.error('[Dashboard] loadStaffMembers failed:', e);
    }
  };

  const loadUnpaidAppointments = async (userId: string) => {
    try {
      const { data, error } = await supabase.from('appointments')
        .select('id, date, start_time, service_name, service_cost, client_name_temp, client:clients(name), staff:staff_members(name, color)')
        .eq('user_id', userId).eq('status', 'Completada')
        .or('paid.is.null,paid.eq.false')
        .order('date', { ascending: false }).limit(20);
      if (error) throw error;
      setUnpaidAppointments((data ?? []) as unknown as UnpaidAppointment[]);
    } catch (e) {
      logger.error('[Dashboard] loadUnpaidAppointments failed:', e);
    }
  };

  const markAsPaid = async (apptId: string) => {
    setMarkingPaidId(apptId);
    try {
      const { error } = await supabase.from('appointments')
        .update({ paid: true, updated_at: new Date().toISOString() }).eq('id', apptId);
      if (error) throw error;
      setUnpaidAppointments(prev => prev.filter(a => a.id !== apptId));
      invalidateCache(getReportsCacheKey());
      invalidateCache('dashboard_stats');
    } catch (e: any) {
      logger.error('[Dashboard] markAsPaid failed:', e);
      // ⚡ FIX UX-003: usar translateError en lugar de mostrar e?.message
      // genérico. Da contexto accionable al usuario (sin red, sin permiso, etc.)
      const friendly = translateError(e);
      Alert.alert(
        friendly.title,
        friendly.message,
        buildErrorAlertButtons(friendly, {
          onRetry: () => markAsPaid(apptId),
          onContactSupport: () => router.push('/settings/support-chat'),
        }) as any
      );
    } finally { setMarkingPaidId(null); }
  };

  const handleRefresh = () => {
    const uid = userIdRef.current;
    if (uid) loadDashboardData(uid, true, true);
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const getTodayDate = () => {
    const f = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    return f.charAt(0).toUpperCase() + f.slice(1);
  };

  const initials  = user?.name?.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || 'U';
  const firstName = authLoading ? '' : (user?.name?.split(' ')[0] || 'Usuario');
  const filteredToday = selectedStaffId
    ? todayAppointments.filter(a => a.staff_id === selectedStaffId)
    : todayAppointments;
  const totalUnpaid = unpaidAppointments.reduce((sum, a) => sum + (a.service_cost || 0), 0);

  const usageColor = usage.isAtLimit ? '#EF4444' : usage.isNearLimit ? '#F59E0B' : colors.primary;
  const usageBgColor = usage.isAtLimit ? '#FEF2F2' : usage.isNearLimit ? '#FFFBEB' : '#ECFDF5';
  const usageBorderColor = usage.isAtLimit ? '#FCA5A5' : usage.isNearLimit ? '#FCD34D' : colors.primary + '33';
  const usageIcon = usage.isAtLimit ? 'block' : usage.isNearLimit ? 'warning' : 'event-available';

  const usageTitle = usage.isAtLimit
    ? 'Límite mensual alcanzado'
    : usage.isNearLimit
      ? `Solo te quedan ${usage.remaining} citas`
      : `${usage.used} de ${usage.limit} citas usadas este mes`;

  const usageDesc = usage.isAtLimit
    ? 'Mejora a Plan Premium para citas ilimitadas y WhatsApp automático'
    : usage.isNearLimit
      ? 'Te estás acercando al límite. Considera actualizar a Premium.'
      : 'Plan Básico · Mejora a Premium para citas ilimitadas';

  if (loading) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[s.loadingText, { color: tc.textMuted }]}>Cargando dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* HEADER */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={[s.greeting, { color: tc.textMuted }]}>{getGreeting()},</Text>
            <Text style={[s.userName, { color: tc.text }]}>{firstName} 👋</Text>
            <View style={[s.datePill, { backgroundColor: tc.surface, borderColor: tc.border }]}>
              <View style={s.dateDot} />
              <Text style={[s.dateText, { color: tc.textMuted }]}>{getTodayDate()}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => router.push('/settings/profile')} activeOpacity={0.85} style={s.avatarBtn}>
            {businessProfile?.logoUrl ? (
              <Image source={{ uri: businessProfile.logoUrl }} style={s.avatar} />
            ) : (
              <View style={[s.avatarFallback, { backgroundColor: colors.primary + '18' }]}>
                <Text style={[s.avatarText, { color: colors.primary }]}>{initials}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ⚡ BANNER DE ERROR (BUG-002 fix) */}
        {loadError && (
          <TouchableOpacity
            style={[s.errorBanner, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}
            onPress={() => setLoadError(null)}
            activeOpacity={0.85}
          >
            <MaterialIcons name="cloud-off" size={18} color="#DC2626" />
            <View style={{ flex: 1 }}>
              <Text style={s.errorBannerTitle}>Datos posiblemente desactualizados</Text>
              <Text style={s.errorBannerDesc}>{loadError} Desliza hacia abajo para reintentar.</Text>
            </View>
            <MaterialIcons name="close" size={16} color="#DC2626" />
          </TouchableOpacity>
        )}

        {/* USAGE BANNER (Plan Básico/Gratuito) */}
        {isGratuito && !usage.loading && (
          <TouchableOpacity
            style={[s.usageCard, { backgroundColor: isDark ? tc.surface : usageBgColor, borderColor: usageBorderColor }]}
            onPress={() => router.push('/settings/subscription')}
            activeOpacity={0.85}
          >
            <View style={s.usageHeader}>
              <View style={[s.usageIconWrap, { backgroundColor: usageColor + '20' }]}>
                <MaterialIcons name={usageIcon as any} size={20} color={usageColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.usageTitle, { color: usageColor }]}>{usageTitle}</Text>
                <Text style={[s.usageDesc, { color: tc.textMuted }]}>{usageDesc}</Text>
              </View>
              <MaterialIcons name="arrow-forward-ios" size={14} color={usageColor} />
            </View>

            <View style={s.usageProgressWrap}>
              <View style={[s.usageProgressBg, { backgroundColor: tc.border + '60' }]}>
                <View style={[s.usageProgressFill, { width: `${usage.percentage}%`, backgroundColor: usageColor }]} />
              </View>
              <View style={s.usageProgressLabels}>
                <Text style={[s.usageCount, { color: usageColor }]}>
                  {usage.used} / {usage.limit}
                </Text>
                <Text style={[s.usageRemaining, { color: tc.textMuted }]}>
                  {usage.isAtLimit ? 'Sin disponibles' : `${usage.remaining} disponibles`}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* COBROS PENDIENTES — hero card */}
        {unpaidAppointments.length > 0 && (
          <View style={[s.heroCard, { backgroundColor: isDark ? '#1C1917' : '#FFFBEB', borderColor: '#F59E0B44' }]}>
            <View style={s.heroLeft}>
              <View style={s.heroBadge}>
                <View style={[s.heroBadgeDot, { backgroundColor: '#F59E0B' }]} />
                <Text style={[s.heroBadgeText, { color: '#F59E0B' }]}>Por cobrar</Text>
              </View>
              <Text style={[s.heroAmount, { color: '#F59E0B' }]}>${totalUnpaid.toLocaleString('es-MX')}</Text>
              <Text style={[s.heroSub, { color: tc.textMuted }]}>{unpaidAppointments.length} cita{unpaidAppointments.length !== 1 ? 's' : ''} pendiente{unpaidAppointments.length !== 1 ? 's' : ''}</Text>
            </View>
            <View style={[s.heroIconWrap, { backgroundColor: '#F59E0B18' }]}>
              <MaterialIcons name="payments" size={36} color="#F59E0B" />
            </View>
          </View>
        )}

        {/* KPIs */}
        {!isGratuito && (
          <>
            <View style={s.sectionRow}>
              <Text style={[s.sectionTitle, { color: tc.textMuted }]}>HOY</Text>
              <Text style={[s.sectionDate, { color: tc.textMuted }]}>{new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</Text>
            </View>
            <View style={s.kpiRow}>
              {[
                { value: stats.todayAppointments, label: 'TOTAL',       accent: '#F59E0B', icon: 'event' },
                { value: stats.confirmedToday,    label: 'CONFIRMADAS', accent: colors.primary, icon: 'check-circle' },
                { value: stats.unconfirmedToday,  label: 'PENDIENTES',  accent: '#3B82F6', icon: 'schedule' },
              ].map(({ value, label, accent, icon }) => (
                <View key={label} style={[s.kpiCard, { backgroundColor: tc.surface, borderColor: accent + '33' }]}>
                  <View style={[s.kpiIconWrap, { backgroundColor: accent + '18' }]}>
                    <MaterialIcons name={icon as any} size={18} color={accent} />
                  </View>
                  <Text style={[s.kpiValue, { color: accent }]}>{value}</Text>
                  <Text style={[s.kpiLabel, { color: tc.textMuted }]}>{label}</Text>
                </View>
              ))}
            </View>
            <View style={[s.sectionRow, { marginTop: 4 }]}>
              <Text style={[s.sectionTitle, { color: tc.textMuted }]}>ESTA SEMANA</Text>
            </View>
            <View style={s.kpiRow}>
              {[
                { value: stats.weekAppointments, label: 'TOTAL',       accent: '#8B5CF6', icon: 'date-range' },
                { value: stats.confirmedWeek,    label: 'CONFIRMADAS', accent: colors.primary, icon: 'check-circle' },
                { value: stats.unconfirmedWeek,  label: 'PENDIENTES',  accent: '#3B82F6', icon: 'schedule' },
              ].map(({ value, label, accent, icon }) => (
                <View key={label} style={[s.kpiCard, { backgroundColor: tc.surface, borderColor: accent + '33' }]}>
                  <View style={[s.kpiIconWrap, { backgroundColor: accent + '18' }]}>
                    <MaterialIcons name={icon as any} size={18} color={accent} />
                  </View>
                  <Text style={[s.kpiValue, { color: accent }]}>{value}</Text>
                  <Text style={[s.kpiLabel, { color: tc.textMuted }]}>{label}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* LISTA COBROS */}
        {unpaidAppointments.length > 0 && (
          <>
            <View style={s.sectionRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[s.sectionTitle, { color: tc.textMuted }]}>COBROS PENDIENTES</Text>
                <View style={[s.countBadge, { backgroundColor: '#F97316' + '22' }]}>
                  <Text style={[s.countBadgeText, { color: '#F97316' }]}>{unpaidAppointments.length}</Text>
                </View>
              </View>
            </View>
            {unpaidAppointments.map(appt => {
              const clientName = appt.client?.name ?? appt.client_name_temp ?? 'Cliente';
              const staffName  = (appt.staff as any)?.name ?? null;
              const isPaying   = markingPaidId === appt.id;
              const dateLabel  = new Date(appt.date + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
              return (
                <View key={appt.id} style={[s.unpaidCard, { backgroundColor: tc.surface, borderColor: '#F97316' + '33' }]}>
                  <View style={s.unpaidLeft}>
                    <Text style={[s.unpaidClient, { color: tc.text }]} numberOfLines={1}>{clientName}</Text>
                    <Text style={[s.unpaidSub, { color: tc.textMuted }]} numberOfLines={1}>
                      {appt.service_name}{staffName ? '  ·  ' + staffName : ''}{'  ·  '}{dateLabel}  {appt.start_time.slice(0, 5)}
                    </Text>
                  </View>
                  {appt.service_cost != null && appt.service_cost > 0 && (
                    <Text style={[s.unpaidAmount, { color: colors.primary }]}>${appt.service_cost.toLocaleString('es-MX')}</Text>
                  )}
                  <TouchableOpacity
                    style={[s.payBtn, isPaying && { opacity: 0.6 }]}
                    onPress={() => Alert.alert(
                      'Registrar pago',
                      'Confirmar pago de ' + clientName + (appt.service_cost ? ' - $' + appt.service_cost.toLocaleString('es-MX') + ' MXN' : '') + '?',
                      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Confirmar', onPress: () => markAsPaid(appt.id) }]
                    )}
                    disabled={isPaying} activeOpacity={0.75}
                  >
                    {isPaying
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={s.payBtnText}>Cobrar</Text>}
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}

        {/* FILTRO STAFF */}
        {staffMembers.length > 0 && (
          <>
            <View style={s.sectionRow}>
              <Text style={[s.sectionTitle, { color: tc.textMuted }]}>VER AGENDA DE</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <TouchableOpacity
                style={[s.staffChip, { backgroundColor: tc.surface, borderColor: tc.border }, !selectedStaffId && { backgroundColor: colors.primary + '18', borderColor: colors.primary }]}
                onPress={() => setSelectedStaffId(null)}
              >
                <MaterialIcons name="group" size={13} color={!selectedStaffId ? colors.primary : tc.textMuted} />
                <Text style={[s.staffChipText, { color: !selectedStaffId ? colors.primary : tc.textMuted }]}>Todos</Text>
              </TouchableOpacity>
              {staffMembers.map(m => (
                <TouchableOpacity
                  key={m.id}
                  style={[s.staffChip, { backgroundColor: tc.surface, borderColor: tc.border }, selectedStaffId === m.id && { backgroundColor: m.color + '18', borderColor: m.color }]}
                  onPress={() => setSelectedStaffId(selectedStaffId === m.id ? null : m.id)}
                >
                  <View style={[s.staffDot, { backgroundColor: m.color }]} />
                  <Text style={[s.staffChipText, { color: selectedStaffId === m.id ? m.color : tc.textMuted }]}>{m.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* CITAS DE HOY */}
        <View style={s.sectionRow}>
          <Text style={[s.sectionTitle, { color: tc.textMuted }]}>
            {selectedStaffId ? 'CITAS - ' + (staffMembers.find(m => m.id === selectedStaffId)?.name?.toUpperCase() || '') : 'AGENDA DE HOY'}
          </Text>
          {filteredToday.length > 0 && (
            <TouchableOpacity onPress={() => router.push('/(tabs)/appointments')}>
              <Text style={[s.seeAll, { color: colors.primary }]}>Ver todas</Text>
            </TouchableOpacity>
          )}
        </View>

        {filteredToday.length === 0 ? (
          <View style={[s.emptyCard, { backgroundColor: tc.surface, borderColor: tc.border }]}>
            <MaterialIcons name="event-available" size={32} color={tc.border} />
            <Text style={[s.emptyTitle, { color: tc.text }]}>Agenda libre hoy</Text>
            <Text style={[s.emptyDesc, { color: tc.textMuted }]}>
              {selectedStaffId ? 'Sin citas asignadas a este colaborador' : 'No tienes citas programadas'}
            </Text>
            {canSchedule && (
              <TouchableOpacity style={[s.emptyBtn, { backgroundColor: colors.primary }]} onPress={() => router.push('/appointments/new')}>
                <MaterialIcons name="add" size={15} color="#fff" />
                <Text style={s.emptyBtnText}>Crear cita</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={{ gap: 8, marginBottom: 20 }}>
            {filteredToday.map(appt => {
              const statusColor = getStatusColor(appt.status);
              const displayName = appt.client?.name || appt.clientNameTemp || 'Cliente';
              const staffMember = appt.staff_id ? staffMembers.find(m => m.id === appt.staff_id) : null;
              const accentColor = staffMember ? staffMember.color : statusColor;
              return (
                <TouchableOpacity
                  key={appt.id}
                  style={[s.apptCard, { backgroundColor: tc.surface, borderColor: tc.border, borderLeftColor: accentColor }]}
                  onPress={() => router.push('/appointments/' + appt.id)}
                  activeOpacity={0.75}
                >
                  <View style={s.apptTimeCol}>
                    <Text style={[s.apptTime, { color: tc.text }]}>{appt.time}</Text>
                    {staffMember && <View style={[s.apptStaffDot, { backgroundColor: staffMember.color }]} />}
                  </View>
                  <View style={s.apptBody}>
                    <Text style={[s.apptClient, { color: tc.text }]} numberOfLines={1}>{displayName}</Text>
                    <Text style={[s.apptService, { color: tc.textMuted }]} numberOfLines={1}>
                      {appt.service}{staffMember ? ' · ' + staffMember.name : ''}
                    </Text>
                  </View>
                  <View style={[s.apptBadge, { backgroundColor: accentColor + '22' }]}>
                    <Text style={[s.apptBadgeText, { color: accentColor }]}>{appt.status}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={16} color={tc.border} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ACCIONES RAPIDAS */}
        <View style={s.sectionRow}>
          <Text style={[s.sectionTitle, { color: tc.textMuted }]}>ACCIONES RAPIDAS</Text>
        </View>
        <View style={s.actionsGrid}>
          {[
            { icon: 'add-circle-outline', label: 'Nueva cita',        accent: colors.primary, path: '/appointments/new' },
            { icon: 'person-add-alt',     label: 'Nuevo cliente',     accent: '#3B82F6',      path: '/clients/new' },
            { icon: 'calendar-month',     label: 'Ver agenda',        accent: '#8B5CF6',      path: '/(tabs)/appointments' },
            { icon: 'person-search',      label: 'Clientes inactivos',accent: '#F59E0B',      path: '/clients/inactive' },
          ].map(({ icon, label, accent, path }) => (
            <TouchableOpacity
              key={label}
              style={[s.qaBtn, { backgroundColor: tc.surface, borderColor: accent + '44' }]}
              onPress={() => router.push(path as any)}
              activeOpacity={0.7}
            >
              <View style={[s.qaIconWrap, { backgroundColor: accent + '18' }]}>
                <MaterialIcons name={icon as any} size={22} color={accent} />
              </View>
              <Text style={[s.qaLabel, { color: tc.text }]}>{label}</Text>
              <MaterialIcons name="chevron-right" size={16} color={tc.border} />
            </TouchableOpacity>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1 },
  loadingWrap:     { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText:     { fontSize: 13 },
  scroll:          { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 },
  header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  greeting:        { fontSize: 13, fontWeight: '500', marginBottom: 2 },
  userName:        { fontSize: 26, fontWeight: '900', letterSpacing: -0.5, marginBottom: 10 },
  datePill:        { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1 },
  dateDot:         { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  dateText:        { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  avatarBtn:       {},
  avatar:          { width: 56, height: 56, borderRadius: 16, borderWidth: 2, borderColor: colors.primary },
  avatarFallback:  { width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.primary },
  avatarText:      { fontSize: 20, fontWeight: '900' },

  // ⚡ Banner de error (BUG-002 fix)
  errorBanner:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1 },
  errorBannerTitle:{ fontSize: 13, fontWeight: '700', color: '#DC2626' },
  errorBannerDesc: { fontSize: 11, color: '#991B1B', marginTop: 2 },

  // Usage card (Plan Básico) — contador con barra de progreso
  usageCard:       { borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1.5 },
  usageHeader:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  usageIconWrap:   { width: 38, height: 38, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  usageTitle:      { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  usageDesc:       { fontSize: 11, lineHeight: 15 },
  usageProgressWrap: { gap: 6 },
  usageProgressBg: { height: 8, borderRadius: 4, overflow: 'hidden' },
  usageProgressFill: { height: '100%', borderRadius: 4 },
  usageProgressLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  usageCount:      { fontSize: 13, fontWeight: '800' },
  usageRemaining:  { fontSize: 11, fontWeight: '500' },

  heroCard:        { borderRadius: 20, padding: 22, marginBottom: 20, flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  heroLeft:        { flex: 1 },
  heroBadge:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  heroBadgeDot:    { width: 7, height: 7, borderRadius: 4 },
  heroBadgeText:   { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  heroAmount:      { fontSize: 36, fontWeight: '900', letterSpacing: -1, lineHeight: 40 },
  heroSub:         { fontSize: 12, marginTop: 4 },
  heroIconWrap:    { width: 72, height: 72, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  sectionRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 4 },
  sectionTitle:    { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  sectionDate:     { fontSize: 11, fontWeight: '600' },
  seeAll:          { fontSize: 12, fontWeight: '700' },
  countBadge:      { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countBadgeText:  { fontSize: 11, fontWeight: '800' },
  kpiRow:          { flexDirection: 'row', marginBottom: 16, gap: 8 },
  kpiCard:         { flex: 1, borderRadius: 14, padding: 12, borderWidth: 1, alignItems: 'center', gap: 5 },
  kpiIconWrap:     { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  kpiValue:        { fontSize: 26, fontWeight: '900', letterSpacing: -1, lineHeight: 30 },
  kpiLabel:        { fontSize: 9, fontWeight: '700', textAlign: 'center', letterSpacing: 0.5 },
  unpaidCard:      { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderLeftWidth: 3, borderLeftColor: '#F97316' },
  unpaidLeft:      { flex: 1, marginRight: 10 },
  unpaidClient:    { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  unpaidSub:       { fontSize: 11 },
  unpaidAmount:    { fontSize: 15, fontWeight: '900', marginRight: 10 },
  payBtn:          { backgroundColor: '#F59E0B', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, minWidth: 64, alignItems: 'center' },
  payBtnText:      { fontSize: 12, fontWeight: '800', color: '#fff' },
  staffChip:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  staffChipText:   { fontSize: 12, fontWeight: '600' },
  staffDot:        { width: 7, height: 7, borderRadius: 4 },
  apptCard:        { borderRadius: 14, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderLeftWidth: 3 },
  apptTimeCol:     { paddingHorizontal: 14, paddingVertical: 16, minWidth: 60, alignItems: 'center', gap: 4 },
  apptTime:        { fontSize: 13, fontWeight: '800' },
  apptStaffDot:    { width: 5, height: 5, borderRadius: 3 },
  apptBody:        { flex: 1, paddingVertical: 14 },
  apptClient:      { fontSize: 14, fontWeight: '700' },
  apptService:     { fontSize: 11, marginTop: 2 },
  apptBadge:       { marginRight: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  apptBadgeText:   { fontSize: 10, fontWeight: '700' },
  emptyCard:       { borderRadius: 18, padding: 32, alignItems: 'center', borderWidth: 1, gap: 8, marginBottom: 20 },
  emptyTitle:      { fontSize: 16, fontWeight: '700' },
  emptyDesc:       { fontSize: 13, textAlign: 'center' },
  emptyBtn:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12, marginTop: 8 },
  emptyBtnText:    { color: '#fff', fontWeight: '800', fontSize: 14 },
  actionsGrid:     { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
  qaBtn:           { width: '48%', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  qaIconWrap:      { width: 38, height: 38, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  qaLabel:         { fontSize: 12, fontWeight: '600', flex: 1 },
});
