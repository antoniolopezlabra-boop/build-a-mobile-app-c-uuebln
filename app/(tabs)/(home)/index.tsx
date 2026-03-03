
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { apiGet } from '@/utils/api';

interface DashboardStats {
  todayAppointments: number;
  confirmedToday: number;
  unconfirmedToday: number;
  totalClients: number;
  totalAppointments: number;
}

interface TodayAppointment {
  id: string;
  date: string;
  time: string;
  service: string;
  status: string;
  client: { id: string; name: string; phone: string };
}

export default function HomeScreen() {
  const router = useRouter();
  const { user, businessProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    todayAppointments: 0,
    confirmedToday: 0,
    unconfirmedToday: 0,
    totalClients: 0,
    totalAppointments: 0,
  });
  const [todayAppointments, setTodayAppointments] = useState<TodayAppointment[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    console.log('[Home] Loading dashboard data');
    setLoading(true);

    try {
      const [statsData, todayData] = await Promise.all([
        apiGet<DashboardStats>('/api/stats/dashboard').catch(() => ({
          todayAppointments: 0,
          confirmedToday: 0,
          unconfirmedToday: 0,
          totalClients: 0,
          totalAppointments: 0,
        })),
        apiGet<TodayAppointment[]>('/api/appointments/today').catch(() => []),
      ]);
      console.log('[Home] Stats loaded:', statsData);
      console.log('[Home] Today appointments loaded:', todayData.length);
      setStats(statsData);
      setTodayAppointments(todayData);
    } catch (error) {
      console.error('[Home] Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const userName = user?.name || 'Usuario';
  const businessName = businessProfile?.businessName || '';

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return 'Buenos días';
    }
    if (hour < 19) {
      return 'Buenas tardes';
    }
    return 'Buenas noches';
  };

  const getTodayDate = () => {
    const today = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    const formatted = today.toLocaleDateString('es-MX', options);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  };

  const greeting = getGreeting();
  const todayDate = getTodayDate();

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Cargando...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting}, {userName} 👋</Text>
            {businessName ? (
              <Text style={styles.businessName}>{businessName}</Text>
            ) : null}
          </View>
        </View>

        <Text style={styles.date}>{todayDate}</Text>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <IconSymbol
              android_material_icon_name="calendar-today"
              size={32}
              color={colors.primary}
            />
            <Text style={styles.statValue}>{stats.todayAppointments}</Text>
            <Text style={styles.statLabel}>Citas hoy</Text>
          </View>

          <View style={styles.statCard}>
            <IconSymbol
              android_material_icon_name="check-circle"
              size={32}
              color={colors.success}
            />
            <Text style={styles.statValue}>{stats.confirmedToday}</Text>
            <Text style={styles.statLabel}>Confirmadas</Text>
          </View>

          <View style={styles.statCard}>
            <IconSymbol
              android_material_icon_name="schedule"
              size={32}
              color={colors.warning}
            />
            <Text style={styles.statValue}>{stats.unconfirmedToday}</Text>
            <Text style={styles.statLabel}>Sin confirmar</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Citas de Hoy</Text>
          {todayAppointments.length === 0 ? (
            <View style={styles.emptyState}>
              <IconSymbol
                android_material_icon_name="event-available"
                size={64}
                color={colors.textSecondary}
              />
              <Text style={styles.emptyStateText}>Aún no tienes citas hoy</Text>
              <TouchableOpacity
                style={styles.emptyStateButton}
                onPress={() => {
                  console.log('User tapped Nueva Cita from empty state');
                  router.push('/appointments/new');
                }}
              >
                <Text style={styles.emptyStateButtonText}>Crear primera cita</Text>
              </TouchableOpacity>
            </View>
          ) : (
            todayAppointments.map((appt) => {
              const statusDisplay = appt.status === 'Confirmada' ? 'Confirmada' : 'Sin confirmar';
              const statusStyle = appt.status === 'Confirmada' ? styles.statusConfirmed : styles.statusPending;
              
              return (
                <TouchableOpacity
                  key={appt.id}
                  style={styles.appointmentCard}
                  onPress={() => {
                    console.log('User tapped appointment:', appt.id);
                    router.push(`/appointments/${appt.id}`);
                  }}
                >
                  <View style={styles.appointmentTime}>
                    <Text style={styles.appointmentTimeText}>{appt.time}</Text>
                  </View>
                  <View style={styles.appointmentInfo}>
                    <Text style={styles.appointmentClient}>{appt.client?.name}</Text>
                    <Text style={styles.appointmentService}>{appt.service}</Text>
                  </View>
                  <View style={[styles.statusBadge, statusStyle]}>
                    <Text style={styles.statusText}>{statusDisplay}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acciones rápidas</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => {
                console.log('User tapped Nueva Cita');
                router.push('/appointments/new');
              }}
            >
              <IconSymbol
                android_material_icon_name="add-circle"
                size={32}
                color={colors.primary}
              />
              <Text style={styles.actionText}>Nueva Cita</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => {
                console.log('User tapped Nuevo Cliente');
                router.push('/clients/new');
              }}
            >
              <IconSymbol
                android_material_icon_name="person-add"
                size={32}
                color={colors.primary}
              />
              <Text style={styles.actionText}>Nuevo Cliente</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => {
                console.log('User tapped Lista de Espera');
                router.push('/(tabs)/appointments');
              }}
            >
              <IconSymbol
                android_material_icon_name="list"
                size={32}
                color={colors.primary}
              />
              <Text style={styles.actionText}>Lista de Espera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => {
                console.log('User tapped Reactivar Clientes');
                router.push('/clients/inactive');
              }}
            >
              <IconSymbol
                android_material_icon_name="refresh"
                size={32}
                color={colors.primary}
              />
              <Text style={styles.actionText}>Reactivar Clientes</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.whatsappBanner}
          onPress={() => {
            console.log('User tapped WhatsApp banner');
            router.push('/settings/whatsapp');
          }}
        >
          <IconSymbol
            android_material_icon_name="warning"
            size={24}
            color={colors.warning}
          />
          <Text style={styles.whatsappText}>WhatsApp: No configurado</Text>
          <IconSymbol
            android_material_icon_name="arrow-forward"
            size={24}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.textSecondary,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  businessName: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 4,
  },
  date: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
  },
  emptyState: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyStateText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 16,
    marginBottom: 16,
  },
  emptyStateButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyStateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  actionCard: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginHorizontal: '1%',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginTop: 12,
    textAlign: 'center',
  },
  whatsappBanner: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.warning,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  whatsappText: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    marginLeft: 12,
  },
  appointmentCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  appointmentTime: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 8,
    marginRight: 12,
    minWidth: 60,
    alignItems: 'center',
  },
  appointmentTimeText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  appointmentInfo: {
    flex: 1,
  },
  appointmentClient: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  appointmentService: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusConfirmed: {
    backgroundColor: '#D1FAE5',
  },
  statusPending: {
    backgroundColor: '#FEF3C7',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
  },
});
