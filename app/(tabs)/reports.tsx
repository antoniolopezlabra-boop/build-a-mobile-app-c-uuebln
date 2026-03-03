
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { apiGet } from '@/utils/api';



interface DashboardStats {
  todayAppointments: number;
  confirmedToday: number;
  unconfirmedToday: number;
  totalClients: number;
  totalAppointments: number;
}

export default function ReportsScreen() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    console.log('[Reports] Loading stats');
    setLoading(true);
    try {
      const data = await apiGet<DashboardStats>('/api/stats/dashboard');
      console.log('[Reports] Stats loaded:', data);
      setStats(data);
    } catch (error) {
      console.error('[Reports] Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Reportes</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Reportes</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {stats ? (
          <>
            <Text style={styles.sectionTitle}>Resumen general</Text>

            <View style={styles.statsGrid}>
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
                <Text style={styles.statLabel}>Confirmadas hoy</Text>
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

              <View style={styles.statCard}>
                <IconSymbol
                  android_material_icon_name="group"
                  size={32}
                  color={colors.primary}
                />
                <Text style={styles.statValue}>{stats.totalClients}</Text>
                <Text style={styles.statLabel}>Total clientes</Text>
              </View>

              <View style={[styles.statCard, styles.statCardWide]}>
                <IconSymbol
                  android_material_icon_name="event-note"
                  size={32}
                  color={colors.primary}
                />
                <Text style={styles.statValue}>{stats.totalAppointments}</Text>
                <Text style={styles.statLabel}>Total citas</Text>
              </View>
            </View>

            <View style={styles.comingSoon}>
              <IconSymbol
                android_material_icon_name="assessment"
                size={48}
                color={colors.textSecondary}
              />
              <Text style={styles.comingSoonText}>Más reportes próximamente</Text>
              <Text style={styles.comingSoonSubtext}>
                Gráficas detalladas y análisis de tu negocio
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <IconSymbol
              android_material_icon_name="assessment"
              size={64}
              color={colors.textSecondary}
            />
            <Text style={styles.emptyStateText}>No hay datos disponibles</Text>
            <Text style={styles.emptyStateSubtext}>
              Comienza agregando citas y clientes para ver tus estadísticas
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, paddingTop: 48, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 28, fontWeight: 'bold', color: colors.text },
  scrollContent: { flexGrow: 1, padding: 20, paddingBottom: 100 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, marginBottom: 32 },
  statCard: { width: '47%', backgroundColor: colors.card, borderRadius: 16, padding: 20, alignItems: 'center', marginHorizontal: '1.5%', marginBottom: 12 },
  statCardWide: { width: '97%' },
  statValue: { fontSize: 32, fontWeight: 'bold', color: colors.text, marginTop: 8 },
  statLabel: { fontSize: 13, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
  comingSoon: { backgroundColor: colors.card, borderRadius: 16, padding: 32, alignItems: 'center' },
  comingSoonText: { fontSize: 16, fontWeight: '600', color: colors.text, marginTop: 12 },
  comingSoonSubtext: { fontSize: 14, color: colors.textSecondary, marginTop: 8, textAlign: 'center' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  emptyStateText: { fontSize: 18, fontWeight: '600', color: colors.text, marginTop: 16 },
  emptyStateSubtext: { fontSize: 14, color: colors.textSecondary, marginTop: 8, textAlign: 'center' },
});



