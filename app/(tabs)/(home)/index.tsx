import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { usePlan } from '@/contexts/PlanContext';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '@/styles/commonStyles';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { apiGet } from '@/utils/api';
import { getCached, setCached, CACHE_TTL } from '@/utils/cache';
import { getStatusColor } from '@/utils/appointmentUtils';
import { supabase } from '@/lib/supabase';

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

interface StaffMember {
  id: string; name: string; color: string;
}

// Citas completadas sin pagar — para la sección de adeudos
interface UnpaidAppointment {
  id: string;
  date: string;
  start_time: string;
  service_name: string;
  service_cost: number | null;
  client: { name: string } | null;
  client_name_temp: string | null;
  staff: { name: string; color: string } | null;
}

interface WhatsAppConfig { isConnected: boolean; phoneNumber?: string; }

// ─── Stat card ────────────────────────────────────────────────────────────
function StatCard({ value, label, accent, surface, border }: {
  value: number; label: string; accent: string; surface: string; border: string;
}) {
  return (
    <View style={[sc.card, { backgroundColor: surface, borderColor: border, borderTopColor: accent }]}>
      <Text style={[sc.value, { color: accent }]}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}
const sc = StyleSheet.create({
  card:  { flex: 1, borderRadius: 14, padding: 14, marginHorizontal: 4, borderWidth: 1, borderTopWidth: 2 },
  value: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, lineHeight: 32 },
  label: { fontSize: 11, color: '#94A3B8', marginTop: 4, fontWeight: '500' },
});

