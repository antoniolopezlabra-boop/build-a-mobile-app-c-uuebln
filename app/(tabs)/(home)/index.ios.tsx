
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

interface DashboardStats {
  todayAppointments: number;
  confirmedToday: number;
  unconfirmedToday: number;
  totalClients: number;
  totalAppointments: number;
}

export default function HomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    todayAppointments: 0,
    confirmedToday: 0,
    unconfirmedToday: 0,
    totalClients: 0,
    totalAppointments: 0,
  });
  const [userName, setUserName] = useState('Usuario');
  const [businessName, setBusinessName] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    console.log('Loading dashboard data');
    setLoading(true);

    // TODO: Backend Integration - GET /api/auth/me → { user: { name }, businessProfile: { businessName } }
    // TODO: Backend Integration - GET /api/stats/dashboard → { todayAppointments, confirmedToday, unconfirmedToday }

    setLoading(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 19) return 'Buenas tardes';
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
    return today.toLocaleDateString('es-MX', options);
  };

  const greeting = getGreeting();
  const todayDate = getTodayDate();

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
          <View>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.userName}>{userName}</Text>
            <Text style={styles.userName}>👋</Text>
          </View>
        </View>

        {businessName ? (
          <Text style={styles.businessName}>{businessName}</Text>
        ) : null}

        <Text style={styles.date}>{todayDate}</Text>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <IconSymbol
              ios_icon_name="calendar"
              android_material_icon_name="calendar-today"
              size={32}
              color={colors.primary}
            />
            <Text style={styles.statValue}>{stats.todayAppointments}</Text>
            <Text style={styles.statLabel}>Citas hoy</Text>
          </View>

          <View style={styles.statCard}>
            <IconSymbol
              ios_icon_name="checkmark.circle.fill"
              android_material_icon_name="check-circle"
              size={32}
              color={colors.success}
            />
            <Text style={styles.statValue}>{stats.confirmedToday}</Text>
            <Text style={styles.statLabel}>Confirmadas</Text>
          </View>

          <View style={styles.statCard}>
            <IconSymbol
              ios_icon_name="clock.fill"
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
          <View style={styles.emptyState}>
            <IconSymbol
              ios_icon_name="calendar.badge.checkmark"
              android_material_icon_name="event-available"
              size={64}
              color={colors.textSecondary}
            />
            <Text style={styles.emptyStateText}>Aún no tienes citas hoy</Text>
            <TouchableOpacity
              style={styles.emptyStateButton}
              onPress={() => {
                console.log('User tapped Nueva Cita from empty state');
                router.push('/(tabs)/appointments');
              }}
            >
              <Text style={styles.emptyStateButtonText}>Crear primera cita</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acciones rápidas</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => {
                console.log('User tapped Nueva Cita');
                router.push('/(tabs)/appointments');
              }}
            >
              <IconSymbol
                ios_icon_name="plus.circle.fill"
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
                router.push('/(tabs)/clients');
              }}
            >
              <IconSymbol
                ios_icon_name="person.badge.plus.fill"
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
              }}
            >
              <IconSymbol
                ios_icon_name="list.bullet"
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
              }}
            >
              <IconSymbol
                ios_icon_name="arrow.clockwise.circle.fill"
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
            router.push('/(tabs)/settings');
          }}
        >
          <IconSymbol
            ios_icon_name="exclamationmark.triangle.fill"
            android_material_icon_name="warning"
            size={24}
            color={colors.warning}
          />
          <Text style={styles.whatsappText}>WhatsApp: No configurado</Text>
          <IconSymbol
            ios_icon_name="chevron.right"
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
    fontSize: 16,
    color: colors.textSecondary,
  },
  userName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  businessName: {
    fontSize: 18,
    color: colors.textSecondary,
    marginBottom: 8,
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
});
