import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { getCached, setCached, invalidateCache, CACHE_TTL } from '@/utils/cache';
import { apiGet } from '@/utils/api';
import React, { useState, useCallback, useMemo } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { usePlan } from '@/contexts/PlanContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Calendar } from 'react-native-calendars';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { getTodayString } from '@/utils/dateUtils';

interface ApiAppointment {
  id: string;
  clientId: string;
  date: string;
  time: string;
  service: string;
  status: string;
  isRescheduled?: boolean;
  notes?: string | null;
  client: { id: string; name: string; phone: string } | null;
  clientNameTemp?: string | null;
  clientPhone?: string | null;
  source?: string | null;
}

// FIX: 'No asistió' en lugar de 'No-show' para coincidir con los valores reales en DB
const STATUS_META: Record<string, { color: string; label: string }> = {
  Confirmada:   { color: '#10B981', label: 'Confirmada' },
  Pendiente:    { color: '#F59E0B', label: 'Pendiente' },
  Cancelada:    { color: '#EF4444', label: 'Cancelada' },
  Completada:   { color: '#6B7280', label: 'Completada' },
  'No asistió': { color: '#F97316', label: 'No asistió' },
  Reagendada:   { color: '#3B82F6', label: 'Reagendada' },
  Pagado:       { color: '#8B5CF6', label: 'Pagado' },
  Solicitud:    { color: '#3B82F6', label: 'Solicitud' },
  'En espera':  { color: '#0EA5E9', label: 'En espera' },
};

