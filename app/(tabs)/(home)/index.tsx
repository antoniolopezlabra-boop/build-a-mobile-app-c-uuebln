import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { usePlan } from '@/contexts/PlanContext';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '@/styles/commonStyles';
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useAuth } from '@/contexts/AuthContext';
import { apiGet } from '@/utils/api';
import { getCached, setCached } from '@/utils/cache';

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

// Stat card con icono en caja de color
function StatCard({ icon, value, label, iconColor, iconBg }: {
  icon: string; value: number; label: string; iconColor: string; iconBg: string;
}) {
  return (
    <View style={sc.card}>
      <View style={[sc.iconBox, { backgroundColor: iconBg }]}>
        <MaterialIcons name={icon as any} size={20} color={iconColor} />
      </View>
      <Text style={sc.value}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14,
    alignItems: 'center', marginHorizontal: 4,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  iconBox: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  value: { fontSize: 26, fontWeight: '800', color: '#0F172A', lineHeight: 30 },
  label: { fontSize: 11, color: '#94A3B8', marginTop: 4, textAlign: 'center', fontWeight: '500' },
});

// Acción rápida
function ActionBtn({ icon, label, onPress, primary }: {
  icon: string; label: string; onPress: () => void; primary?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[ab.btn, primary && ab.btnPrimary]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[ab.iconBox, primary && ab.iconBoxPrimary]}>
        <MaterialIcons name={icon as any} size={22} color={primary ? '#fff' : '#10B981'} />
      </View>
      <Text style={[ab.label, primary && ab.labelPrimary]}>{label}</Text>
    </TouchableOpacity>
  );
}

