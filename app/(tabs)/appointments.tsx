import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { getCached, setCached, CACHE_TTL } from '@/utils/cache';
import { apiGet } from '@/utils/api';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useFocusEffect } from 'expo-router';
import { usePlan } from '@/contexts/PlanContext';
import { Calendar } from 'react-native-calendars';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { getStatusColor } from '@/utils/appointmentUtils';

interface ApiAppointment {
  id: string;
  clientId: string;
  date: string;
  time: string;
  service: string;
  status: string;
  isRescheduled?: boolean;
  notes?: string | null;
  client: { id: string; name: string; phone: string };
}

const STATUS_META: Record<string, { color: string; bg: string; label: string }> = {
  Confirmada: { color: '#10B981', bg: '#ECFDF5', label: 'Confirmada' },
  Pendiente:  { color: '#F59E0B', bg: '#FFFBEB', label: 'Pendiente' },
  Cancelada:  { color: '#EF4444', bg: '#FEF2F2', label: 'Cancelada' },
  Completada: { color: '#6B7280', bg: '#F9FAFB', label: 'Completada' },
  'No-show':  { color: '#F97316', bg: '#FFF7ED', label: 'No-show' },
  Reagendada: { color: '#3B82F6', bg: '#EFF6FF', label: 'Reagendada' },
  Pagado:     { color: '#8B5CF6', bg: '#F5F3FF', label: 'Pagado' },
};

