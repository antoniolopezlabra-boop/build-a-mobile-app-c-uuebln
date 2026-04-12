import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, RefreshControl, Alert, AppState, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { usePlan } from '@/contexts/PlanContext';
import { colors } from '@/styles/commonStyles';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { apiGet } from '@/utils/api';
import { getCached, setCached, invalidateCache, CACHE_TTL } from '@/utils/cache';
import { getStatusColor } from '@/utils/appointmentUtils';
import { supabase } from '@/lib/supabase';

const { width: SCREEN_W } = Dimensions.get('window');

// FIX #13: clave dinámica de caché de reportes (año_mes)
function getReportsCacheKey() {
  const n = new Date();
  return `reports_stats_${n.getFullYear()}_${n.getMonth() + 1}`;
}

// Paleta dark premium
const D = {
  bg:        '#060B14',
  surface:   '#0D1526',
  surface2:  '#111D35',
  border:    '#1E2D4A',
  gold:      '#F59E0B',
  goldDim:   '#F59E0B22',
  green:     '#10B981',
  greenDim:  '#10B98122',
  blue:      '#3B82F6',
  purple:    '#8B5CF6',
  text:      '#F1F5F9',
  textMuted: '#64748B',
  textSoft:  '#94A3B8',
  red:       '#EF4444',
  orange:    '#F97316',
};

interface DashboardStats {
  todayAppointments: number; confirmedToday: number; unconfirmedToday: number;
  weekAppointments: number; confirmedWeek: number; unconfirmedWeek: number;
  totalClients: number; totalAppointments: number;
}

interface TodayAppointment {
  id: string; time: string; service: string; status: string;
  client: { id: string; name: string; phone: string } | null;
  clientNameTemp?: string | null;
  source?: string | null;
  staff_id?: string | null;
  staff?: { name: string; color: string } | null;
}

interface StaffMember { id: string; name: string; color: string; }

interface UnpaidAppointment {
  id: string; date: string; start_time: string;
  service_name: string; service_cost: number | null;
  client: { name: string } | null;
  client_name_temp: string | null;
  staff: { name: string; color: string } | null;
}

interface WhatsAppConfig { isConnected: boolean; phoneNumber?: string; }

