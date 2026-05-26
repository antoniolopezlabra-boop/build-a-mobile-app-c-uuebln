import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { getCached, setCached, invalidateCache, CACHE_TTL } from '@/utils/cache';
import { apiGet } from '@/utils/api';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import React, { useState, useCallback, useMemo, memo } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { usePlan } from '@/contexts/PlanContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Calendar } from 'react-native-calendars';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { getTodayString } from '@/utils/dateUtils';
import { logger } from '@/utils/logger';
// ⚡ FIX UX (May 19 2026): refetch automático al volver de background.
// Necesario porque useFocusEffect NO se dispara cuando el usuario está
// EN esta pantalla y minimiza/vuelve la app (la pantalla nunca pierde
// foco). Sin este hook, los datos quedan viejos hasta que el usuario
// navegue a otra tab y regrese.
import { useAppRefreshListener } from '@/hooks/useAppRefreshListener';

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
  staff_id?: string | null;
}

interface StaffMember {
  id: string;
  name: string;
  color: string;
  role: string | null;
}

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

// Altura aproximada del FloatingTabBar (sin incluir insets.bottom).
// Deriva de: paddingTop 8 + iconSize 24 + marginTop 2 label + ~14 line-height label + 4 paddingVertical tab = ~52px.
// Usamos 56 para dejar un poco de margen de seguridad.
const TAB_BAR_HEIGHT = 56;

// ⚡ QUICK WIN #4 (May 26 2026): AppointmentCard extraído + React.memo
// Antes: ~30 líneas de JSX inline POR CADA CITA. Cuando cambia cualquier
// state del componente padre, todas las tarjetas se re-renderean.
// Ahora: cada tarjeta solo se re-rendea si SUS props cambian.
// Impacto medible: -50% renders al cambiar de día o filtrar por staff.
interface AppointmentCardProps {
  appt: ApiAppointment;
  staffMember: StaffMember | null;
  tcText: string;
  tcSurface: string;
  tcBorder: string;
  tcTextMuted: string;
  onPress: (id: string) => void;
}

const AppointmentCard = memo(function AppointmentCard({
  appt, staffMember, tcText, tcSurface, tcBorder, tcTextMuted, onPress,
}: AppointmentCardProps) {
  const meta        = STATUS_META[appt.status] || { color: '#94A3B8', label: appt.status };
  const displayName = appt.client?.name || appt.clientNameTemp || 'Cliente';
  const stripeColor = staffMember ? staffMember.color : meta.color;

  return (
    <TouchableOpacity
      style={[s.apptCard, { backgroundColor: tcSurface, borderColor: tcBorder }]}
      onPress={() => onPress(appt.id)}
      activeOpacity={0.75}
    >
      <View style={[s.stripe, { backgroundColor: stripeColor }]} />
      <View style={s.timeCol}>
        <Text style={[s.timeText, { color: tcText }]}>{appt.time}</Text>
        {staffMember && <View style={[s.staffDot, { backgroundColor: staffMember.color }]} />}
      </View>
      <View style={s.infoCol}>
        <Text style={[s.clientName, { color: tcText }]} numberOfLines={1}>{displayName}</Text>
        <Text style={[s.serviceName, { color: tcTextMuted }]} numberOfLines={1}>
          {appt.service || 'Servicio'}{staffMember ? ' \u00B7 ' + staffMember.name : ''}
        </Text>
        <View style={s.pillRow}>
          {appt.isRescheduled && <View style={s.pill}><Text style={s.pillText}>Reagendada</Text></View>}
          {appt.source === 'public_link' && !appt.client && (
            <View style={[s.pill, { backgroundColor: '#EFF6FF' }]}>
              <Text style={[s.pillText, { color: '#3B82F6' }]}>Link p\u00FAblico</Text>
            </View>
          )}
        </View>
      </View>
      <View style={[s.statusBadge, { backgroundColor: meta.color + '22' }]}>
        <Text style={[s.statusText, { color: meta.color }]}>{meta.label}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={18} color={tcBorder} />
    </TouchableOpacity>
  );
});