export default function AppointmentsScreen() {
  const router = useRouter();
  const { canSchedule } = usePlan();
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loadError, setLoadError] = useState(false);

  // FIX: useFocusEffect solo recarga si el cache expiró — no spinner en cada visita
  useFocusEffect(
    useCallback(() => {
      const cached = getCached<ApiAppointment[]>('appointments_list');
      if (cached) {
        // Cache fresco: actualizar estado sin loading visible
        setAppointments(cached);
        setLoading(false);
        // Refresco silencioso en background sin mostrar spinner
        loadAppointments(false, true);
      } else {
        loadAppointments();
      }
    }, [])
  );

  const loadAppointments = async (showLoading = true, silent = false) => {
    if (showLoading && !silent) setLoading(true);
    setLoadError(false);
    try {
      const data = await apiGet<ApiAppointment[]>('/api/appointments');
      setAppointments(data);
      setCached('appointments_list', data, CACHE_TTL.APPOINTMENTS);
    } catch {
      if (!silent) setLoadError(true);
    } finally {
      if (showLoading && !silent) setLoading(false);
    }
  };

  // FIX: calcular markedDates con useMemo — elimina el useEffect extra y el re-render doble
  const markedDates = useMemo(() => {
    const marked: Record<string, any> = {};
    appointments.forEach((appt) => {
      if (!marked[appt.date]) {
        marked[appt.date] = { marked: true, dotColor: colors.primary };
      }
    });
    // Merge con la fecha seleccionada
    marked[selectedDate] = {
      ...(marked[selectedDate] || {}),
      selected: true,
      selectedColor: colors.primary,
    };
    return marked;
  }, [appointments, selectedDate]);

  const getAppointmentsForDate = useCallback((date: string) =>
    appointments.filter(a => a.date === date).sort((a, b) => a.time.localeCompare(b.time)),
  [appointments]);

  const handleNewAppointment = () => {
    if (!canSchedule) { router.push('/settings/subscription'); return; }
    router.push('/appointments/new');
  };

  const dateAppointments = getAppointmentsForDate(selectedDate);
  const confirmedCount = dateAppointments.filter(a => a.status === 'Confirmada').length;
  const pendingCount   = dateAppointments.filter(a => a.status === 'Pendiente').length;

  const selectedDateObj = new Date(selectedDate + 'T12:00:00');
  const formattedDate = selectedDateObj.toLocaleDateString('es-MX', { weekday: 'long', month: 'long', day: 'numeric' });
  const monthYear     = selectedDateObj.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>Citas</Text>
          <Text style={s.subtitle}>{monthYear.charAt(0).toUpperCase() + monthYear.slice(1)}</Text>
        </View>
        <View style={s.headerBadge}>
          <Text style={s.headerBadgeText}>{appointments.length} total</Text>
        </View>
      </View>

      <ScrollView style={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.calendarWrap}>
          <Calendar
            current={selectedDate}
            onDayPress={(day: any) => setSelectedDate(day.dateString)}
            markedDates={markedDates}
            theme={{
              backgroundColor: '#fff',
              calendarBackground: '#fff',
              textSectionTitleColor: '#94A3B8',
              selectedDayBackgroundColor: colors.primary,
              selectedDayTextColor: '#fff',
              todayTextColor: colors.primary,
              dayTextColor: '#0F172A',
              textDisabledColor: '#CBD5E1',
              dotColor: colors.primary,
              selectedDotColor: '#fff',
              arrowColor: colors.primary,
              monthTextColor: '#0F172A',
              textDayFontWeight: '500',
              textMonthFontWeight: '700',
              textDayHeaderFontWeight: '600',
              textDayFontSize: 15,
              textMonthFontSize: 17,
              textDayHeaderFontSize: 13,
            }}
          />
        </View>

        <View style={s.listSection}>
          <View style={s.dayHeader}>
            <View style={s.dayTitleWrap}>
              <Text style={s.dayTitle}>{formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1)}</Text>
              {dateAppointments.length > 0 && (
                <Text style={s.dayCount}>{dateAppointments.length} {dateAppointments.length === 1 ? 'cita' : 'citas'}</Text>
              )}
            </View>
            {dateAppointments.length > 0 && (
              <View style={s.daySummary}>
                {confirmedCount > 0 && (
                  <View style={s.summaryChip}>
                    <View style={[s.summaryDot, { backgroundColor: '#10B981' }]} />
                    <Text style={s.summaryText}>{confirmedCount} confirmada{confirmedCount > 1 ? 's' : ''}</Text>
                  </View>
                )}
                {pendingCount > 0 && (
                  <View style={s.summaryChip}>
                    <View style={[s.summaryDot, { backgroundColor: '#F59E0B' }]} />
                    <Text style={s.summaryText}>{pendingCount} pendiente{pendingCount > 1 ? 's' : ''}</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {loadError && (
            <View style={s.errorState}>
              <Text style={s.errorText}>No se pudieron cargar las citas.</Text>
              <TouchableOpacity onPress={() => loadAppointments()} style={s.retryBtn}>
                <Text style={s.retryText}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          )}

          {!loadError && dateAppointments.length === 0 ? (
            <View style={s.empty}>
              <MaterialIcons name="event-available" size={48} color="#CBD5E1" />
              <Text style={s.emptyTitle}>Sin citas este día</Text>
              <Text style={s.emptyDesc}>Toca + para agregar una cita</Text>
            </View>
          ) : (
            <View style={s.list}>
              {dateAppointments.map((appt) => {
                const meta = STATUS_META[appt.status] || { color: '#94A3B8', bg: '#F1F5F9', label: appt.status };
                return (
                  <TouchableOpacity
                    key={appt.id}
                    style={s.apptCard}
                    onPress={() => router.push(`/appointments/${appt.id}`)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.stripe, { backgroundColor: meta.color }]} />
                    <View style={s.timeCol}>
                      <Text style={s.timeText}>{appt.time}</Text>
                    </View>
                    <View style={s.infoCol}>
                      <Text style={s.clientName}>{appt.client?.name || 'Cliente'}</Text>
                      <Text style={s.serviceName}>{appt.service || 'Servicio'}</Text>
                      {appt.isRescheduled && (
                        <View style={s.rescheduledPill}>
                          <Text style={s.rescheduledText}>Reagendada</Text>
                        </View>
                      )}
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: meta.bg }]}>
                      <Text style={[s.statusText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={18} color="#CBD5E1" />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <TouchableOpacity
        style={[s.fab, !canSchedule && s.fabDisabled]}
        onPress={handleNewAppointment}
      >
        <MaterialIcons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: '#94A3B8', marginTop: 2, textTransform: 'capitalize' },
  headerBadge: { backgroundColor: '#ECFDF5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  headerBadgeText: { fontSize: 13, fontWeight: '700', color: '#10B981' },
  content: { flex: 1 },
  calendarWrap: { backgroundColor: '#fff', marginBottom: 8 },
  listSection: { paddingHorizontal: 16, paddingBottom: 100 },
  dayHeader: { paddingVertical: 14, gap: 8 },
  dayTitleWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', textTransform: 'capitalize', flex: 1 },
  dayCount: { fontSize: 13, color: '#94A3B8', fontWeight: '500' },
  daySummary: { flexDirection: 'row', gap: 8 },
  summaryChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 0.5, borderColor: '#E2E8F0' },
  summaryDot: { width: 7, height: 7, borderRadius: 4 },
  summaryText: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  errorState: { alignItems: 'center', paddingVertical: 32 },
  errorText: { fontSize: 14, color: '#EF4444', marginBottom: 12 },
  retryBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#fff', fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#0F172A', marginTop: 12 },
  emptyDesc: { fontSize: 13, color: '#94A3B8', marginTop: 4 },
  list: { gap: 8 },
  apptCard: { backgroundColor: '#fff', borderRadius: 14, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  stripe: { width: 4, alignSelf: 'stretch' },
  timeCol: { paddingHorizontal: 12, paddingVertical: 16, minWidth: 64, alignItems: 'center' },
  timeText: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  infoCol: { flex: 1, paddingVertical: 14, gap: 2 },
  clientName: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  serviceName: { fontSize: 12, color: '#94A3B8' },
  rescheduledPill: { alignSelf: 'flex-start', backgroundColor: '#EFF6FF', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, marginTop: 4 },
  rescheduledText: { fontSize: 10, fontWeight: '700', color: '#3B82F6' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, marginRight: 6 },
  statusText: { fontSize: 11, fontWeight: '700' },
  fab: { position: 'absolute', bottom: 90, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8 },
  fabDisabled: { backgroundColor: '#94A3B8' },
});
