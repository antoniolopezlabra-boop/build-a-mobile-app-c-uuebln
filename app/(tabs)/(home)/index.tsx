import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
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

export default function HomeScreen() {
  const router = useRouter();
  const { user, businessProfile, loading: authLoading } = useAuth();
  const { canSchedule, isGratuito, isBasico, isPremium } = usePlan();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    todayAppointments: 0,
    confirmedToday: 0,
    unconfirmedToday: 0,
    weekAppointments: 0,
    confirmedWeek: 0,
    unconfirmedWeek: 0,
    totalClients: 0,
    totalAppointments: 0,
  });
  const [todayAppointments, setTodayAppointments] = useState<TodayAppointment[]>([]);
  const [weekAppointments, setWeekAppointments] = useState<TodayAppointment[]>([]);

  // Fix #4: dependencia correcta [user?.id] en lugar de [user]
  useFocusEffect(
    React.useCallback(() => {
      loadDashboardData();
    }, [user?.id])
  );

  const loadDashboardData = async (forceRefresh = false) => {
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

      setLoading(true);
      const results = await Promise.allSettled([
        apiGet<DashboardStats>('/api/stats/dashboard'),
        apiGet<TodayAppointment[]>('/api/appointments/today'),
        apiGet<TodayAppointment[]>('/api/appointments/week'),
      ]);
      if (results[0].status === 'fulfilled') {
        setStats(results[0].value);
        setCached('dashboard_stats', results[0].value);
      }
      if (results[1].status === 'fulfilled') {
        setTodayAppointments(results[1].value);
        setCached('today_appointments', results[1].value);
      }
      if (results[2].status === 'fulfilled') {
        setWeekAppointments(results[2].value);
        setCached('week_appointments', results[2].value);
      }
    } catch (error) {
      console.error('[Home] Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 19) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const getTodayDate = () => {
    const today = new Date();
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formatted = today.toLocaleDateString('es-MX', options);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <Text style={styles.greeting}>{getGreeting()}</Text>
              <Text style={styles.userName}>{authLoading ? 'Cargando...' : (user?.name || 'Usuario')}</Text>
              <Text style={styles.date}>{getTodayDate()}</Text>
            </View>
            <View style={styles.logoContainer}>
              {businessProfile?.logoUrl ? (
                <Image source={{ uri: businessProfile.logoUrl }} style={styles.logoImage} resizeMode="cover" />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Text style={styles.logoPlaceholderText}>
                    {businessProfile?.businessName?.charAt(0)?.toUpperCase() || 'N'}
                  </Text>
                </View>
              )}
              {businessProfile?.businessName ? (
                <Text style={styles.businessName} numberOfLines={1}>{businessProfile.businessName}</Text>
              ) : null}
            </View>
          </View>
        </View>

        {isGratuito ? (
          <View style={styles.upgradeCard}>
            <Text style={styles.upgradeIcon}>🚀</Text>
            <Text style={styles.upgradeTitle}>¡Bienvenido a VYLTA!</Text>
            <Text style={styles.upgradeDesc}>Ya tienes tu negocio configurado. Activa el Plan Básico para comenzar a agendar citas y automatizar tus recordatorios por WhatsApp.</Text>
            <TouchableOpacity style={styles.upgradeButton} onPress={() => router.push('/settings/subscription')}>
              <Text style={styles.upgradeButtonText}>Ver planes →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>📅 HOY</Text>
            <View style={styles.statsContainer}>
              <View style={styles.statCard}>
                <MaterialIcons name="calendar-today" size={32} color={colors.primary} />
                <Text style={styles.statValue}>{stats.todayAppointments}</Text>
                <Text style={styles.statLabel}>Citas hoy</Text>
              </View>
              <View style={styles.statCard}>
                <MaterialIcons name="check-circle" size={32} color={colors.success} />
                <Text style={styles.statValue}>{stats.confirmedToday}</Text>
                <Text style={styles.statLabel}>Confirmadas</Text>
              </View>
              <View style={styles.statCard}>
                <MaterialIcons name="schedule" size={32} color={colors.warning} />
                <Text style={styles.statValue}>{stats.unconfirmedToday}</Text>
                <Text style={styles.statLabel}>Sin confirmar</Text>
              </View>
            </View>

            <Text style={styles.sectionLabel}>📆 PRÓXIMOS 7 DÍAS</Text>
            <View style={styles.statsContainer}>
              <View style={styles.statCard}>
                <MaterialIcons name="date-range" size={32} color="#6366F1" />
                <Text style={styles.statValue}>{stats.weekAppointments}</Text>
                <Text style={styles.statLabel}>Citas semana</Text>
              </View>
              <View style={styles.statCard}>
                <MaterialIcons name="check-circle" size={32} color={colors.success} />
                <Text style={styles.statValue}>{stats.confirmedWeek}</Text>
                <Text style={styles.statLabel}>Confirmadas</Text>
              </View>
              <View style={styles.statCard}>
                <MaterialIcons name="schedule" size={32} color={colors.warning} />
                <Text style={styles.statValue}>{stats.unconfirmedWeek}</Text>
                <Text style={styles.statLabel}>Sin confirmar</Text>
              </View>
            </View>
          </>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Citas de Hoy</Text>
          {todayAppointments.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="event-available" size={64} color={colors.textSecondary} />
              <Text style={styles.emptyStateText}>Aún no tienes citas hoy</Text>
              {canSchedule && (
                <TouchableOpacity style={styles.emptyStateButton} onPress={() => router.push('/appointments/new')}>
                  <Text style={styles.emptyStateButtonText}>Crear primera cita</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            todayAppointments.map((appt) => (
              <TouchableOpacity key={appt.id} style={styles.appointmentCard} onPress={() => router.push(`/appointments/${appt.id}`)}>
                <View style={styles.appointmentTime}>
                  <Text style={styles.appointmentTimeText}>{appt.time}</Text>
                </View>
                <View style={styles.appointmentInfo}>
                  <Text style={styles.appointmentClient}>{appt.client?.name}</Text>
                  <Text style={styles.appointmentService}>{appt.service}</Text>
                </View>
                <View style={[styles.statusBadge, appt.status === 'Confirmada' ? styles.statusConfirmed : styles.statusPending]}>
                  <Text style={styles.statusText}>{appt.status === 'Confirmada' ? 'Confirmada' : 'Sin confirmar'}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acciones rápidas</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/appointments/new')}>
              <MaterialIcons name="add-circle" size={32} color={colors.primary} />
              <Text style={styles.actionText}>Nueva Cita</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/clients/new')}>
              <MaterialIcons name="person-add" size={32} color={colors.primary} />
              <Text style={styles.actionText}>Nuevo Cliente</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/(tabs)/appointments')}>
              <MaterialIcons name="list" size={32} color={colors.primary} />
              <Text style={styles.actionText}>Ver Calendario</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/clients/inactive')}>
              <MaterialIcons name="refresh" size={32} color={colors.primary} />
              <Text style={styles.actionText}>Reactivar Clientes</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Fix #3: banner WhatsApp solo visible para plan Básico o Premium */}
        {(isBasico || isPremium) && (
          <TouchableOpacity style={styles.whatsappBanner} onPress={() => router.push('/settings/whatsapp')}>
            <MaterialIcons name="warning" size={24} color={colors.warning} />
            <Text style={styles.whatsappText}>WhatsApp: No configurado</Text>
            <MaterialIcons name="arrow-forward" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 20, paddingBottom: 100 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flex: 1, paddingRight: 12 },
  logoContainer: { alignItems: 'center', gap: 6 },
  logoImage: { width: 64, height: 64, borderRadius: 16, borderWidth: 2, borderColor: colors.primary },
  logoPlaceholder: { width: 64, height: 64, borderRadius: 16, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  logoPlaceholderText: { fontSize: 28, fontWeight: '800', color: '#ffffff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  greeting: { fontSize: 16, color: colors.textSecondary },
  userName: { fontSize: 28, fontWeight: 'bold', color: colors.text },
  businessName: { fontSize: 16, color: colors.textSecondary, marginTop: 4 },
  date: { fontSize: 14, color: colors.textSecondary, marginBottom: 24 },
  upgradeCard: { backgroundColor: '#ECFDF5', borderRadius: 16, padding: 24, marginHorizontal: 16, marginBottom: 20, alignItems: 'center', borderWidth: 1, borderColor: '#10B981' },
  upgradeIcon: { fontSize: 48, marginBottom: 12 },
  upgradeTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 8, textAlign: 'center' },
  upgradeDesc: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  upgradeButton: { backgroundColor: '#10B981', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  upgradeButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.5, marginBottom: 8, marginTop: 16, paddingHorizontal: 4 },
  statsContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32 },
  statCard: { flex: 1, backgroundColor: colors.card, borderRadius: 16, padding: 16, alignItems: 'center', marginHorizontal: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  statValue: { fontSize: 24, fontWeight: 'bold', color: colors.text, marginTop: 8 },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 16 },
  emptyState: { backgroundColor: colors.card, borderRadius: 16, padding: 32, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  emptyStateText: { fontSize: 16, color: colors.textSecondary, marginTop: 16, marginBottom: 16 },
  emptyStateButton: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  emptyStateButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8 },
  actionCard: { width: '48%', backgroundColor: colors.card, borderRadius: 16, padding: 20, alignItems: 'center', marginHorizontal: '1%', marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  actionText: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 12, textAlign: 'center' },
  whatsappBanner: { backgroundColor: colors.card, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.warning, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  whatsappText: { flex: 1, fontSize: 16, color: colors.text, marginLeft: 12 },
  appointmentCard: { backgroundColor: colors.card, borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  appointmentTime: { backgroundColor: colors.background, borderRadius: 8, padding: 8, marginRight: 12, minWidth: 60, alignItems: 'center' },
  appointmentTimeText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  appointmentInfo: { flex: 1 },
  appointmentClient: { fontSize: 16, fontWeight: '600', color: colors.text },
  appointmentService: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusConfirmed: { backgroundColor: '#D1FAE5' },
  statusPending: { backgroundColor: '#FEF3C7' },
  statusText: { fontSize: 11, fontWeight: '600', color: colors.text },
});