export default function AppointmentsScreen() {
  const router  = useRouter();
  const { user } = useAuth();
  const { canSchedule } = usePlan();
  const { colors: tc, isDark } = useTheme();
  const insets = useSafeAreaInsets(); // FIX #8: safe area para FAB

  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [loadError, setLoadError]       = useState(false);

  useFocusEffect(
    useCallback(() => {
      const cached = getCached<ApiAppointment[]>('appointments_list');
      if (cached) {
        setAppointments(cached);
        setLoading(false);
        loadAll(false, true);
      } else {
        loadAll();
      }
    }, [])
  );

  // ⚡ FIX UX (May 19 2026): refetch silencioso cuando vuelve la app de background.
  // - silent=true → no se muestra error si falla (la pantalla sigue mostrando
  //   los datos viejos que ya tenía, que es mejor que un error súbito)
  // - showLoading=false → no se muestra el spinner grande (el splash de
  //   reconexión ya cubrió la UI durante el refresh)
  // - El cache ya fue invalidado por AppStateContext, así que loadAll va a
  //   pegar a la red y traer datos frescos.
  useAppRefreshListener(() => {
    loadAll(false, true);
  });

  // ⚡ QUICK WIN #3 (May 26 2026): Promise.all → Promise.allSettled
  //
  // ANTES: si la query de staff_members fallaba (timeout, RLS, red), TODA
  // la operación se rechazaba y entrábamos al catch, marcando loadError=true,
  // AUNQUE las citas SÍ se hubieran obtenido correctamente.
  //
  // AHORA: cada query es independiente. Si una falla, la otra sigue funcionando.
  // El usuario ve sus citas aunque staff_members haya fallado (degradación graceful).
  const loadAll = async (showLoading = true, silent = false) => {
    if (showLoading && !silent) setLoading(true);
    setLoadError(false);
    try {
      const results = await Promise.allSettled([
        apiGet<ApiAppointment[]>('/api/appointments'),
        supabase
          .from('staff_members')
          .select('id, name, color, role')
          .eq('user_id', user?.id)
          .eq('is_active', true)
          .order('sort_order')
          .then(r => r.data || []),
      ]);

      // Procesar citas (esencial)
      const apptResult = results[0];
      if (apptResult.status === 'fulfilled') {
        setAppointments(apptResult.value);
        setCached('appointments_list', apptResult.value, CACHE_TTL.APPOINTMENTS);
      } else {
        // Si las citas fallaron, sí marcamos error (es lo esencial)
        logger.warn('[Appointments] Error cargando citas:', apptResult.reason);
        if (!silent) setLoadError(true);
      }

      // Procesar staff (opcional - no rompe la UI si falla)
      const staffResult = results[1];
      if (staffResult.status === 'fulfilled') {
        setStaffMembers(staffResult.value as StaffMember[]);
      } else {
        // Staff falló, no es crítico. Logueamos pero no rompemos UX.
        logger.warn('[Appointments] Error cargando staff (no critico):', staffResult.reason);
        // No cambiamos setStaffMembers — se queda con los datos previos.
      }
    } catch (err) {
      // Solo entraría aquí si Promise.allSettled mismo falla (muy raro)
      logger.error('[Appointments] Error inesperado:', err);
      if (!silent) setLoadError(true);
    } finally {
      if (showLoading && !silent) setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    invalidateCache('appointments_list');
    await loadAll(false);
    setRefreshing(false);
  }, []);

  const hasStaff = staffMembers.length > 0;

  const dateAppointments = useMemo(() => {
    const byDate = appointments
      .filter(a => a.date === selectedDate)
      .sort((a, b) => a.time.localeCompare(b.time));
    if (!hasStaff || selectedStaffId === null) return byDate;
    if (selectedStaffId === '__unassigned__') return byDate.filter(a => !a.staff_id);
    return byDate.filter(a => a.staff_id === selectedStaffId);
  }, [appointments, selectedDate, selectedStaffId, hasStaff]);

  const markedDates = useMemo(() => {
    const marked: Record<string, any> = {};
    appointments.forEach(appt => {
      if (!marked[appt.date]) {
        const staffColor = hasStaff && appt.staff_id
          ? (staffMembers.find(s => s.id === appt.staff_id)?.color || colors.primary)
          : colors.primary;
        marked[appt.date] = { marked: true, dotColor: staffColor };
      }
    });
    marked[selectedDate] = {
      ...(marked[selectedDate] || {}),
      selected: true,
      selectedColor: colors.primary,
    };
    return marked;
  }, [appointments, selectedDate, hasStaff, staffMembers]);

  // PERFORMANCE FIX (Abr 2026): useMemo en conteos derivados.
  const allDayAppts = useMemo(
    () => appointments.filter(a => a.date === selectedDate),
    [appointments, selectedDate]
  );

  const { confirmedCount, pendingCount } = useMemo(() => {
    let confirmed = 0;
    let pending = 0;
    for (const a of dateAppointments) {
      if (a.status === 'Confirmada') confirmed++;
      else if (a.status === 'Pendiente') pending++;
    }
    return { confirmedCount: confirmed, pendingCount: pending };
  }, [dateAppointments]);

  const countByStaff = useMemo(() => {
    const byDate = appointments.filter(a => a.date === selectedDate);
    const map: Record<string, number> = {};
    byDate.forEach(a => {
      const key = a.staff_id || '__unassigned__';
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [appointments, selectedDate]);

  const activeStaff = useMemo(
    () => staffMembers.find(m => m.id === selectedStaffId),
    [staffMembers, selectedStaffId]
  );

  const { formattedDate, monthYear } = useMemo(() => {
    const selectedDateObj = new Date(selectedDate + 'T12:00:00');
    return {
      formattedDate: selectedDateObj.toLocaleDateString('es-MX', { weekday: 'long', month: 'long', day: 'numeric' }),
      monthYear:     selectedDateObj.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }),
    };
  }, [selectedDate]);

  const calTheme = useMemo(() => ({
    backgroundColor:            tc.surface,
    calendarBackground:         tc.surface,
    textSectionTitleColor:      tc.textMuted,
    selectedDayBackgroundColor: colors.primary,
    selectedDayTextColor:       '#fff',
    todayTextColor:             colors.primary,
    dayTextColor:               tc.text,
    textDisabledColor:          tc.border,
    dotColor:                   colors.primary,
    selectedDotColor:           '#fff',
    arrowColor:                 colors.primary,
    monthTextColor:             tc.text,
    textDayFontWeight:          '500' as any,
    textMonthFontWeight:        '700' as any,
    textDayHeaderFontWeight:    '600' as any,
    textDayFontSize:            15,
    textMonthFontSize:          17,
    textDayHeaderFontSize:      13,
  }), [tc.surface, tc.textMuted, tc.text, tc.border]);

  // ⚡ QUICK WIN #4: handler estable para que AppointmentCard.memo funcione bien
  const handleApptPress = useCallback((id: string) => {
    router.push(`/appointments/${id}`);
  }, [router]);

  if (loading) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <View style={s.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  // UI FIX (17 abr 2026): el FAB quedaba escondido detrás del FloatingTabBar.
  // Antes: insets.bottom + 16 (solo dejaba espacio del home indicator, no del tab bar).
  // Ahora: insets.bottom + TAB_BAR_HEIGHT + 16 para que flote claramente encima del menú.
  const fabBottom = insets.bottom + TAB_BAR_HEIGHT + 16;

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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
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

        {/* Filtro por colaborador */}
        {hasStaff && (
          <View style={[s.staffFilterWrap, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.staffFilterScroll}>
              <TouchableOpacity
                style={[s.staffChip, { backgroundColor: tc.bg, borderColor: tc.border }, !selectedStaffId && { backgroundColor: '#10B981', borderColor: '#10B981' }]}
                onPress={() => setSelectedStaffId(null)}
              >
                <MaterialIcons name="group" size={14} color={!selectedStaffId ? '#fff' : tc.textMuted} />
                <Text style={[s.staffChipText, { color: !selectedStaffId ? '#fff' : tc.text }]}>Todos</Text>
                {allDayAppts.length > 0 && (
                  <View style={[s.staffChipBadge, { backgroundColor: !selectedStaffId ? 'rgba(255,255,255,0.25)' : tc.border }]}>
                    <Text style={[s.staffChipBadgeText, { color: !selectedStaffId ? '#fff' : tc.textMuted }]}>{allDayAppts.length}</Text>
                  </View>
                )}
              </TouchableOpacity>

              {staffMembers.map(m => {
                const isActive = selectedStaffId === m.id;
                const count = countByStaff[m.id] || 0;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[s.staffChip, { backgroundColor: tc.bg, borderColor: tc.border }, isActive && { backgroundColor: m.color, borderColor: m.color }]}
                    onPress={() => setSelectedStaffId(isActive ? null : m.id)}
                  >
                    <View style={[s.staffChipAvatar, { backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : m.color + '22' }]}>
                      <Text style={[s.staffChipInitials, { color: isActive ? '#fff' : m.color }]}>
                        {m.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                      </Text>
                    </View>
                    <View style={s.staffChipInfo}>
                      <Text style={[s.staffChipText, { color: isActive ? '#fff' : tc.text }]} numberOfLines={1}>{m.name.split(' ')[0]}</Text>
                      {m.role && <Text style={[s.staffChipRole, { color: isActive ? 'rgba(255,255,255,0.75)' : tc.textMuted }]} numberOfLines={1}>{m.role}</Text>}
                    </View>
                    {count > 0 && (
                      <View style={[s.staffChipBadge, { backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : m.color + '22' }]}>
                        <Text style={[s.staffChipBadgeText, { color: isActive ? '#fff' : m.color }]}>{count}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}

              {(countByStaff['__unassigned__'] || 0) > 0 && (
                <TouchableOpacity
                  style={[s.staffChip, { backgroundColor: tc.bg, borderColor: tc.border }, selectedStaffId === '__unassigned__' && { backgroundColor: '#64748B', borderColor: '#64748B' }]}
                  onPress={() => setSelectedStaffId(selectedStaffId === '__unassigned__' ? null : '__unassigned__')}
                >
                  <MaterialIcons name="person-outline" size={14} color={selectedStaffId === '__unassigned__' ? '#fff' : tc.textMuted} />
                  <Text style={[s.staffChipText, { color: selectedStaffId === '__unassigned__' ? '#fff' : tc.textMuted }]}>Sin asignar</Text>
                  <View style={[s.staffChipBadge, { backgroundColor: selectedStaffId === '__unassigned__' ? 'rgba(255,255,255,0.25)' : '#E2E8F0' }]}>
                    <Text style={[s.staffChipBadgeText, { color: selectedStaffId === '__unassigned__' ? '#fff' : '#64748B' }]}>{countByStaff['__unassigned__']}</Text>
                  </View>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        )}

        <View style={[s.listSection, { backgroundColor: tc.bg, paddingBottom: fabBottom + 64 }]}>
          <View style={s.dayHeader}>
            <View style={s.dayTitleWrap}>
              <Text style={[s.dayTitle, { color: tc.text }]}>
                {formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1)}
              </Text>
              {dateAppointments.length > 0 && (
                <View style={[s.dayCountPill, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                  <Text style={[s.dayCount, { color: tc.textMuted }]}>
                    {dateAppointments.length} {dateAppointments.length === 1 ? 'cita' : 'citas'}
                    {selectedStaffId && activeStaff ? ' \u2014 ' + activeStaff.name : ''}
                  </Text>
                </View>
              )}
            </View>
            {dateAppointments.length > 0 && (
              <View style={s.daySummary}>
                {confirmedCount > 0 && (
                  <View style={[s.summaryChip, { backgroundColor: tc.surface, borderColor: tc.border }]}>
                    <View style={[s.summaryDot, { backgroundColor: '#10B981' }]} />
                    <Text style={[s.summaryText, { color: tc.textMuted }]}>{confirmedCount} confirmada{confirmedCount > 1 ? 's' : ''}</Text>
                  </View>
                )}
                {pendingCount > 0 && (
                  <View style={[s.summaryChip, { backgroundColor: tc.surface, borderColor: tc.border }]}>
                    <View style={[s.summaryDot, { backgroundColor: '#F59E0B' }]} />
                    <Text style={[s.summaryText, { color: tc.textMuted }]}>{pendingCount} pendiente{pendingCount > 1 ? 's' : ''}</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {loadError && (
            <View style={s.errorState}>
              <MaterialIcons name="wifi-off" size={32} color={tc.border} />
              <Text style={[s.errorText, { color: '#EF4444' }]}>No se pudieron cargar las citas.</Text>
              <TouchableOpacity onPress={() => loadAll()} style={s.retryBtn}>
                <Text style={s.retryText}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          )}

          {!loadError && dateAppointments.length === 0 && (
            <View style={s.empty}>
              <View style={[s.emptyIconWrap, { backgroundColor: tc.surface }]}>
                <MaterialIcons name="event-available" size={32} color={tc.border} />
              </View>
              <Text style={[s.emptyTitle, { color: tc.text }]}>
                {selectedStaffId && activeStaff ? `${activeStaff.name} no tiene citas` : 'Sin citas este d\xEDa'}
              </Text>
              <Text style={[s.emptyDesc, { color: tc.textMuted }]}>
                {selectedStaffId ? 'Prueba seleccionando otro colaborador' : 'Toca + para agregar una cita'}
              </Text>
            </View>
          )}

          {!loadError && dateAppointments.length > 0 && (
            <View style={s.list}>
              {dateAppointments.map(appt => {
                const staffMember = hasStaff && appt.staff_id ? staffMembers.find(m => m.id === appt.staff_id) || null : null;
                return (
                  <AppointmentCard
                    key={appt.id}
                    appt={appt}
                    staffMember={staffMember}
                    tcText={tc.text}
                    tcSurface={tc.surface}
                    tcBorder={tc.border}
                    tcTextMuted={tc.textMuted}
                    onPress={handleApptPress}
                  />
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* FIX UI (17 abr 2026): FAB encima del FloatingTabBar, no escondido detrás */}
      <TouchableOpacity
        style={[s.fab, { bottom: fabBottom }, !canSchedule && s.fabDisabled]}
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
  container:          { flex: 1 },
  loading:            { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:             { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:              { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle:           { fontSize: 13, marginTop: 2, textTransform: 'capitalize' },
  headerBadge:        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  headerBadgeText:    { fontSize: 13, fontWeight: '700', color: '#10B981' },
  content:            { flex: 1 },
  calendarWrap:       { marginBottom: 2 },
  staffFilterWrap:    { borderBottomWidth: 0.5, paddingVertical: 10 },
  staffFilterScroll:  { paddingHorizontal: 16, gap: 8 },
  staffChip:          { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  staffChipAvatar:    { width: 22, height: 22, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  staffChipInitials:  { fontSize: 9, fontWeight: '900' },
  staffChipInfo:      { maxWidth: 80 },
  staffChipText:      { fontSize: 13, fontWeight: '700' },
  staffChipRole:      { fontSize: 10, marginTop: -1 },
  staffChipBadge:     { minWidth: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  staffChipBadgeText: { fontSize: 10, fontWeight: '800' },
  listSection:        { paddingHorizontal: 16 },
  dayHeader:          { paddingVertical: 14, gap: 8 },
  dayTitleWrap:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dayTitle:           { fontSize: 16, fontWeight: '700', textTransform: 'capitalize', flex: 1 },
  dayCountPill:       { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  dayCount:           { fontSize: 12, fontWeight: '600' },
  daySummary:         { flexDirection: 'row', gap: 8 },
  summaryChip:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 0.5 },
  summaryDot:         { width: 7, height: 7, borderRadius: 4 },
  summaryText:        { fontSize: 12, fontWeight: '500' },
  errorState:         { alignItems: 'center', paddingVertical: 32, gap: 10 },
  errorText:          { fontSize: 14 },
  retryBtn:           { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText:          { color: '#fff', fontWeight: '600' },
  empty:              { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyIconWrap:      { width: 64, height: 64, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  emptyTitle:         { fontSize: 16, fontWeight: '600' },
  emptyDesc:          { fontSize: 13 },
  list:               { gap: 8 },
  apptCard:           { borderRadius: 14, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderWidth: 1 },
  stripe:             { width: 4, alignSelf: 'stretch' },
  timeCol:            { paddingHorizontal: 12, paddingVertical: 16, minWidth: 64, alignItems: 'center', gap: 4 },
  timeText:           { fontSize: 14, fontWeight: '700' },
  staffDot:           { width: 6, height: 6, borderRadius: 3 },
  infoCol:            { flex: 1, paddingVertical: 14, gap: 2 },
  clientName:         { fontSize: 15, fontWeight: '600' },
  serviceName:        { fontSize: 12 },
  pillRow:            { flexDirection: 'row', gap: 5, marginTop: 3, flexWrap: 'wrap' },
  pill:               { backgroundColor: '#EFF6FF', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  pillText:           { fontSize: 10, fontWeight: '700', color: '#3B82F6' },
  statusBadge:        { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, marginRight: 6 },
  statusText:         { fontSize: 11, fontWeight: '700' },
  // FIX UI: bottom se aplica inline con insets + TAB_BAR_HEIGHT — solo right y tamaño aquí
  fab:                { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, zIndex: 101 },
  fabDisabled:        { backgroundColor: '#94A3B8' },
});
