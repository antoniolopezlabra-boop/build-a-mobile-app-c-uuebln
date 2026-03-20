import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { usePlan } from '@/contexts/PlanContext';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '@/styles/commonStyles';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '@/contexts/AuthContext';
import { apiGet } from '@/utils/api';
import { getCached, setCached, CACHE_TTL } from '@/utils/cache';
import { getStatusColor } from '@/utils/appointmentUtils';

interface DashboardStats {
  todayAppointments: number;
  confirmedToday: number;
  unconfirmedToday: number;
  weekAppointments: number;
  confirmedWeek: number;
  unconfirmedWeek: number;
  totalClients: number;
  totalAppointments: number;
}

interface TodayAppointment {
  id: string;
  time: string;
  service: string;
  status: string;
  client: { id: string; name: string; phone: string };
}

interface WhatsAppConfig {
  isConnected: boolean;
  phoneNumber?: string;
}

// ─── Stat card compacta ────────────────────────────────────────────────────
function StatCard({ value, label, accent }: {
  value: number; label: string; accent: string;
}) {
  return (
    <View style={[sc.card, { borderTopColor: accent, borderTopWidth: 2 }]}>
      <Text style={[sc.value, { color: accent }]}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  value: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, lineHeight: 32 },
  label: { fontSize: 11, color: '#64748B', marginTop: 4, fontWeight: '500' },
});

