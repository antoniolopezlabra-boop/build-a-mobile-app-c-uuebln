
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { getCached, setCached } from '@/utils/cache';
import { apiGet } from '@/utils/api';
import React, { useEffect, useState, useCallback } from 'react';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useFocusEffect } from 'expo-router';
import { usePlan } from '@/contexts/PlanContext';
import { Calendar } from 'react-native-calendars';

// Fix #10: tipos de status completos incluyendo Pagado y Reagendada
interface ApiAppointment {
  id: string;
  clientId: string;
  userId: string;
  date: string;
  time: string;
  service: string;
  status: 'Confirmada' | 'Pendiente' | 'Cancelada' | 'Completada' | 'No-show' | 'Pagado' | 'Reagendada';
  isRescheduled?: boolean;
  notes?: string | null;
  client: { id: string; name: string; phone: string };
  createdAt: string;
}

export default function AppointmentsScreen() {
  const router = useRouter();
  const { canSchedule } = usePlan();
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [markedDates, setMarkedDates] = useState<any>({});
  const [loadError, setLoadError] = useState(false);

  // Fix #4: dependencia correcta []
  useFocusEffect(
    useCallback(() => {
      loadAppointments();
    }, [])
  );

  useEffect(() => {
    updateMarkedDates();
  }, [appointments, selectedDate]);

  const loadAppointments = async (forceRefresh = false) => {
    const cached = getCached<any[]>('appointments_list');
    if (!forceRefresh && cached) {
      setAppointments(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      console.log('[Appointments] Loading all appointments');
      const data = await apiGet<ApiAppointment[]>('/api/appointments');
      console.log('[Appointments] Loaded:', data.length, 'appointments');
      setAppointments(data);
      setCached('appointments_list', data);
    } catch (error) {
      console.error('[Appointments] Error loading appointments:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const updateMarkedDates = () => {
    const marked: any = {};
    
    appointments.forEach((appt) => {
      if (!marked[appt.date]) {
        marked[appt.date] = { marked: true, dots: [] };
      }
    });

    marked[selectedDate] = {
      ...marked[selectedDate],
      selected: true,
      selectedColor: colors.primary,
    };

    setMarkedDates(marked);
  };

  const getAppointmentsForDate = (date: string) => {
    return appointments
      .filter((appt) => appt.date === date)
      .sort((a, b) => a.time.localeCompare(b.time));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Confirmada': return '#10B981';
      case 'Pendiente': return '#F59E0B';
      case 'Cancelada': return '#EF4444';
      case 'Completada': return '#6B7280';
      case 'No-show': return '#F97316';
      case 'Reagendada': return '#3B82F6';
      case 'Pagado': return '#8B5CF6';
      default: return colors.text;
    }
  };

  const handleDateSelect = (day: any) => {
    setSelectedDate(day.dateString);
  };

  const handleNewAppointment = () => {
    if (!canSchedule) {
      router.push('/settings/subscription');
      return;
    }
    router.push('/appointments/new');
  };

  const handleAppointmentPress = (appointment: ApiAppointment) => {
    router.push(`/appointments/${appointment.id}`);
  };

  const dateAppointments = getAppointmentsForDate(selectedDate);
  const selectedDateObj = new Date(selectedDate + 'T12:00:00');
  const formattedDate = selectedDateObj.toLocaleDateString('es-MX', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Cargando citas...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Fix #1: header simplificado sin botones Semana/Día no implementados */}
      <View style={styles.header}>
        <Text style={styles.title}>Citas</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.calendarContainer}>
          <Calendar
            current={selectedDate}
            onDayPress={handleDateSelect}
            markedDates={markedDates}
            theme={{
              backgroundColor: '#ffffff',
              calendarBackground: '#ffffff',
              textSectionTitleColor: colors.text,
              selectedDayBackgroundColor: colors.primary,
              selectedDayTextColor: '#ffffff',
              todayTextColor: colors.primary,
              dayTextColor: colors.text,
              textDisabledColor: '#d9e1e8',
              dotColor: colors.primary,
              selectedDotColor: '#ffffff',
              arrowColor: colors.primary,
              monthTextColor: colors.text,
              textDayFontWeight: '400',
              textMonthFontWeight: 'bold',
              textDayHeaderFontWeight: '600',
              textDayFontSize: 16,
              textMonthFontSize: 18,
              textDayHeaderFontSize: 14,
            }}
          />
        </View>

        <View style={styles.appointmentsSection}>
          <Text style={styles.sectionTitle}>{formattedDate}</Text>

          {/* Fix #8: mostrar error si falla la carga */}
          {loadError && (
            <View style={styles.errorState}>
              <Text style={styles.errorText}>No se pudieron cargar las citas.</Text>
              <TouchableOpacity onPress={() => loadAppointments(true)} style={styles.retryButton}>
                <Text style={styles.retryText}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          )}
          
          {!loadError && dateAppointments.length === 0 ? (
            <View style={styles.emptyState}>
              <IconSymbol
                ios_icon_name="calendar"
                android_material_icon_name="event"
                size={64}
                color={colors.textSecondary}
              />
              <Text style={styles.emptyStateTitle}>No hay citas para este día</Text>
              <Text style={styles.emptyStateText}>
                Toca el botón + para agregar una nueva cita
              </Text>
            </View>
          ) : (
            <View style={styles.appointmentsList}>
              {dateAppointments.map((appointment) => {
                const statusColor = getStatusColor(appointment.status);
                return (
                  <TouchableOpacity
                    key={appointment.id}
                    style={styles.appointmentCard}
                    onPress={() => handleAppointmentPress(appointment)}
                  >
                    <View style={styles.appointmentTime}>
                      <IconSymbol
                        ios_icon_name="clock"
                        android_material_icon_name="access-time"
                        size={20}
                        color={colors.primary}
                      />
                      <Text style={styles.timeText}>{appointment.time}</Text>
                    </View>
                    
                    <View style={styles.appointmentDetails}>
                      <Text style={styles.clientName}>{appointment.client?.name || 'Cliente'}</Text>
                      <Text style={styles.serviceText}>{appointment.service || 'Servicio'}</Text>
                      
                      <View style={styles.badgesRow}>
                        {appointment.isRescheduled && (
                          <View style={styles.rescheduledBadge}>
                            <Text style={styles.rescheduledText}>🔄 Reagend.</Text>
                          </View>
                        )}
                        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                          <Text style={styles.statusText}>{appointment.status}</Text>
                        </View>
                      </View>
                    </View>

                    <IconSymbol
                      ios_icon_name="chevron.right"
                      android_material_icon_name="arrow-forward"
                      size={20}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <TouchableOpacity style={[styles.fab, !canSchedule && { backgroundColor: '#94A3B8' }]} onPress={handleNewAppointment}>
        <IconSymbol
          ios_icon_name="plus"
          android_material_icon_name="add"
          size={28}
          color="#ffffff"
        />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 16, fontSize: 16, color: colors.textSecondary },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 28, fontWeight: 'bold', color: colors.text },
  content: { flex: 1 },
  calendarContainer: { backgroundColor: '#ffffff', marginBottom: 16 },
  appointmentsSection: { paddingHorizontal: 20, paddingBottom: 100 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
    textTransform: 'capitalize',
  },
  errorState: { alignItems: 'center', paddingVertical: 32 },
  errorText: { fontSize: 15, color: '#EF4444', marginBottom: 12 },
  retryButton: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyStateTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginTop: 16, marginBottom: 8 },
  emptyStateText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  appointmentsList: { gap: 12 },
  appointmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  appointmentTime: { alignItems: 'center', gap: 4 },
  timeText: { fontSize: 14, fontWeight: '600', color: colors.text },
  appointmentDetails: { flex: 1, gap: 4 },
  clientName: { fontSize: 16, fontWeight: '600', color: colors.text },
  serviceText: { fontSize: 14, color: colors.textSecondary },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 4 },
  badgesRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' },
  rescheduledBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  rescheduledText: { fontSize: 11, fontWeight: '600', color: '#3B82F6' },
  statusText: { fontSize: 12, fontWeight: '600', color: '#ffffff' },
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.25)',
  },
});