export default function AppointmentsScreen() {
  const router = useRouter();
  const { canSchedule } = usePlan();
  const { colors: tc, isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  // FIX: usar getTodayString() para obtener fecha local, no UTC
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [loadError, setLoadError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const cached = getCached<ApiAppointment[]>('appointments_list');
      if (cached) {
        setAppointments(cached);
        setLoading(false);
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    invalidateCache('appointments_list');
    await loadAppointments(false);
    setRefreshing(false);
  }, []);

  const markedDates = useMemo(() => {
    const marked: Record<string, any> = {};
    appointments.forEach((appt) => {
      if (!marked[appt.date]) marked[appt.date] = { marked: true, dotColor: colors.primary };
    });
    marked[selectedDate] = {
      ...(marked[selectedDate] || {}),
      selected: true,
      selectedColor: colors.primary,
    };
    return marked;
  }, [appointments, selectedDate]);

  const dateAppointments = useMemo(() =>
    appointments.filter(a => a.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time)),
  [appointments, selectedDate]);

  const confirmedCount = dateAppointments.filter(a => a.status === 'Confirmada').length;
  const pendingCount   = dateAppointments.filter(a => a.status === 'Pendiente').length;

  const selectedDateObj = new Date(selectedDate + 'T12:00:00');
  const formattedDate = selectedDateObj.toLocaleDateString('es-MX', { weekday: 'long', month: 'long', day: 'numeric' });
  const monthYear     = selectedDateObj.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

  const calTheme = {
    backgroundColor: tc.surface,
    calendarBackground: tc.surface,
    textSectionTitleColor: tc.textMuted,
    selectedDayBackgroundColor: colors.primary,
    selectedDayTextColor: '#fff',
    todayTextColor: colors.primary,
    dayTextColor: tc.text,
    textDisabledColor: tc.border,
    dotColor: colors.primary,
    selectedDotColor: '#fff',
    arrowColor: colors.primary,
    monthTextColor: tc.text,
    textDayFontWeight: '500' as any,
    textMonthFontWeight: '700' as any,
    textDayHeaderFontWeight: '600' as any,
    textDayFontSize: 15,
    textMonthFontSize: 17,
    textDayHeaderFontSize: 13,
  };

  if (loading) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <View style={s.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        <View>
          <Text style={[s.title, { color: tc.text }]}>Citas</Text>
          <Text style={[s.subtitle, { color: tc.textMuted }]}>
            {monthYear.charAt(0).toUpperCase() + monthYear.slice(1)}
          </Text>
        </View>
        <View style={[s.headerBadge, { backgroundColor: isDark ? '#052E16' : '#ECFDF5' }]}>
          <Text style={s.headerBadgeText}>{appointments.length} total</Text>
        </View>
      </View>

      <ScrollView
        style={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Calendario */}
        <View style={[s.calendarWrap, { backgroundColor: tc.surface }]}>
          <Calendar
            current={selectedDate}
            onDayPress={(day: any) => setSelectedDate(day.dateString)}
            markedDates={markedDates}
            theme={calTheme}
          />
        </View>

        <View style={[s.listSection, { backgroundColor: tc.bg }]}>
          {/* Cabecera del día seleccionado */}
          <View style={s.dayHeader}>
            <View style={s.dayTitleWrap}>
              <Text style={[s.dayTitle, { color: tc.text }]}>
                {formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1)}
              </Text>
              {dateAppointments.length > 0 && (
                <View style={[s.dayCountPill, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                  <Text style={[s.dayCount, { color: tc.textMuted }]}>
                    {dateAppointments.length} {dateAppointments.length === 1 ? 'cita' : 'citas'}
                  </Text>
                </View>
              )}
            </View>

            {dateAppointments.length > 0 && (
              <View style={s.daySummary}>
                {confirmedCount > 0 && (
                  <View style={[s.summaryChip, { backgroundColor: tc.surface, borderColor: tc.border }]}>
                    <View style={[s.summaryDot, { backgroundColor: '#10B981' }]} />
                    <Text style={[s.summaryText, { color: tc.textMuted }]}>
                      {confirmedCount} confirmada{confirmedCount > 1 ? 's' : ''}
                    </Text>
                  </View>
                )}
                {pendingCount > 0 && (
                  <View style={[s.summaryChip, { backgroundColor: tc.surface, borderColor: tc.border }]}>
                    <View style={[s.summaryDot, { backgroundColor: '#F59E0B' }]} />
                    <Text style={[s.summaryText, { color: tc.textMuted }]}>
                      {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Error */}
          {loadError && (
            <View style={s.errorState}>
              <MaterialIcons name="wifi-off" size={32} color={tc.border} />
              <Text style={[s.errorText, { color: '#EF4444' }]}>No se pudieron cargar las citas.</Text>
              <TouchableOpacity onPress={() => loadAppointments()} style={s.retryBtn}>
                <Text style={s.retryText}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Empty */}
          {!loadError && dateAppointments.length === 0 ? (
            <View style={s.empty}>
              <View style={[s.emptyIconWrap, { backgroundColor: tc.surface }]}>
                <MaterialIcons name="event-available" size={32} color={tc.border} />
              </View>
              <Text style={[s.emptyTitle, { color: tc.text }]}>Sin citas este día</Text>
              <Text style={[s.emptyDesc, { color: tc.textMuted }]}>Toca + para agregar una cita</Text>
            </View>
          ) : (
            <View style={s.list}>
              {dateAppointments.map((appt) => {
                const meta = STATUS_META[appt.status] || { color: '#94A3B8', label: appt.status };
                // FIX: mostrar nombre temporal para citas del link público
                const displayName = appt.client?.name || appt.clientNameTemp || 'Cliente';
                return (
                  <TouchableOpacity
                    key={appt.id}
                    style={[s.apptCard, { backgroundColor: tc.surface, borderColor: tc.border }]}
                    onPress={() => router.push(`/appointments/${appt.id}`)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.stripe, { backgroundColor: meta.color }]} />
                    <View style={s.timeCol}>
                      <Text style={[s.timeText, { color: tc.text }]}>{appt.time}</Text>
                    </View>
                    <View style={s.infoCol}>
                      <Text style={[s.clientName, { color: tc.text }]} numberOfLines={1}>
                        {displayName}
                      </Text>
                      <Text style={[s.serviceName, { color: tc.textMuted }]} numberOfLines={1}>
                        {appt.service || 'Servicio'}
                      </Text>
                      {appt.isRescheduled && (
                        <View style={s.rescheduledPill}>
                          <Text style={s.rescheduledText}>Reagendada</Text>
                        </View>
                      )}
                      {appt.source === 'public_link' && !appt.client && (
                        <View style={[s.rescheduledPill, { backgroundColor: '#EFF6FF' }]}>
                          <Text style={[s.rescheduledText, { color: '#3B82F6' }]}>Link público</Text>
                        </View>
                      )}
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: meta.color + '22' }]}>
                      <Text style={[s.statusText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={18} color={tc.border} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <TouchableOpacity
        style={[s.fab, !canSchedule && s.fabDisabled]}
        onPress={() => {
          if (!canSchedule) { router.push('/settings/subscription'); return; }
          router.push('/appointments/new');
        }}
      >
        <MaterialIcons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1 },
  loading:        { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:         { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:          { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle:       { fontSize: 13, marginTop: 2, textTransform: 'capitalize' },
  headerBadge:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  headerBadgeText:{ fontSize: 13, fontWeight: '700', color: '#10B981' },
  content:        { flex: 1 },
  calendarWrap:   { marginBottom: 2 },
  listSection:    { paddingHorizontal: 16, paddingBottom: 100 },
  dayHeader:      { paddingVertical: 14, gap: 8 },
  dayTitleWrap:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dayTitle:       { fontSize: 16, fontWeight: '700', textTransform: 'capitalize', flex: 1 },
  dayCountPill:   { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  dayCount:       { fontSize: 12, fontWeight: '600' },
  daySummary:     { flexDirection: 'row', gap: 8 },
  summaryChip:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 0.5 },
  summaryDot:     { width: 7, height: 7, borderRadius: 4 },
  summaryText:    { fontSize: 12, fontWeight: '500' },
  errorState:     { alignItems: 'center', paddingVertical: 32, gap: 10 },
  errorText:      { fontSize: 14 },
  retryBtn:       { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText:      { color: '#fff', fontWeight: '600' },
  empty:          { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyIconWrap:  { width: 64, height: 64, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  emptyTitle:     { fontSize: 16, fontWeight: '600' },
  emptyDesc:      { fontSize: 13 },
  list:           { gap: 8 },
  apptCard:       { borderRadius: 14, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderWidth: 1 },
  stripe:         { width: 4, alignSelf: 'stretch' },
  timeCol:        { paddingHorizontal: 12, paddingVertical: 16, minWidth: 64, alignItems: 'center' },
  timeText:       { fontSize: 14, fontWeight: '700' },
  infoCol:        { flex: 1, paddingVertical: 14, gap: 2 },
  clientName:     { fontSize: 15, fontWeight: '600' },
  serviceName:    { fontSize: 12 },
  rescheduledPill:{ alignSelf: 'flex-start', backgroundColor: '#EFF6FF', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, marginTop: 4 },
  rescheduledText:{ fontSize: 10, fontWeight: '700', color: '#3B82F6' },
  statusBadge:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, marginRight: 6 },
  statusText:     { fontSize: 11, fontWeight: '700' },
  fab:            { position: 'absolute', bottom: 90, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8 },
  fabDisabled:    { backgroundColor: '#94A3B8' },
});