// ─── Acción rápida ─────────────────────────────────────────────────────────
function QuickAction({ icon, label, onPress, accent = '#10B981' }: {
  icon: string; label: string; onPress: () => void; accent?: string;
}) {
  return (
    <TouchableOpacity style={qa.btn} onPress={onPress} activeOpacity={0.7}>
      <View style={[qa.iconWrap, { backgroundColor: accent + '18' }]}>
        <MaterialIcons name={icon as any} size={24} color={accent} />
      </View>
      <Text style={qa.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const qa = StyleSheet.create({
  btn: {
    width: '48%',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: { fontSize: 13, fontWeight: '600', color: '#F8FAFC', flex: 1 },
});

// ─── Pantalla principal ────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const { user, businessProfile, loading: authLoading } = useAuth();
  const { canSchedule, isGratuito, isBasico, isPremium } = usePlan();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    todayAppointments: 0, confirmedToday: 0, unconfirmedToday: 0,
    weekAppointments: 0, confirmedWeek: 0, unconfirmedWeek: 0,
    totalClients: 0, totalAppointments: 0,
  });
  const [todayAppointments, setTodayAppointments] = useState<TodayAppointment[]>([]);
  const [weekAppointments, setWeekAppointments] = useState<TodayAppointment[]>([]);
  const [waConnected, setWaConnected] = useState(false);
  const loadingRef = useRef(false);

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
        if (cachedWa) setWaConnected(cachedWa.isConnected || false);
        setLoading(false);
        return;
      }

      if (isPullRefresh) setRefreshing(true); else setLoading(true);

      const results = await Promise.allSettled([
        apiGet<DashboardStats>('/api/stats/dashboard'),
        apiGet<TodayAppointment[]>('/api/appointments/today'),
        apiGet<TodayAppointment[]>('/api/appointments/week'),
        apiGet<WhatsAppConfig>('/api/whatsapp-config'),
      ]);

      if (results[0].status === 'fulfilled') {
        setStats(results[0].value);
        setCached('dashboard_stats', results[0].value, CACHE_TTL.DASHBOARD);
      }
      if (results[1].status === 'fulfilled') {
        setTodayAppointments(results[1].value);
        setCached('today_appointments', results[1].value, CACHE_TTL.APPOINTMENTS);
      }
      if (results[2].status === 'fulfilled') {
        setWeekAppointments(results[2].value);
        setCached('week_appointments', results[2].value, CACHE_TTL.APPOINTMENTS);
      }
      if (results[3].status === 'fulfilled') {
        const wa = results[3].value;
        setWaConnected(wa?.isConnected || false);
        setCached('settings_whatsapp', wa, CACHE_TTL.SETTINGS);
      }
    } catch {
      // silencioso
    } finally {
      setLoading(false);
      setRefreshing(false);
      loadingRef.current = false;
    }
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

  const initials = user?.name?.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || 'U';
  const firstName = authLoading ? '' : (user?.name?.split(' ')[0] || 'Usuario');

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
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
            <Text style={s.greeting}>{getGreeting()}</Text>
            <Text style={s.userName}>{firstName} 👋</Text>
            <View style={s.datePill}>
              <MaterialIcons name="today" size={12} color="#475569" />
              <Text style={s.dateText}>{getTodayDate()}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => router.push('/settings/profile')} activeOpacity={0.8}>
            {businessProfile?.logoUrl ? (
              <Image source={{ uri: businessProfile.logoUrl }} style={s.avatar} />
            ) : (
              <View style={s.avatarFallback}>
                <Text style={s.avatarText}>{initials}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Upgrade banner (plan gratuito) ── */}
        {isGratuito && (
          <TouchableOpacity style={s.upgradeCard} onPress={() => router.push('/settings/subscription')} activeOpacity={0.85}>
            <View style={s.upgradeLeft}>
              <Text style={s.upgradeTitle}>Activa tu plan</Text>
              <Text style={s.upgradeDesc}>Agenda citas y automatiza recordatorios por WhatsApp</Text>
            </View>
            <View style={s.upgradeArrow}>
              <MaterialIcons name="arrow-forward" size={18} color="#fff" />
            </View>
          </TouchableOpacity>
        )}

        {/* ── Stats de hoy ── */}
        {!isGratuito && (
          <>
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>Hoy</Text>
              <Text style={s.sectionDate}>{new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</Text>
            </View>
            <View style={s.statsRow}>
              <StatCard value={stats.todayAppointments} label="Total" accent="#10B981" />
              <StatCard value={stats.confirmedToday} label="Confirmadas" accent="#3B82F6" />
              <StatCard value={stats.unconfirmedToday} label="Pendientes" accent="#F59E0B" />
            </View>

            {/* ── Stats de la semana ── */}
            <View style={[s.sectionRow, { marginTop: 8 }]}>
              <Text style={s.sectionTitle}>Esta semana</Text>
            </View>
            <View style={s.statsRow}>
              <StatCard value={stats.weekAppointments} label="Total" accent="#8B5CF6" />
              <StatCard value={stats.confirmedWeek} label="Confirmadas" accent="#3B82F6" />
              <StatCard value={stats.unconfirmedWeek} label="Pendientes" accent="#F59E0B" />
            </View>
          </>
        )}

        {/* ── Citas de hoy ── */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Citas de hoy</Text>
          {todayAppointments.length > 0 && (
            <TouchableOpacity onPress={() => router.push('/(tabs)/appointments')}>
              <Text style={s.seeAll}>Ver todas</Text>
            </TouchableOpacity>
          )}
        </View>

        {todayAppointments.length === 0 ? (
          <View style={s.emptyCard}>
            <View style={s.emptyIconWrap}>
              <MaterialIcons name="event-available" size={28} color="#334155" />
            </View>
            <Text style={s.emptyTitle}>Agenda libre hoy</Text>
            <Text style={s.emptyDesc}>No tienes citas programadas para hoy</Text>
            {canSchedule && (
              <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/appointments/new')}>
                <MaterialIcons name="add" size={16} color="#fff" />
                <Text style={s.emptyBtnText}>Crear cita</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={s.apptList}>
            {todayAppointments.map((appt) => {
              const statusColor = getStatusColor(appt.status);
              return (
                <TouchableOpacity
                  key={appt.id}
                  style={s.apptCard}
                  onPress={() => router.push(`/appointments/${appt.id}`)}
                  activeOpacity={0.75}
                >
                  <View style={[s.apptAccent, { backgroundColor: statusColor }]} />
                  <View style={s.apptTimeWrap}>
                    <Text style={s.apptTime}>{appt.time}</Text>
                  </View>
                  <View style={s.apptBody}>
                    <Text style={s.apptClient} numberOfLines={1}>{appt.client?.name}</Text>
                    <Text style={s.apptService} numberOfLines={1}>{appt.service}</Text>
                  </View>
                  <View style={[s.apptBadge, { backgroundColor: statusColor + '22' }]}>
                    <Text style={[s.apptBadgeText, { color: statusColor }]}>{appt.status}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={18} color="#334155" />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Acciones rápidas ── */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Acciones rápidas</Text>
        </View>
        <View style={s.actionsGrid}>
          <QuickAction
            icon="add-circle-outline"
            label="Nueva cita"
            accent="#10B981"
            onPress={() => router.push('/appointments/new')}
          />
          <QuickAction
            icon="person-add-alt"
            label="Nuevo cliente"
            accent="#3B82F6"
            onPress={() => router.push('/clients/new')}
          />
          <QuickAction
            icon="calendar-month"
            label="Ver agenda"
            accent="#8B5CF6"
            onPress={() => router.push('/(tabs)/appointments')}
          />
          <QuickAction
            icon="person-search"
            label="Clientes inactivos"
            accent="#F59E0B"
            onPress={() => router.push('/clients/inactive')}
          />
        </View>

        {/* ── Banner WhatsApp ── */}
        {(isBasico || isPremium) && !waConnected && (
          <TouchableOpacity style={s.waBanner} onPress={() => router.push('/settings/whatsapp')} activeOpacity={0.8}>
            <View style={s.waIconBox}>
              <MaterialIcons name="chat" size={20} color="#25D366" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.waTitle}>Conecta WhatsApp</Text>
              <Text style={s.waDesc}>Activa recordatorios automáticos para tus clientes</Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={14} color="#25D366" />
          </TouchableOpacity>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#0F172A' },
  loadingWrap:   { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:        { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 110 },

  // Header
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  greeting:      { fontSize: 13, color: '#475569', fontWeight: '500', marginBottom: 2 },
  userName:      { fontSize: 26, fontWeight: '800', color: '#F8FAFC', letterSpacing: -0.5, marginBottom: 8 },
  datePill:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1E293B', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: '#334155' },
  dateText:      { fontSize: 12, color: '#64748B', fontWeight: '500' },
  avatar:        { width: 52, height: 52, borderRadius: 16, borderWidth: 2, borderColor: '#334155' },
  avatarFallback:{ width: 52, height: 52, borderRadius: 16, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
  avatarText:    { fontSize: 20, fontWeight: '800', color: '#fff' },

  // Upgrade
  upgradeCard:   { backgroundColor: '#10B981', borderRadius: 18, padding: 18, flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
  upgradeLeft:   { flex: 1 },
  upgradeTitle:  { fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 3 },
  upgradeDesc:   { fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 18 },
  upgradeArrow:  { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },

  // Sections
  sectionRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 4 },
  sectionTitle:  { fontSize: 16, fontWeight: '700', color: '#F8FAFC' },
  sectionDate:   { fontSize: 12, color: '#475569', fontWeight: '500' },
  seeAll:        { fontSize: 13, color: '#10B981', fontWeight: '600' },

  // Stats
  statsRow:      { flexDirection: 'row', marginBottom: 16, marginHorizontal: -4 },

  // Empty state
  emptyCard:     { backgroundColor: '#1E293B', borderRadius: 18, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: '#334155', marginBottom: 20 },
  emptyIconWrap: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  emptyTitle:    { fontSize: 16, fontWeight: '700', color: '#F8FAFC', marginBottom: 4 },
  emptyDesc:     { fontSize: 13, color: '#475569', marginBottom: 18, textAlign: 'center' },
  emptyBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#10B981', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12 },
  emptyBtnText:  { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Appointments
  apptList:      { gap: 8, marginBottom: 20 },
  apptCard:      { backgroundColor: '#1E293B', borderRadius: 14, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: '#334155' },
  apptAccent:    { width: 3, alignSelf: 'stretch' },
  apptTimeWrap:  { paddingHorizontal: 14, paddingVertical: 16, minWidth: 64, alignItems: 'center' },
  apptTime:      { fontSize: 14, fontWeight: '700', color: '#F8FAFC' },
  apptBody:      { flex: 1, paddingVertical: 14 },
  apptClient:    { fontSize: 15, fontWeight: '600', color: '#F8FAFC' },
  apptService:   { fontSize: 12, color: '#64748B', marginTop: 2 },
  apptBadge:     { marginRight: 8, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  apptBadgeText: { fontSize: 11, fontWeight: '700' },

  // Quick actions
  actionsGrid:   { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },

  // WhatsApp banner
  waBanner:      { backgroundColor: '#1E293B', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#166534' },
  waIconBox:     { width: 40, height: 40, borderRadius: 12, backgroundColor: '#052E16', justifyContent: 'center', alignItems: 'center' },
  waTitle:       { fontSize: 14, fontWeight: '600', color: '#F8FAFC', marginBottom: 2 },
  waDesc:        { fontSize: 12, color: '#475569' },
});