const ab = StyleSheet.create({
  btn: {
    width: '48%', backgroundColor: '#fff', borderRadius: 16, padding: 16,
    alignItems: 'center', marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  btnPrimary: { backgroundColor: '#10B981' },
  iconBox: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  iconBoxPrimary: { backgroundColor: 'rgba(255,255,255,0.2)' },
  label: { fontSize: 13, fontWeight: '600', color: '#0F172A', textAlign: 'center' },
  labelPrimary: { color: '#fff' },
});

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

  useFocusEffect(
    React.useCallback(() => { loadDashboardData(); }, [user?.id])
  );

  const loadDashboardData = async (forceRefresh = false, isPullRefresh = false) => {
    try {
      const cachedStats = getCached<DashboardStats>('dashboard_stats');
      const cachedApts = getCached<TodayAppointment[]>('today_appointments');
      const cachedWeek = getCached<TodayAppointment[]>('week_appointments');
      if (!forceRefresh && cachedStats && cachedApts) {
        setStats(cachedStats);
        setTodayAppointments(cachedApts);
        if (cachedWeek) setWeekAppointments(cachedWeek);
        setLoading(false);
        return;
      }
      if (isPullRefresh) setRefreshing(true); else setLoading(true);
      const results = await Promise.allSettled([
        apiGet<DashboardStats>('/api/stats/dashboard'),
        apiGet<TodayAppointment[]>('/api/appointments/today'),
        apiGet<TodayAppointment[]>('/api/appointments/week'),
      ]);
      if (results[0].status === 'fulfilled') { setStats(results[0].value); setCached('dashboard_stats', results[0].value); }
      if (results[1].status === 'fulfilled') { setTodayAppointments(results[1].value); setCached('today_appointments', results[1].value); }
      if (results[2].status === 'fulfilled') { setWeekAppointments(results[2].value); setCached('week_appointments', results[2].value); }
    } catch (error) {
      console.error('[Home] Error loading dashboard:', error);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const getTodayDate = () => {
    const today = new Date();
    const opts: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };
    const f = today.toLocaleDateString('es-MX', opts);
    return f.charAt(0).toUpperCase() + f.slice(1);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Confirmada': return '#10B981';
      case 'Pendiente': return '#F59E0B';
      case 'Cancelada': return '#EF4444';
      case 'Completada': return '#6B7280';
      case 'Pagado': return '#8B5CF6';
      case 'Reagendada': return '#3B82F6';
      default: return '#94A3B8';
    }
  };

  const initials = user?.name?.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || 'U';

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadDashboardData(true, true)}
            tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.greeting}>{getGreeting()},</Text>
            <Text style={s.userName}>{authLoading ? '' : (user?.name?.split(' ')[0] || 'Usuario')}</Text>
            <Text style={s.date}>{getTodayDate()}</Text>
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

        {isGratuito ? (
          <View style={s.upgradeCard}>
            <Text style={s.upgradeEmoji}>🚀</Text>
            <Text style={s.upgradeTitle}>¡Bienvenido a VYLTA!</Text>
            <Text style={s.upgradeDesc}>Activa el Plan Básico para agendar citas y automatizar recordatorios por WhatsApp.</Text>
            <TouchableOpacity style={s.upgradeBtn} onPress={() => router.push('/settings/subscription')}>
              <Text style={s.upgradeBtnText}>Ver planes →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── Stats hoy ── */}
            <Text style={s.sectionLabel}>HOY</Text>
            <View style={s.statsRow}>
              <StatCard icon="calendar-today" value={stats.todayAppointments} label="Citas" iconColor="#10B981" iconBg="#ECFDF5" />
              <StatCard icon="check-circle" value={stats.confirmedToday} label="Confirmadas" iconColor="#3B82F6" iconBg="#EFF6FF" />
              <StatCard icon="schedule" value={stats.unconfirmedToday} label="Sin confirmar" iconColor="#F59E0B" iconBg="#FFFBEB" />
            </View>

            {/* ── Stats semana ── */}
            <Text style={s.sectionLabel}>PRÓXIMOS 7 DÍAS</Text>
            <View style={s.statsRow}>
              <StatCard icon="date-range" value={stats.weekAppointments} label="Citas" iconColor="#6366F1" iconBg="#EEF2FF" />
              <StatCard icon="check-circle" value={stats.confirmedWeek} label="Confirmadas" iconColor="#3B82F6" iconBg="#EFF6FF" />
              <StatCard icon="schedule" value={stats.unconfirmedWeek} label="Sin confirmar" iconColor="#F59E0B" iconBg="#FFFBEB" />
            </View>
          </>
        )}

        {/* ── Citas de hoy ── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Citas de hoy</Text>
            {todayAppointments.length > 0 && (
              <TouchableOpacity onPress={() => router.push('/(tabs)/appointments')}>
                <Text style={s.seeAll}>Ver todas</Text>
              </TouchableOpacity>
            )}
          </View>

          {todayAppointments.length === 0 ? (
            <View style={s.empty}>
              <MaterialIcons name="event-available" size={48} color="#CBD5E1" />
              <Text style={s.emptyTitle}>Sin citas hoy</Text>
              <Text style={s.emptyDesc}>Tu agenda está libre</Text>
              {canSchedule && (
                <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/appointments/new')}>
                  <Text style={s.emptyBtnText}>+ Crear cita</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            todayAppointments.map((appt) => {
              const statusColor = getStatusColor(appt.status);
              return (
                <TouchableOpacity
                  key={appt.id}
                  style={s.apptCard}
                  onPress={() => router.push(`/appointments/${appt.id}`)}
                  activeOpacity={0.75}
                >
                  <View style={[s.apptStripe, { backgroundColor: statusColor }]} />
                  <View style={s.apptTime}>
                    <Text style={s.apptTimeText}>{appt.time}</Text>
                  </View>
                  <View style={s.apptInfo}>
                    <Text style={s.apptClient}>{appt.client?.name}</Text>
                    <Text style={s.apptService}>{appt.service}</Text>
                  </View>
                  <View style={[s.apptBadge, { backgroundColor: statusColor + '20' }]}>
                    <Text style={[s.apptBadgeText, { color: statusColor }]}>{appt.status}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* ── Acciones rápidas ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Acciones rápidas</Text>
          <View style={s.actionsGrid}>
            <ActionBtn icon="add-circle" label="Nueva Cita" onPress={() => router.push('/appointments/new')} primary />
            <ActionBtn icon="person-add" label="Nuevo Cliente" onPress={() => router.push('/clients/new')} />
            <ActionBtn icon="calendar-month" label="Ver Calendario" onPress={() => router.push('/(tabs)/appointments')} />
            <ActionBtn icon="refresh" label="Reactivar Clientes" onPress={() => router.push('/clients/inactive')} />
          </View>
        </View>

        {/* ── Banner WhatsApp ── */}
        {(isBasico || isPremium) && (
          <TouchableOpacity style={s.waBanner} onPress={() => router.push('/settings/whatsapp')} activeOpacity={0.8}>
            <View style={s.waIconBox}>
              <MaterialIcons name="chat" size={22} color="#25D366" />
            </View>
            <View style={s.waInfo}>
              <Text style={s.waTitle}>WhatsApp no configurado</Text>
              <Text style={s.waDesc}>Actívalo para enviar recordatorios automáticos</Text>
            </View>
            <View style={s.waArrow}>
              <MaterialIcons name="arrow-forward-ios" size={14} color="#25D366" />
            </View>
          </TouchableOpacity>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 20, paddingBottom: 100 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  headerLeft: { flex: 1 },
  greeting: { fontSize: 15, color: '#94A3B8', fontWeight: '500' },
  userName: { fontSize: 30, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5, marginTop: 2 },
  date: { fontSize: 13, color: '#94A3B8', marginTop: 4 },
  avatar: { width: 52, height: 52, borderRadius: 16, borderWidth: 2, borderColor: '#E2E8F0' },
  avatarFallback: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800', color: '#fff' },

  // Upgrade
  upgradeCard: {
    backgroundColor: '#ECFDF5', borderRadius: 20, padding: 24, alignItems: 'center',
    borderWidth: 1, borderColor: '#10B981', marginBottom: 24,
  },
  upgradeEmoji: { fontSize: 40, marginBottom: 10 },
  upgradeTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  upgradeDesc: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  upgradeBtn: { backgroundColor: '#10B981', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  upgradeBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Section
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.5, marginBottom: 10, marginTop: 8 },
  statsRow: { flexDirection: 'row', marginBottom: 24 },
  section: { marginBottom: 28 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  seeAll: { fontSize: 13, color: '#10B981', fontWeight: '600' },

  // Empty
  empty: { backgroundColor: '#fff', borderRadius: 16, padding: 32, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#0F172A', marginTop: 12 },
  emptyDesc: { fontSize: 13, color: '#94A3B8', marginTop: 4, marginBottom: 16 },
  emptyBtn: { backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Appointment card
  apptCard: {
    backgroundColor: '#fff', borderRadius: 14, flexDirection: 'row', alignItems: 'center',
    marginBottom: 8, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  apptStripe: { width: 4, alignSelf: 'stretch' },
  apptTime: { paddingHorizontal: 12, paddingVertical: 16, minWidth: 62, alignItems: 'center' },
  apptTimeText: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  apptInfo: { flex: 1, paddingVertical: 14 },
  apptClient: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  apptService: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  apptBadge: { marginRight: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  apptBadgeText: { fontSize: 11, fontWeight: '700' },

  // Actions
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },

  // WhatsApp banner
  waBanner: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: '#D1FAE5',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  waIconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F0FDF4', justifyContent: 'center', alignItems: 'center' },
  waInfo: { flex: 1 },
  waTitle: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  waDesc: { fontSize: 12, color: '#64748B', marginTop: 2 },
  waArrow: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#F0FDF4', justifyContent: 'center', alignItems: 'center' },
});