// ─── Acción rápida ─────────────────────────────────────────────────────────
function QuickAction({ icon, label, onPress, accent='#10B981', surface, border, textColor }: {
  icon: string; label: string; onPress: () => void; accent?: string;
  surface: string; border: string; textColor: string;
}) {
  return (
    <TouchableOpacity style={[qa.btn, { backgroundColor: surface, borderColor: border }]} onPress={onPress} activeOpacity={0.7}>
      <View style={[qa.iconWrap, { backgroundColor: accent+'18' }]}>
        <MaterialIcons name={icon as any} size={24} color={accent} />
      </View>
      <Text style={[qa.label, { color: textColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}
const qa = StyleSheet.create({
  btn:      { width: '48%', borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  label:    { fontSize: 13, fontWeight: '600', flex: 1 },
});

// ─── Pantalla principal ────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const { user, businessProfile, loading: authLoading } = useAuth();
  const { canSchedule, isGratuito, isBasico, isPremium } = usePlan();
  const { colors: tc, isDark } = useTheme();

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

  // Staff filter
  const [staffMembers,    setStaffMembers]   = useState<StaffMember[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

  // Adeudos — citas completadas sin pagar
  const [unpaidAppointments, setUnpaidAppointments] = useState<UnpaidAppointment[]>([]);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

  const loadingRef = useRef(false);

  // ── Realtime: escuchar cuando el staff marca paid=true ─────────────────
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('dashboard-paid-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'appointments',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as any;
          // Si el pago se marcó como true, quitarlo de la lista de adeudos
          if (updated.paid === true) {
            setUnpaidAppointments(prev => prev.filter(a => a.id !== updated.id));
          }
          // Si por alguna razón se desmarcó (edge case), agregarlo de vuelta
          // no aplica por ahora — solo escuchamos el caso happy path
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useFocusEffect(
    React.useCallback(() => {
      if (!loadingRef.current) loadDashboardData();
    }, [user?.id])
  );

  const loadDashboardData = async (forceRefresh = false, isPullRefresh = false) => {
    if (loadingRef.current && !forceRefresh) return;
    loadingRef.current = true;
    try {
      const userId = user?.id;
      if (!userId) return;

      const cachedStats = getCached<DashboardStats>('dashboard_stats');
      const cachedApts  = getCached<TodayAppointment[]>('today_appointments');
      const cachedWeek  = getCached<TodayAppointment[]>('week_appointments');
      const cachedWa    = getCached<WhatsAppConfig>('settings_whatsapp');

      if (!forceRefresh && cachedStats && cachedApts) {
        setStats(cachedStats);
        setTodayAppointments(cachedApts);
        if (cachedWeek) setWeekAppointments(cachedWeek);
        if (cachedWa)   setWaConnected(cachedWa.isConnected || false);
        setLoading(false);
        loadStaffMembers(userId);
        loadUnpaidAppointments(userId);
        return;
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

      await Promise.all([
        loadStaffMembers(userId),
        loadUnpaidAppointments(userId),
      ]);
    } catch {} finally {
      setLoading(false); setRefreshing(false); loadingRef.current = false;
    }
  };

  const loadStaffMembers = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('staff_members')
        .select('id, name, color')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('sort_order');
      setStaffMembers(data || []);
    } catch {}
  };

  // ── Cargar citas completadas sin pagar ─────────────────────────────────
  const loadUnpaidAppointments = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, date, start_time, service_name, service_cost, client_name_temp, client:clients(name), staff:staff_members(name, color)')
        .eq('user_id', userId)
        .eq('status', 'Completada')
        .or('paid.is.null,paid.eq.false')
        .order('date', { ascending: false })
        .limit(20);
      if (error) throw error;
      setUnpaidAppointments((data ?? []) as unknown as UnpaidAppointment[]);
    } catch (e) {
      console.warn('[Dashboard] loadUnpaidAppointments error:', e);
    }
  };

  // ── Marcar como pagada desde el dashboard del dueño ────────────────────
  const markAsPaid = async (apptId: string) => {
    setMarkingPaidId(apptId);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ paid: true, updated_at: new Date().toISOString() })
        .eq('id', apptId);
      if (error) throw error;
      // Quitar optimistamente (Realtime también lo quitará si llega el evento)
      setUnpaidAppointments(prev => prev.filter(a => a.id !== apptId));
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo registrar el pago');
    } finally {
      setMarkingPaidId(null);
    }
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
      <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]}>
        <View style={s.loadingWrap}><ActivityIndicator size="large" color={colors.primary} /></View>
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
            onRefresh={() => loadDashboardData(true, true)}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={[s.greeting, { color: tc.textMuted }]}>{getGreeting()}</Text>
            <Text style={[s.userName, { color: tc.text }]}>{firstName}</Text>
            <View style={[s.datePill, { backgroundColor: tc.surface, borderColor: tc.border }]}>
              <MaterialIcons name="today" size={12} color={tc.textMuted} />
              <Text style={[s.dateText, { color: tc.textMuted }]}>{getTodayDate()}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => router.push('/settings/profile')} activeOpacity={0.85} style={s.avatarBtn}>
            {businessProfile?.logoUrl ? (
              <Image source={{ uri: businessProfile.logoUrl }} style={[s.avatar, { borderColor: tc.border }]} />
            ) : (
              <View style={s.avatarFallback}><Text style={s.avatarText}>{initials}</Text></View>
            )}
            <View style={[s.avatarBadge, { borderColor: tc.bg }]}>
              <MaterialIcons name="edit" size={10} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Upgrade banner ── */}
        {isGratuito && (
          <TouchableOpacity style={s.upgradeCard} onPress={() => router.push('/settings/subscription')} activeOpacity={0.85}>
            <View style={s.upgradeLeft}>
              <Text style={s.upgradeTitle}>Activa tu plan</Text>
              <Text style={s.upgradeDesc}>Agenda citas y automatiza recordatorios por WhatsApp</Text>
            </View>
            <View style={s.upgradeArrow}><MaterialIcons name="arrow-forward" size={18} color="#fff" /></View>
          </TouchableOpacity>
        )}

        {/* ── Stats ── */}
        {!isGratuito && (
          <>
            <View style={s.sectionRow}>
              <Text style={[s.sectionTitle, { color: tc.text }]}>Hoy</Text>
              <Text style={[s.sectionSub, { color: tc.textMuted }]}>
                {new Date().toLocaleDateString('es-MX', { day:'numeric', month:'short' })}
              </Text>
            </View>
            <View style={s.statsRow}>
              <StatCard value={stats.todayAppointments} label="Total"       accent="#10B981" surface={tc.surface} border={tc.border} />
              <StatCard value={stats.confirmedToday}    label="Confirmadas" accent="#3B82F6" surface={tc.surface} border={tc.border} />
              <StatCard value={stats.unconfirmedToday}  label="Pendientes"  accent="#F59E0B" surface={tc.surface} border={tc.border} />
            </View>
            <View style={[s.sectionRow, { marginTop: 8 }]}>
              <Text style={[s.sectionTitle, { color: tc.text }]}>Esta semana</Text>
            </View>
            <View style={s.statsRow}>
              <StatCard value={stats.weekAppointments} label="Total"       accent="#8B5CF6" surface={tc.surface} border={tc.border} />
              <StatCard value={stats.confirmedWeek}    label="Confirmadas" accent="#3B82F6" surface={tc.surface} border={tc.border} />
              <StatCard value={stats.unconfirmedWeek}  label="Pendientes"  accent="#F59E0B" surface={tc.surface} border={tc.border} />
            </View>
          </>
        )}

        {/* ── ADEUDOS: citas completadas sin pagar ── */}
        {unpaidAppointments.length > 0 && (
          <>
            <View style={[s.sectionRow, { marginTop: 4 }]}>
              <View style={s.adeudoTitleRow}>
                <MaterialIcons name="payments" size={16} color="#F97316" />
                <Text style={[s.sectionTitle, { color: tc.text }]}>Cobros pendientes</Text>
                <View style={s.adeudoBadge}>
                  <Text style={s.adeudoBadgeText}>{unpaidAppointments.length}</Text>
                </View>
              </View>
            </View>

            {unpaidAppointments.map(appt => {
              const clientName = appt.client?.name ?? appt.client_name_temp ?? 'Cliente';
              const staffName  = (appt.staff as any)?.name ?? null;
              const isPaying   = markingPaidId === appt.id;
              const dateLabel  = new Date(appt.date + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

              return (
                <View
                  key={appt.id}
                  style={[s.unpaidCard, { backgroundColor: tc.surface, borderColor: '#FED7AA' }]}
                >
                  <View style={[s.unpaidAccent, { backgroundColor: '#F97316' }]} />

                  <View style={s.unpaidBody}>
                    <View style={s.unpaidTopRow}>
                      <Text style={[s.unpaidClient, { color: tc.text }]} numberOfLines={1}>
                        {clientName}
                      </Text>
                      {appt.service_cost != null && appt.service_cost > 0 && (
                        <Text style={s.unpaidAmount}>
                          ${appt.service_cost.toLocaleString('es-MX')}
                        </Text>
                      )}
                    </View>
                    <Text style={[s.unpaidSub, { color: tc.textMuted }]} numberOfLines={1}>
                      {appt.service_name}
                      {staffName ? `  ·  ${staffName}` : ''}
                      {'  ·  '}{dateLabel}  {appt.start_time.slice(0,5)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[s.payBtn, isPaying && { opacity: 0.6 }]}
                    onPress={() => Alert.alert(
                      'Registrar pago',
                      `¿Confirmar pago de ${clientName}${appt.service_cost ? ` — $${appt.service_cost.toLocaleString('es-MX')} MXN` : ''}?`,
                      [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Confirmar', onPress: () => markAsPaid(appt.id) },
                      ]
                    )}
                    disabled={isPaying}
                    activeOpacity={0.75}
                  >
                    {isPaying
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={s.payBtnText}>Cobrado</Text>
                    }
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}

        {/* ── Filtro por colaborador ── */}
        {staffMembers.length > 0 && (
          <>
            <View style={s.sectionRow}>
              <Text style={[s.sectionTitle, { color: tc.text }]}>Ver agenda de</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.staffFilterRow}>
              <TouchableOpacity
                style={[s.staffChip, !selectedStaffId && s.staffChipActive, { backgroundColor: !selectedStaffId ? '#10B981' : tc.surface, borderColor: !selectedStaffId ? '#10B981' : tc.border }]}
                onPress={() => setSelectedStaffId(null)}
              >
                <MaterialIcons name="group" size={14} color={!selectedStaffId ? '#fff' : tc.textMuted} />
                <Text style={[s.staffChipText, { color: !selectedStaffId ? '#fff' : tc.textMuted }]}>Todos</Text>
              </TouchableOpacity>
              {staffMembers.map(m => (
                <TouchableOpacity
                  key={m.id}
                  style={[s.staffChip, selectedStaffId===m.id && s.staffChipActive, { backgroundColor: selectedStaffId===m.id ? m.color : tc.surface, borderColor: selectedStaffId===m.id ? m.color : tc.border }]}
                  onPress={() => setSelectedStaffId(selectedStaffId===m.id ? null : m.id)}
                >
                  <View style={[s.staffChipDot, { backgroundColor: selectedStaffId===m.id ? '#fff' : m.color }]} />
                  <Text style={[s.staffChipText, { color: selectedStaffId===m.id ? '#fff' : tc.text }]}>{m.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* ── Citas de hoy ── */}
        <View style={s.sectionRow}>
          <Text style={[s.sectionTitle, { color: tc.text }]}>
            {selectedStaffId
              ? `Citas de ${staffMembers.find(m=>m.id===selectedStaffId)?.name}`
              : 'Citas de hoy'
            }
          </Text>
          {filteredToday.length > 0 && (
            <TouchableOpacity onPress={() => router.push('/(tabs)/appointments')}>
              <Text style={s.seeAll}>Ver todas</Text>
            </TouchableOpacity>
          )}
        </View>

        {filteredToday.length === 0 ? (
          <View style={[s.emptyCard, { backgroundColor: tc.surface, borderColor: tc.border }]}>
            <View style={[s.emptyIconWrap, { backgroundColor: tc.bg }]}>
              <MaterialIcons name="event-available" size={28} color={tc.border} />
            </View>
            <Text style={[s.emptyTitle, { color: tc.text }]}>Agenda libre hoy</Text>
            <Text style={[s.emptyDesc, { color: tc.textMuted }]}>
              {selectedStaffId ? 'Sin citas asignadas a este colaborador' : 'No tienes citas programadas'}
            </Text>
            {canSchedule && (
              <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/appointments/new')}>
                <MaterialIcons name="add" size={16} color="#fff" />
                <Text style={s.emptyBtnText}>Crear cita</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={[s.apptList, { gap: 8, marginBottom: 20 }]}>
            {filteredToday.map((appt) => {
              const statusColor = getStatusColor(appt.status);
              const displayName = appt.client?.name || appt.clientNameTemp || 'Cliente';
              const staffMember = appt.staff_id ? staffMembers.find(m => m.id === appt.staff_id) : null;
              return (
                <TouchableOpacity
                  key={appt.id}
                  style={[s.apptCard, { backgroundColor: tc.surface, borderColor: tc.border }]}
                  onPress={() => router.push(`/appointments/${appt.id}`)}
                  activeOpacity={0.75}
                >
                  <View style={[s.apptAccent, { backgroundColor: staffMember ? staffMember.color : statusColor }]} />
                  <View style={s.apptTimeWrap}>
                    <Text style={[s.apptTime, { color: tc.text }]}>{appt.time}</Text>
                    {staffMember && (
                      <View style={[s.apptStaffDot, { backgroundColor: staffMember.color }]} />
                    )}
                  </View>
                  <View style={s.apptBody}>
                    <Text style={[s.apptClient, { color: tc.text }]} numberOfLines={1}>{displayName}</Text>
                    <Text style={[s.apptService, { color: tc.textMuted }]} numberOfLines={1}>
                      {appt.service}{staffMember ? ` · ${staffMember.name}` : ''}
                    </Text>
                  </View>
                  <View style={[s.apptBadge, { backgroundColor: statusColor+'22' }]}>
                    <Text style={[s.apptBadgeText, { color: statusColor }]}>{appt.status}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={18} color={tc.border} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Acciones rápidas ── */}
        <View style={s.sectionRow}>
          <Text style={[s.sectionTitle, { color: tc.text }]}>Acciones rápidas</Text>
        </View>
        <View style={s.actionsGrid}>
          <QuickAction icon="add-circle-outline" label="Nueva cita"        accent="#10B981" surface={tc.surface} border={tc.border} textColor={tc.text} onPress={() => router.push('/appointments/new')} />
          <QuickAction icon="person-add-alt"     label="Nuevo cliente"     accent="#3B82F6" surface={tc.surface} border={tc.border} textColor={tc.text} onPress={() => router.push('/clients/new')} />
          <QuickAction icon="calendar-month"     label="Ver agenda"        accent="#8B5CF6" surface={tc.surface} border={tc.border} textColor={tc.text} onPress={() => router.push('/(tabs)/appointments')} />
          <QuickAction icon="person-search"      label="Clientes inactivos" accent="#F59E0B" surface={tc.surface} border={tc.border} textColor={tc.text} onPress={() => router.push('/clients/inactive')} />
        </View>

        {/* ── Banner WhatsApp ── */}
        {(isBasico || isPremium) && !waConnected && (
          <TouchableOpacity style={[s.waBanner, { backgroundColor: tc.surface, borderColor: '#166834' }]} onPress={() => router.push('/settings/whatsapp')} activeOpacity={0.8}>
            <View style={s.waIconBox}><MaterialIcons name="chat" size={20} color="#25D366" /></View>
            <View style={{ flex: 1 }}>
              <Text style={[s.waTitle, { color: tc.text }]}>Conecta WhatsApp</Text>
              <Text style={[s.waDesc, { color: tc.textMuted }]}>Activa recordatorios automáticos para tus clientes</Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={14} color="#25D366" />
          </TouchableOpacity>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1 },
  loadingWrap:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:         { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 110 },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  greeting:       { fontSize: 13, fontWeight: '500', marginBottom: 2 },
  userName:       { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 10 },
  datePill:       { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  dateText:       { fontSize: 12, fontWeight: '500' },
  avatarBtn:      { position: 'relative' },
  avatar:         { width: 68, height: 68, borderRadius: 20, borderWidth: 2 },
  avatarFallback: { width: 68, height: 68, borderRadius: 20, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
  avatarText:     { fontSize: 24, fontWeight: '800', color: '#fff' },
  avatarBadge:    { position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: '#10B981', borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  upgradeCard:    { backgroundColor: '#10B981', borderRadius: 18, padding: 18, flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
  upgradeLeft:    { flex: 1 },
  upgradeTitle:   { fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 3 },
  upgradeDesc:    { fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 18 },
  upgradeArrow:   { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  sectionRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 4 },
  sectionTitle:   { fontSize: 16, fontWeight: '700' },
  sectionSub:     { fontSize: 12, fontWeight: '500' },
  seeAll:         { fontSize: 13, color: '#10B981', fontWeight: '600' },
  statsRow:       { flexDirection: 'row', marginBottom: 16, marginHorizontal: -4 },
  // ── Adeudos ──
  adeudoTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  adeudoBadge:    { backgroundColor: '#FED7AA', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  adeudoBadgeText:{ fontSize: 11, fontWeight: '800', color: '#C2410C' },
  unpaidCard:     { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, marginBottom: 8, overflow: 'hidden', minHeight: 64 },
  unpaidAccent:   { width: 3, alignSelf: 'stretch' },
  unpaidBody:     { flex: 1, paddingHorizontal: 12, paddingVertical: 12 },
  unpaidTopRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  unpaidClient:   { fontSize: 15, fontWeight: '600', flex: 1 },
  unpaidAmount:   { fontSize: 14, fontWeight: '800', color: '#16A34A' },
  unpaidSub:      { fontSize: 11, marginTop: 2 },
  payBtn:         { backgroundColor: '#10B981', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginRight: 10, minWidth: 72, alignItems: 'center' },
  payBtnText:     { fontSize: 13, fontWeight: '700', color: '#fff' },
  // Staff filter
  staffFilterRow: { marginBottom: 16 },
  staffChip:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  staffChipActive:{},
  staffChipDot:   { width: 8, height: 8, borderRadius: 4 },
  staffChipText:  { fontSize: 13, fontWeight: '600' },
  // Citas hoy
  emptyCard:      { borderRadius: 18, padding: 28, alignItems: 'center', borderWidth: 1, marginBottom: 20 },
  emptyIconWrap:  { width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  emptyTitle:     { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  emptyDesc:      { fontSize: 13, marginBottom: 18, textAlign: 'center' },
  emptyBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#10B981', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12 },
  emptyBtnText:   { color: '#fff', fontWeight: '700', fontSize: 14 },
  apptList:       {},
  apptCard:       { borderRadius: 14, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderWidth: 1 },
  apptAccent:     { width: 3, alignSelf: 'stretch' },
  apptTimeWrap:   { paddingHorizontal: 14, paddingVertical: 16, minWidth: 64, alignItems: 'center', gap: 4 },
  apptTime:       { fontSize: 14, fontWeight: '700' },
  apptStaffDot:   { width: 6, height: 6, borderRadius: 3 },
  apptBody:       { flex: 1, paddingVertical: 14 },
  apptClient:     { fontSize: 15, fontWeight: '600' },
  apptService:    { fontSize: 12, marginTop: 2 },
  apptBadge:      { marginRight: 8, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  apptBadgeText:  { fontSize: 11, fontWeight: '700' },
  actionsGrid:    { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
  waBanner:       { borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1 },
  waIconBox:      { width: 40, height: 40, borderRadius: 12, backgroundColor: '#052E16', justifyContent: 'center', alignItems: 'center' },
  waTitle:        { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  waDesc:         { fontSize: 12 },
});
