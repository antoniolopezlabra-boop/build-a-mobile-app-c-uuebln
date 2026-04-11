import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import { getStatusColor } from '@/utils/appointmentUtils';

interface Appointment {
  id: string;
  start_time: string;
  end_time: string | null;
  service_name: string;
  status: string;
  staff_id: string | null;
  notes: string | null;
  client: { name: string; phone: string } | null;
  client_name_temp: string | null;
  staff: { id: string; name: string; color: string } | null;
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WEEKDAYS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const MONTHS   = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function StaffHomeScreen() {
  const router = useRouter();
  const { staffMemberData, signOut } = useAuth();
  const { colors: tc } = useTheme();
  const insets = useSafeAreaInsets();

  const today = useMemo(() => new Date(), []);

  const [calYear,  setCalYear]  = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(today);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [monthDots, setMonthDots] = useState<Record<string, { mine: boolean; others: boolean }>>({});

  const orgUserId = staffMemberData?.organizationUserId ?? '';
  const myStaffId = staffMemberData?.id ?? '';

  const loadAppointments = useCallback(async (isPull = false) => {
    if (!orgUserId) return;
    if (isPull) setRefreshing(true); else setLoading(true);
    try {
      const dateStr = toDateStr(selectedDate);
      const { data, error } = await supabase
        .from('appointments')
        .select('id, start_time, end_time, service_name, status, staff_id, notes, client_name_temp, client:clients(name, phone), staff:staff_members(id, name, color)')
        .eq('user_id', orgUserId)
        .eq('date', dateStr)
        .order('start_time');
      if (error) throw error;
      setAppointments((data ?? []) as unknown as Appointment[]);
    } catch (e) {
      console.warn('[StaffHome] loadAppointments error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate, orgUserId]);

  const loadMonthDots = useCallback(async () => {
    if (!orgUserId) return;
    try {
      const firstDay = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-01`;
      const lastDay  = new Date(calYear, calMonth + 1, 0);
      const lastDayStr = toDateStr(lastDay);
      const { data } = await supabase
        .from('appointments')
        .select('date, staff_id')
        .eq('user_id', orgUserId)
        .gte('date', firstDay)
        .lte('date', lastDayStr);

      const dots: Record<string, { mine: boolean; others: boolean }> = {};
      for (const appt of data ?? []) {
        if (!dots[appt.date]) dots[appt.date] = { mine: false, others: false };
        if (appt.staff_id === myStaffId) dots[appt.date].mine    = true;
        else                              dots[appt.date].others = true;
      }
      setMonthDots(dots);
    } catch (e) {
      console.warn('[StaffHome] loadMonthDots error:', e);
    }
  }, [calYear, calMonth, orgUserId, myStaffId]);

  useFocusEffect(useCallback(() => {
    loadAppointments();
    loadMonthDots();
  }, [loadAppointments, loadMonthDots]));

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  };

  const calDays = useMemo(() => {
    const first   = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells: (number | null)[] = Array(first).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calYear, calMonth]);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const isMyAppointment = (a: Appointment) => a.staff_id === myStaffId;

  const formattedSelectedDate = selectedDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

  // FAB bottom respetando safe area
  const fabBottom = insets.bottom + 16;

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>
      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.greeting, { color: tc.textMuted }]}>{getGreeting()},</Text>
          <Text style={[s.name, { color: tc.text }]}>{staffMemberData?.name ?? 'Colaborador'}</Text>
        </View>
        {/* Botón perfil */}
        <TouchableOpacity
          style={[s.headerBtn, { backgroundColor: tc.bg, borderColor: tc.border, marginRight: 8 }]}
          onPress={() => router.push('/staff-app/profile')}
          activeOpacity={0.7}
        >
          <MaterialIcons name="person-outline" size={18} color={tc.textMuted} />
        </TouchableOpacity>
        {/* Botón logout */}
        <TouchableOpacity
          style={[s.headerBtn, { backgroundColor: tc.bg, borderColor: tc.border }]}
          onPress={() => signOut()}
          activeOpacity={0.7}
        >
          <MaterialIcons name="logout" size={18} color={tc.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { loadAppointments(true); loadMonthDots(); }}
            tintColor="#10B981" colors={['#10B981']}
          />
        }
      >
        {/* ── Calendario mensual ── */}
        <View style={[s.calContainer, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
          <View style={s.calNav}>
            <TouchableOpacity onPress={prevMonth} style={s.calNavBtn} activeOpacity={0.7}>
              <MaterialIcons name="chevron-left" size={24} color={tc.text} />
            </TouchableOpacity>
            <Text style={[s.calMonthTitle, { color: tc.text }]}>
              {MONTHS[calMonth]} {calYear}
            </Text>
            <TouchableOpacity onPress={nextMonth} style={s.calNavBtn} activeOpacity={0.7}>
              <MaterialIcons name="chevron-right" size={24} color={tc.text} />
            </TouchableOpacity>
          </View>

          <View style={s.calWeekRow}>
            {WEEKDAYS.map(d => (
              <Text key={d} style={[s.calWeekDay, { color: tc.textMuted }]}>{d}</Text>
            ))}
          </View>

          <View style={s.calGrid}>
            {calDays.map((day, idx) => {
              if (!day) return <View key={`e-${idx}`} style={s.calCell} />;

              const dateObj  = new Date(calYear, calMonth, day);
              const dateStr  = toDateStr(dateObj);
              const isToday  = dateStr === toDateStr(today);
              const isSelected = dateStr === toDateStr(selectedDate);
              const dots     = monthDots[dateStr];

              return (
                <TouchableOpacity
                  key={dateStr}
                  style={s.calCell}
                  onPress={() => setSelectedDate(dateObj)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    s.calDayCircle,
                    isSelected && { backgroundColor: '#10B981' },
                    isToday && !isSelected && { borderWidth: 1.5, borderColor: '#10B981' },
                  ]}>
                    <Text style={[
                      s.calDayText,
                      { color: tc.text },
                      isSelected && { color: '#fff', fontWeight: '800' },
                      isToday && !isSelected && { color: '#10B981', fontWeight: '700' },
                    ]}>{day}</Text>
                  </View>
                  {dots && (
                    <View style={s.dotsRow}>
                      {dots.mine    && <View style={[s.dot, { backgroundColor: '#10B981' }]} />}
                      {dots.others  && <View style={[s.dot, { backgroundColor: '#94A3B8' }]} />}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Leyenda ── */}
        <View style={[s.legend, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
          <View style={s.legendItem}>
            <View style={[s.dot, { backgroundColor: '#10B981' }]} />
            <Text style={[s.legendText, { color: tc.textMuted }]}>Mis citas</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.dot, { backgroundColor: '#94A3B8' }]} />
            <Text style={[s.legendText, { color: tc.textMuted }]}>Otros colaboradores</Text>
          </View>
        </View>

        {/* ── Lista de citas ── */}
        <View style={s.listSection}>
          <Text style={[s.dateTitle, { color: tc.text }]}>
            {formattedSelectedDate.charAt(0).toUpperCase() + formattedSelectedDate.slice(1)}
          </Text>

          {loading ? (
            <View style={s.centered}><ActivityIndicator color="#10B981" /></View>
          ) : appointments.length === 0 ? (
            <View style={[s.emptyCard, { backgroundColor: tc.surface, borderColor: tc.border }]}>
              <MaterialIcons name="event-available" size={28} color={tc.border} />
              <Text style={[s.emptyText, { color: tc.textMuted }]}>Sin citas este día</Text>
            </View>
          ) : (
            <>
              <Text style={[s.countLabel, { color: tc.textMuted }]}>
                {appointments.length} cita{appointments.length > 1 ? 's' : ''}  ·  {appointments.filter(isMyAppointment).length} mías
              </Text>

              {appointments.map(appt => {
                const mine        = isMyAppointment(appt);
                const statusColor = getStatusColor(appt.status);
                const clientName  = appt.client?.name ?? appt.client_name_temp ?? 'Cliente';
                const staffName   = (appt.staff as any)?.name ?? null;
                const staffColor  = (appt.staff as any)?.color ?? '#94A3B8';

                const handlePress = mine
                  ? () => router.push(`/staff-app/appointment/${appt.id}`)
                  : undefined;

                return (
                  <TouchableOpacity
                    key={appt.id}
                    style={[
                      s.apptCard,
                      { backgroundColor: tc.surface, borderColor: mine ? '#10B981' : tc.border },
                      mine && s.apptCardMine,
                      !mine && s.apptCardOther,
                    ]}
                    onPress={handlePress}
                    activeOpacity={mine ? 0.75 : 1}
                    disabled={!mine}
                  >
                    <View style={[s.apptAccent, { backgroundColor: staffColor }]} />
                    <View style={s.apptTimeBox}>
                      <Text style={[s.apptTime, { color: mine ? tc.text : tc.textMuted }]}>
                        {appt.start_time.slice(0, 5)}
                      </Text>
                    </View>
                    <View style={s.apptBody}>
                      <Text style={[s.apptClient, { color: mine ? tc.text : tc.textMuted }]} numberOfLines={1}>
                        {mine ? clientName : '••••••'}
                      </Text>
                      <Text style={[s.apptService, { color: tc.textMuted }]} numberOfLines={1}>
                        {appt.service_name}{staffName ? `  ·  ${staffName}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <View style={[s.statusBadge, { backgroundColor: statusColor + '22' }]}>
                        <Text style={[s.statusText, { color: statusColor }]}>{appt.status}</Text>
                      </View>
                      {mine ? (
                        <View style={s.mineBadge}>
                          <Text style={s.mineText}>Mía</Text>
                        </View>
                      ) : (
                        <View style={[s.mineBadge, { backgroundColor: '#F1F5F9' }]}>
                          <Text style={[s.mineText, { color: '#94A3B8' }]}>Ajena</Text>
                        </View>
                      )}
                    </View>
                    {mine
                      ? <MaterialIcons name="chevron-right" size={18} color={tc.border} style={{ marginLeft: 4 }} />
                      : <MaterialIcons name="lock" size={14} color={tc.border} style={{ marginLeft: 4 }} />
                    }
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </View>

        <View style={{ height: fabBottom + 72 }} />
      </ScrollView>

      {/* ── FAB Nueva cita — respeta safe area ── */}
      <TouchableOpacity
        style={[s.fab, { bottom: fabBottom }]}
        onPress={() => router.push('/staff-app/new-appointment')}
        activeOpacity={0.85}
      >
        <MaterialIcons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1 },
  centered:      { paddingVertical: 30, alignItems: 'center' },
  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  greeting:      { fontSize: 13, fontWeight: '500' },
  name:          { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  headerBtn:     { width: 38, height: 38, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  calContainer:  { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5 },
  calNav:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  calNavBtn:     { padding: 6 },
  calMonthTitle: { fontSize: 16, fontWeight: '700' },
  calWeekRow:    { flexDirection: 'row', marginBottom: 4 },
  calWeekDay:    { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  calGrid:       { flexDirection: 'row', flexWrap: 'wrap' },
  calCell:       { width: '14.28%', alignItems: 'center', paddingVertical: 3 },
  calDayCircle:  { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  calDayText:    { fontSize: 14 },
  dotsRow:       { flexDirection: 'row', gap: 2, marginTop: 2 },
  dot:           { width: 5, height: 5, borderRadius: 3 },
  legend:        { flexDirection: 'row', gap: 20, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5 },
  legendItem:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText:    { fontSize: 11, fontWeight: '500' },
  listSection:   { padding: 16 },
  dateTitle:     { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  countLabel:    { fontSize: 13, marginBottom: 12 },
  emptyCard:     { borderRadius: 16, borderWidth: 1, padding: 32, alignItems: 'center', gap: 8, marginTop: 8 },
  emptyText:     { fontSize: 14, fontWeight: '500' },
  apptCard:      { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, marginBottom: 8, overflow: 'hidden' },
  apptCardMine:  { borderWidth: 1.5 },
  apptCardOther: { opacity: 0.7 },
  apptAccent:    { width: 3, alignSelf: 'stretch' },
  apptTimeBox:   { paddingHorizontal: 12, paddingVertical: 16, minWidth: 58, alignItems: 'center' },
  apptTime:      { fontSize: 14, fontWeight: '700' },
  apptBody:      { flex: 1, paddingVertical: 14 },
  apptClient:    { fontSize: 15, fontWeight: '600' },
  apptService:   { fontSize: 12, marginTop: 2 },
  statusBadge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText:    { fontSize: 10, fontWeight: '700' },
  mineBadge:     { backgroundColor: '#ECFDF5', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  mineText:      { fontSize: 10, fontWeight: '700', color: '#10B981' },
  fab:           { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center', shadowColor: '#10B981', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
});