// KPI card estilo Sonar
function KpiCard({ value, label, accent, icon }: {
  value: number; label: string; accent: string; icon: string;
}) {
  return (
    <View style={[kpi.card, { borderColor: accent + '33', backgroundColor: D.surface }]}>
      <View style={[kpi.iconWrap, { backgroundColor: accent + '18' }]}>
        <MaterialIcons name={icon as any} size={18} color={accent} />
      </View>
      <Text style={[kpi.value, { color: accent }]}>{value}</Text>
      <Text style={kpi.label}>{label}</Text>
    </View>
  );
}
const kpi = StyleSheet.create({
  card:     { flex: 1, borderRadius: 16, padding: 14, marginHorizontal: 4, borderWidth: 1, alignItems: 'center', gap: 6 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  value:    { fontSize: 30, fontWeight: '900', letterSpacing: -1, lineHeight: 34 },
  label:    { fontSize: 10, color: D.textMuted, fontWeight: '600', textAlign: 'center', letterSpacing: 0.5 },
});

// Accion rapida dark
function QuickAction({ icon, label, onPress, accent = D.green }: {
  icon: string; label: string; onPress: () => void; accent?: string;
}) {
  return (
    <TouchableOpacity style={[qa.btn, { backgroundColor: D.surface, borderColor: accent + '44' }]} onPress={onPress} activeOpacity={0.7}>
      <View style={[qa.iconWrap, { backgroundColor: accent + '18' }]}>
        <MaterialIcons name={icon as any} size={22} color={accent} />
      </View>
      <Text style={[qa.label, { color: D.text }]}>{label}</Text>
      <MaterialIcons name="chevron-right" size={16} color={D.textMuted} />
    </TouchableOpacity>
  );
}
const qa = StyleSheet.create({
  btn:      { width: '48%', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: { width: 38, height: 38, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  label:    { fontSize: 12, fontWeight: '600', flex: 1, color: D.text },
});

export default function HomeScreen() {
  const router   = useRouter();
  const pathname = usePathname();
  const { user, businessProfile, loading: authLoading } = useAuth();
  const { canSchedule, isGratuito, isBasico, isPremium } = usePlan();
  const { isDark } = useTheme();

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    todayAppointments:0, confirmedToday:0, unconfirmedToday:0,
    weekAppointments:0,  confirmedWeek:0,  unconfirmedWeek:0,
    totalClients:0, totalAppointments:0,
  });
  const [todayAppointments, setTodayAppointments] = useState<TodayAppointment[]>([]);
  const [weekAppointments,  setWeekAppointments]  = useState<TodayAppointment[]>([]);
  const [waConnected, setWaConnected] = useState(false);
  const [staffMembers,    setStaffMembers]    = useState<StaffMember[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [unpaidAppointments, setUnpaidAppointments] = useState<UnpaidAppointment[]>([]);
  const [markingPaidId, setMarkingPaidId]     = useState<string | null>(null);

  const loadingRef  = useRef(false);
  const userIdRef   = useRef<string | undefined>(undefined);
  const prevPathRef = useRef(pathname);

  useEffect(() => { userIdRef.current = user?.id; }, [user?.id]);

  useEffect(() => {
    if (user?.id) loadDashboardData(user.id);
  }, [user?.id]);

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
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && userIdRef.current) loadUnpaidAppointments(userIdRef.current);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;
    const channel = supabase
      .channel(`paid-watch-${userId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'appointments' },
        (payload) => {
          const updated = payload.new as any;
          if (updated.user_id !== userId) return;
          if (updated.paid === true) setUnpaidAppointments(prev => prev.filter(a => a.id !== updated.id));
        }
      ).subscribe();
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
      const cachedWa    = getCached<WhatsAppConfig>('settings_whatsapp');
      if (!forceRefresh && cachedStats && cachedApts) {
        setStats(cachedStats); setTodayAppointments(cachedApts);
        if (cachedWeek) setWeekAppointments(cachedWeek);
        if (cachedWa)   setWaConnected(cachedWa.isConnected || false);
        setLoading(false); loadStaffMembers(userId); return;
      }
      if (isPullRefresh) setRefreshing(true); else setLoading(true);
      const results = await Promise.allSettled([
        apiGet<DashboardStats>('/api/stats/dashboard'),
        apiGet<TodayAppointment[]>('/api/appointments/today'),
        apiGet<TodayAppointment[]>('/api/appointments/week'),
        apiGet<WhatsAppConfig>('/api/whatsapp-config'),
      ]);
      if (results[0].status === 'fulfilled') { setStats(results[0].value); setCached('dashboard_stats', results[0].value, CACHE_TTL.DASHBOARD); }
      if (results[1].status === 'fulfilled') { setTodayAppointments(results[1].value); setCached('today_appointments', results[1].value, CACHE_TTL.APPOINTMENTS); }
      if (results[2].status === 'fulfilled') { setWeekAppointments(results[2].value);  setCached('week_appointments',  results[2].value,  CACHE_TTL.APPOINTMENTS); }
      if (results[3].status === 'fulfilled') { const wa = results[3].value; setWaConnected(wa?.isConnected || false); setCached('settings_whatsapp', wa, CACHE_TTL.SETTINGS); }
      await loadStaffMembers(userId);
    } catch {} finally {
      setLoading(false); setRefreshing(false); loadingRef.current = false;
    }
  };

  const loadStaffMembers = async (userId: string) => {
    try {
      const { data } = await supabase.from('staff_members').select('id, name, color')
        .eq('user_id', userId).eq('is_active', true).order('sort_order');
      setStaffMembers(data || []);
    } catch {}
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
    } catch (e) { console.warn('[Dashboard] loadUnpaidAppointments error:', e); }
  };

  // FIX #13: invalidar caché de reportes con clave dinámica al marcar como pagado
  const markAsPaid = async (apptId: string) => {
    setMarkingPaidId(apptId);
    try {
      const { error } = await supabase.from('appointments')
        .update({ paid: true, updated_at: new Date().toISOString() }).eq('id', apptId);
      if (error) throw error;
      setUnpaidAppointments(prev => prev.filter(a => a.id !== apptId));
      // FIX #13: invalidar reportes para que al ir a Reportes vea los ingresos actualizados
      invalidateCache(getReportsCacheKey());
      invalidateCache('dashboard_stats');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo registrar el pago');
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
    const f = new Date().toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' });
    return f.charAt(0).toUpperCase()+f.slice(1);
  };

  const initials  = user?.name?.split(' ').map((w:string)=>w[0]).slice(0,2).join('').toUpperCase() || 'U';
  const firstName = authLoading ? '' : (user?.name?.split(' ')[0] || 'Usuario');
  const filteredToday = selectedStaffId
    ? todayAppointments.filter(a => a.staff_id === selectedStaffId)
    : todayAppointments;

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: D.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={D.gold} />
        <Text style={{ color: D.textMuted, marginTop: 12, fontSize: 13 }}>Cargando dashboard...</Text>
      </View>
    );
  }

  const totalUnpaid = unpaidAppointments.reduce((sum, a) => sum + (a.service_cost || 0), 0);

  return (
    <View style={s.container}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh}
              tintColor={D.gold} colors={[D.gold]} progressBackgroundColor={D.surface} />
          }
        >
          {/* HEADER */}
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.greeting}>{getGreeting()},</Text>
              <Text style={s.userName}>{firstName} 👋</Text>
              <View style={s.datePill}>
                <View style={s.dateDot} />
                <Text style={s.dateText}>{getTodayDate()}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => router.push('/settings/profile')} activeOpacity={0.85} style={s.avatarBtn}>
              {businessProfile?.logoUrl ? (
                <Image source={{ uri: businessProfile.logoUrl }} style={s.avatar} />
              ) : (
                <View style={s.avatarFallback}>
                  <Text style={s.avatarText}>{initials}</Text>
                </View>
              )}
              <View style={s.avatarRing} />
            </TouchableOpacity>
          </View>

          {/* UPGRADE BANNER */}
          {isGratuito && (
            <TouchableOpacity style={s.upgradeCard} onPress={() => router.push('/settings/subscription')} activeOpacity={0.85}>
              <View style={s.upgradeIconWrap}>
                <MaterialIcons name="bolt" size={22} color={D.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.upgradeTitle}>Activa tu plan VYLTA</Text>
                <Text style={s.upgradeDesc}>Agenda citas y automatiza recordatorios por WhatsApp</Text>
              </View>
              <MaterialIcons name="arrow-forward-ios" size={14} color={D.gold} />
            </TouchableOpacity>
          )}

          {/* COBROS PENDIENTES */}
          {unpaidAppointments.length > 0 && (
            <View style={s.heroCard}>
              <View style={s.heroLeft}>
                <View style={s.heroBadge}>
                  <View style={s.heroBadgeDot} />
                  <Text style={s.heroBadgeText}>Por cobrar</Text>
                </View>
                <Text style={s.heroAmount}>${totalUnpaid.toLocaleString('es-MX')}</Text>
                <Text style={s.heroSub}>{unpaidAppointments.length} cita{unpaidAppointments.length !== 1 ? 's' : ''} pendiente{unpaidAppointments.length !== 1 ? 's' : ''}</Text>
              </View>
              <View style={[s.heroIconWrap]}>
                <MaterialIcons name="payments" size={36} color={D.gold} />
              </View>
            </View>
          )}

          {/* KPIs GRID */}
          {!isGratuito && (
            <>
              <View style={s.sectionRow}>
                <Text style={s.sectionTitle}>HOY</Text>
                <Text style={s.sectionDate}>{new Date().toLocaleDateString('es-MX', { day:'numeric', month:'short' })}</Text>
              </View>
              <View style={s.kpiRow}>
                <KpiCard value={stats.todayAppointments} label="TOTAL"       accent={D.gold}   icon="event" />
                <KpiCard value={stats.confirmedToday}    label="CONFIRMADAS" accent={D.green}  icon="check-circle" />
                <KpiCard value={stats.unconfirmedToday}  label="PENDIENTES"  accent={D.blue}   icon="schedule" />
              </View>
              <View style={[s.sectionRow, { marginTop: 8 }]}>
                <Text style={s.sectionTitle}>ESTA SEMANA</Text>
              </View>
              <View style={s.kpiRow}>
                <KpiCard value={stats.weekAppointments} label="TOTAL"       accent={D.purple} icon="date-range" />
                <KpiCard value={stats.confirmedWeek}    label="CONFIRMADAS" accent={D.green}  icon="check-circle" />
                <KpiCard value={stats.unconfirmedWeek}  label="PENDIENTES"  accent={D.blue}   icon="schedule" />
              </View>
            </>
          )}

          {/* LISTA COBROS PENDIENTES */}
          {unpaidAppointments.length > 0 && (
            <>
              <View style={s.sectionRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={s.sectionTitle}>COBROS PENDIENTES</Text>
                  <View style={s.countBadge}>
                    <Text style={s.countBadgeText}>{unpaidAppointments.length}</Text>
                  </View>
                </View>
              </View>
              {unpaidAppointments.map(appt => {
                const clientName = appt.client?.name ?? appt.client_name_temp ?? 'Cliente';
                const staffName  = (appt.staff as any)?.name ?? null;
                const isPaying   = markingPaidId === appt.id;
                const dateLabel  = new Date(appt.date + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
                return (
                  <View key={appt.id} style={s.unpaidCard}>
                    <View style={s.unpaidLeft}>
                      <Text style={s.unpaidClient} numberOfLines={1}>{clientName}</Text>
                      <Text style={s.unpaidSub} numberOfLines={1}>
                        {appt.service_name}{staffName ? `  ·  ${staffName}` : ''}{'  ·  '}{dateLabel}  {appt.start_time.slice(0,5)}
                      </Text>
                    </View>
                    {appt.service_cost != null && appt.service_cost > 0 && (
                      <Text style={s.unpaidAmount}>${appt.service_cost.toLocaleString('es-MX')}</Text>
                    )}
                    <TouchableOpacity
                      style={[s.payBtn, isPaying && { opacity: 0.6 }]}
                      onPress={() => Alert.alert(
                        'Registrar pago',
                        `¿Confirmar pago de ${clientName}${appt.service_cost ? ` — $${appt.service_cost.toLocaleString('es-MX')} MXN` : ''}?`,
                        [{ text: 'Cancelar', style: 'cancel' }, { text: 'Confirmar', onPress: () => markAsPaid(appt.id) }]
                      )}
                      disabled={isPaying} activeOpacity={0.75}
                    >
                      {isPaying
                        ? <ActivityIndicator size="small" color={D.gold} />
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
                <Text style={s.sectionTitle}>VER AGENDA DE</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <TouchableOpacity
                  style={[s.staffChip, !selectedStaffId && { backgroundColor: D.green + '22', borderColor: D.green }]}
                  onPress={() => setSelectedStaffId(null)}
                >
                  <MaterialIcons name="group" size={13} color={!selectedStaffId ? D.green : D.textMuted} />
                  <Text style={[s.staffChipText, { color: !selectedStaffId ? D.green : D.textMuted }]}>Todos</Text>
                </TouchableOpacity>
                {staffMembers.map(m => (
                  <TouchableOpacity
                    key={m.id}
                    style={[s.staffChip, selectedStaffId===m.id && { backgroundColor: m.color+'22', borderColor: m.color }]}
                    onPress={() => setSelectedStaffId(selectedStaffId===m.id ? null : m.id)}
                  >
                    <View style={[s.staffDot, { backgroundColor: m.color }]} />
                    <Text style={[s.staffChipText, { color: selectedStaffId===m.id ? m.color : D.textMuted }]}>{m.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {/* CITAS DE HOY */}
          <View style={s.sectionRow}>
            <Text style={s.sectionTitle}>
              {selectedStaffId ? `CITAS — ${staffMembers.find(m=>m.id===selectedStaffId)?.name?.toUpperCase()}` : 'AGENDA DE HOY'}
            </Text>
            {filteredToday.length > 0 && (
              <TouchableOpacity onPress={() => router.push('/(tabs)/appointments')}>
                <Text style={s.seeAll}>Ver todas →</Text>
              </TouchableOpacity>
            )}
          </View>

          {filteredToday.length === 0 ? (
            <View style={s.emptyCard}>
              <MaterialIcons name="event-available" size={32} color={D.textMuted} />
              <Text style={s.emptyTitle}>Agenda libre hoy</Text>
              <Text style={s.emptyDesc}>
                {selectedStaffId ? 'Sin citas asignadas a este colaborador' : 'No tienes citas programadas'}
              </Text>
              {canSchedule && (
                <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/appointments/new')}>
                  <MaterialIcons name="add" size={15} color={D.bg} />
                  <Text style={s.emptyBtnText}>Crear cita</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={{ gap: 8, marginBottom: 20 }}>
              {filteredToday.map((appt) => {
                const statusColor = getStatusColor(appt.status);
                const displayName = appt.client?.name || appt.clientNameTemp || 'Cliente';
                const staffMember = appt.staff_id ? staffMembers.find(m => m.id === appt.staff_id) : null;
                const accentColor = staffMember ? staffMember.color : statusColor;
                return (
                  <TouchableOpacity
                    key={appt.id}
                    style={[s.apptCard, { borderLeftColor: accentColor }]}
                    onPress={() => router.push(`/appointments/${appt.id}`)}
                    activeOpacity={0.75}
                  >
                    <View style={s.apptTimeCol}>
                      <Text style={s.apptTime}>{appt.time}</Text>
                      {staffMember && <View style={[s.apptStaffDot, { backgroundColor: staffMember.color }]} />}
                    </View>
                    <View style={s.apptBody}>
                      <Text style={s.apptClient} numberOfLines={1}>{displayName}</Text>
                      <Text style={s.apptService} numberOfLines={1}>
                        {appt.service}{staffMember ? ` · ${staffMember.name}` : ''}
                      </Text>
                    </View>
                    <View style={[s.apptBadge, { backgroundColor: accentColor + '22' }]}>
                      <Text style={[s.apptBadgeText, { color: accentColor }]}>{appt.status}</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={16} color={D.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* ACCIONES RÁPIDAS */}
          <View style={s.sectionRow}>
            <Text style={s.sectionTitle}>ACCIONES RÁPIDAS</Text>
          </View>
          <View style={s.actionsGrid}>
            <QuickAction icon="add-circle-outline" label="Nueva cita"         accent={D.green}  onPress={() => router.push('/appointments/new')} />
            <QuickAction icon="person-add-alt"     label="Nuevo cliente"      accent={D.blue}   onPress={() => router.push('/clients/new')} />
            <QuickAction icon="calendar-month"     label="Ver agenda"         accent={D.purple} onPress={() => router.push('/(tabs)/appointments')} />
            <QuickAction icon="person-search"      label="Clientes inactivos" accent={D.gold}   onPress={() => router.push('/clients/inactive')} />
          </View>

          {/* BANNER WHATSAPP */}
          {(isBasico || isPremium) && !waConnected && (
            <TouchableOpacity style={s.waBanner} onPress={() => router.push('/settings/whatsapp')} activeOpacity={0.8}>
              <View style={s.waIconBox}>
                <MaterialIcons name="chat" size={20} color="#25D366" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.waTitle}>Conecta WhatsApp</Text>
                <Text style={s.waDesc}>Activa recordatorios automáticos para tus clientes</Text>
              </View>
              <MaterialIcons name="arrow-forward-ios" size={13} color="#25D366" />
            </TouchableOpacity>
          )}

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: D.bg },
  scroll:           { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  greeting:         { fontSize: 13, color: D.textMuted, fontWeight: '500', marginBottom: 2 },
  userName:         { fontSize: 26, fontWeight: '900', color: D.text, letterSpacing: -0.5, marginBottom: 10 },
  datePill:         { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
                      backgroundColor: D.surface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
                      borderWidth: 1, borderColor: D.border },
  dateDot:          { width: 6, height: 6, borderRadius: 3, backgroundColor: D.green },
  dateText:         { fontSize: 11, color: D.textSoft, fontWeight: '600', letterSpacing: 0.3 },
  avatarBtn:        { position: 'relative' },
  avatar:           { width: 64, height: 64, borderRadius: 20, borderWidth: 2, borderColor: D.gold },
  avatarFallback:   { width: 64, height: 64, borderRadius: 20, backgroundColor: D.gold + '22',
                      justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: D.gold },
  avatarText:       { fontSize: 22, fontWeight: '900', color: D.gold },
  avatarRing:       { position: 'absolute', inset: -3, borderRadius: 23, borderWidth: 1, borderColor: D.gold + '44' },
  upgradeCard:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: D.surface,
                      borderRadius: 18, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: D.gold + '44' },
  upgradeIconWrap:  { width: 44, height: 44, borderRadius: 14, backgroundColor: D.goldDim, justifyContent: 'center', alignItems: 'center' },
  upgradeTitle:     { fontSize: 15, fontWeight: '800', color: D.gold, marginBottom: 2 },
  upgradeDesc:      { fontSize: 12, color: D.textMuted, lineHeight: 17 },
  heroCard:         { backgroundColor: D.surface, borderRadius: 20, padding: 22, marginBottom: 20,
                      flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: D.gold + '44' },
  heroLeft:         { flex: 1 },
  heroBadge:        { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  heroBadgeDot:     { width: 7, height: 7, borderRadius: 4, backgroundColor: D.gold },
  heroBadgeText:    { fontSize: 11, color: D.gold, fontWeight: '700', letterSpacing: 1 },
  heroAmount:       { fontSize: 38, fontWeight: '900', color: D.gold, letterSpacing: -1, lineHeight: 42 },
  heroSub:          { fontSize: 12, color: D.textMuted, marginTop: 4 },
  heroIconWrap:     { width: 72, height: 72, borderRadius: 20, backgroundColor: D.goldDim, justifyContent: 'center', alignItems: 'center' },
  sectionRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 4 },
  sectionTitle:     { fontSize: 11, fontWeight: '800', color: D.textMuted, letterSpacing: 1.5 },
  sectionDate:      { fontSize: 11, color: D.textMuted, fontWeight: '600' },
  seeAll:           { fontSize: 12, color: D.gold, fontWeight: '700' },
  countBadge:       { backgroundColor: D.orange + '33', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countBadgeText:   { fontSize: 11, fontWeight: '800', color: D.orange },
  kpiRow:           { flexDirection: 'row', marginBottom: 16, marginHorizontal: -4 },
  unpaidCard:       { flexDirection: 'row', alignItems: 'center', backgroundColor: D.surface,
                      borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: D.orange + '33',
                      borderLeftWidth: 3, borderLeftColor: D.orange },
  unpaidLeft:       { flex: 1, marginRight: 10 },
  unpaidClient:     { fontSize: 14, fontWeight: '700', color: D.text, marginBottom: 3 },
  unpaidSub:        { fontSize: 11, color: D.textMuted },
  unpaidAmount:     { fontSize: 15, fontWeight: '900', color: D.green, marginRight: 10 },
  payBtn:           { backgroundColor: D.gold, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, minWidth: 64, alignItems: 'center' },
  payBtnText:       { fontSize: 12, fontWeight: '800', color: D.bg },
  staffChip:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8,
                      borderRadius: 20, borderWidth: 1, borderColor: D.border, backgroundColor: D.surface, marginRight: 8 },
  staffChipText:    { fontSize: 12, fontWeight: '600' },
  staffDot:         { width: 7, height: 7, borderRadius: 4 },
  apptCard:         { backgroundColor: D.surface, borderRadius: 14, flexDirection: 'row', alignItems: 'center',
                      overflow: 'hidden', borderWidth: 1, borderColor: D.border, borderLeftWidth: 3 },
  apptTimeCol:      { paddingHorizontal: 14, paddingVertical: 16, minWidth: 60, alignItems: 'center', gap: 4 },
  apptTime:         { fontSize: 13, fontWeight: '800', color: D.text },
  apptStaffDot:     { width: 5, height: 5, borderRadius: 3 },
  apptBody:         { flex: 1, paddingVertical: 14 },
  apptClient:       { fontSize: 14, fontWeight: '700', color: D.text },
  apptService:      { fontSize: 11, color: D.textMuted, marginTop: 2 },
  apptBadge:        { marginRight: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  apptBadgeText:    { fontSize: 10, fontWeight: '700' },
  emptyCard:        { borderRadius: 18, padding: 32, alignItems: 'center', backgroundColor: D.surface,
                      borderWidth: 1, borderColor: D.border, gap: 8, marginBottom: 20 },
  emptyTitle:       { fontSize: 16, fontWeight: '700', color: D.text },
  emptyDesc:        { fontSize: 13, color: D.textMuted, textAlign: 'center' },
  emptyBtn:         { flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: D.gold, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12, marginTop: 8 },
  emptyBtnText:     { color: D.bg, fontWeight: '800', fontSize: 14 },
  actionsGrid:      { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
  waBanner:         { borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
                      backgroundColor: D.surface, borderWidth: 1, borderColor: '#166834' + '66' },
  waIconBox:        { width: 40, height: 40, borderRadius: 12, backgroundColor: '#052E16', justifyContent: 'center', alignItems: 'center' },
  waTitle:          { fontSize: 14, fontWeight: '700', color: D.text, marginBottom: 2 },
  waDesc:           { fontSize: 11, color: D.textMuted },
});
