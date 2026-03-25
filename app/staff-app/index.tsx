import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

function formatWeekday(d: Date) {
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function StaffHomeScreen() {
  const router = useRouter();
  const { staffMemberData, signOut } = useAuth();
  const { colors: tc } = useTheme();

  const today    = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);

  const [selectedDate, setSelectedDate] = useState(today);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const orgUserId = staffMemberData?.organizationUserId ?? '';
  const myStaffId = staffMemberData?.id ?? '';

  const loadAppointments = async (isPull = false) => {
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
  };

  useFocusEffect(useCallback(() => { loadAppointments(); }, [selectedDate, orgUserId]));

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const isMyAppointment = (a: Appointment) => a.staff_id === myStaffId;

  const dateOptions = [
    { label: 'Hoy',    date: today },
    { label: 'Mañana', date: tomorrow },
  ];

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>
      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.greeting, { color: tc.textMuted }]}>{getGreeting()},</Text>
          <Text style={[s.name, { color: tc.text }]}>{staffMemberData?.name ?? 'Colaborador'}</Text>
        </View>
        <TouchableOpacity
          style={[s.signOutBtn, { backgroundColor: tc.bg, borderColor: tc.border }]}
          onPress={() => signOut()}
          activeOpacity={0.7}
        >
          <MaterialIcons name="logout" size={18} color={tc.textMuted} />
        </TouchableOpacity>
      </View>

      {/* ── Date selector ── */}
      <View style={[s.dateTabs, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        {dateOptions.map(opt => {
          const active = toDateStr(opt.date) === toDateStr(selectedDate);
          return (
            <TouchableOpacity
              key={opt.label}
              style={[s.dateTab, active && { borderBottomColor: '#10B981', borderBottomWidth: 2 }]}
              onPress={() => setSelectedDate(opt.date)}
              activeOpacity={0.7}
            >
              <Text style={[s.dateTabLabel, { color: active ? '#10B981' : tc.textMuted }]}>{opt.label}</Text>
              <Text style={[s.dateTabSub, { color: active ? '#10B981' : tc.textMuted }]}>
                {opt.date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Content ── */}
      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color="#10B981" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadAppointments(true)} tintColor="#10B981" colors={['#10B981']} />
          }
        >
          <Text style={[s.dateTitle, { color: tc.text }]}>
            {formatWeekday(selectedDate).charAt(0).toUpperCase() + formatWeekday(selectedDate).slice(1)}
          </Text>
          <Text style={[s.countLabel, { color: tc.textMuted }]}>
            {appointments.length === 0 ? 'Sin citas' : `${appointments.length} cita${appointments.length > 1 ? 's' : ''} · ${appointments.filter(isMyAppointment).length} tuyas`}
          </Text>

          {appointments.length === 0 ? (
            <View style={[s.emptyCard, { backgroundColor: tc.surface, borderColor: tc.border }]}>
              <MaterialIcons name="event-available" size={32} color={tc.border} />
              <Text style={[s.emptyText, { color: tc.textMuted }]}>Agenda libre</Text>
            </View>
          ) : (
            appointments.map(appt => {
              const mine = isMyAppointment(appt);
              const statusColor = getStatusColor(appt.status);
              const clientName = appt.client?.name ?? appt.client_name_temp ?? 'Cliente';
              const staffName  = (appt.staff as any)?.name ?? null;
              const staffColor = (appt.staff as any)?.color ?? '#94A3B8';

              return (
                <TouchableOpacity
                  key={appt.id}
                  style={[
                    s.apptCard,
                    { backgroundColor: tc.surface, borderColor: mine ? '#10B981' : tc.border },
                    mine && s.apptCardMine,
                  ]}
                  onPress={() => router.push(`/staff-app/appointment/${appt.id}`)}
                  activeOpacity={0.75}
                >
                  {/* Acento lateral */}
                  <View style={[s.apptAccent, { backgroundColor: staffColor }]} />

                  <View style={s.apptTimeBox}>
                    <Text style={[s.apptTime, { color: tc.text }]}>{appt.start_time.slice(0, 5)}</Text>
                  </View>

                  <View style={s.apptBody}>
                    <Text style={[s.apptClient, { color: tc.text }]} numberOfLines={1}>{clientName}</Text>
                    <Text style={[s.apptService, { color: tc.textMuted }]} numberOfLines={1}>
                      {appt.service_name}{staffName ? ` · ${staffName}` : ''}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={[s.statusBadge, { backgroundColor: statusColor + '22' }]}>
                      <Text style={[s.statusText, { color: statusColor }]}>{appt.status}</Text>
                    </View>
                    {mine && (
                      <View style={s.mineBadge}>
                        <Text style={s.mineText}>Tuya</Text>
                      </View>
                    )}
                  </View>

                  <MaterialIcons name="chevron-right" size={18} color={tc.border} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              );
            })
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* ── FAB Nueva cita ── */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => router.push('/staff-app/new-appointment')}
        activeOpacity={0.85}
      >
        <MaterialIcons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1 },
  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  greeting:     { fontSize: 13, fontWeight: '500' },
  name:         { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  signOutBtn:   { width: 38, height: 38, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  dateTabs:     { flexDirection: 'row', borderBottomWidth: 0.5 },
  dateTab:      { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  dateTabLabel: { fontSize: 14, fontWeight: '700' },
  dateTabSub:   { fontSize: 11, marginTop: 2 },
  scroll:       { padding: 16 },
  dateTitle:    { fontSize: 17, fontWeight: '700', marginBottom: 2 },
  countLabel:   { fontSize: 13, marginBottom: 16 },
  emptyCard:    { borderRadius: 16, borderWidth: 1, padding: 32, alignItems: 'center', gap: 8 },
  emptyText:    { fontSize: 14, fontWeight: '500' },
  apptCard:     { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, marginBottom: 8, overflow: 'hidden' },
  apptCardMine: { borderWidth: 1.5 },
  apptAccent:   { width: 3, alignSelf: 'stretch' },
  apptTimeBox:  { paddingHorizontal: 12, paddingVertical: 16, minWidth: 58, alignItems: 'center' },
  apptTime:     { fontSize: 14, fontWeight: '700' },
  apptBody:     { flex: 1, paddingVertical: 14 },
  apptClient:   { fontSize: 15, fontWeight: '600' },
  apptService:  { fontSize: 12, marginTop: 2 },
  statusBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText:   { fontSize: 10, fontWeight: '700' },
  mineBadge:    { backgroundColor: '#ECFDF5', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  mineText:     { fontSize: 10, fontWeight: '700', color: '#10B981' },
  fab:          { position: 'absolute', bottom: 28, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center', shadowColor: '#10B981', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
});
