import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Modal, Alert, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import { getStatusColor } from '@/utils/appointmentUtils';

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface AppointmentDetail {
  id: string;
  date: string;
  start_time: string;
  end_time: string | null;
  service_name: string;
  service_cost: number | null;
  status: string;
  notes: string | null;
  staff_id: string | null;
  client: { id: string; name: string; phone: string } | null;
  client_name_temp: string | null;
  client_phone_temp: string | null;
  staff: { name: string; color: string } | null;
}

const ACTIONABLE_STATUSES = ['Pendiente', 'Confirmada'];

export default function StaffAppointmentDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: tc } = useTheme();

  const [appt, setAppt]       = useState<AppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  // Modal de nota
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState('');

  // Modal de reagenda
  const [showReschedule, setShowReschedule]         = useState(false);
  const [rescheduleDate, setRescheduleDate]         = useState(new Date());
  const [rescheduleTime, setRescheduleTime]         = useState('09:00');
  const [showDatePicker, setShowDatePicker]         = useState(false);
  const [showTimePicker, setShowTimePicker]         = useState(false);

  useEffect(() => { loadAppointment(); }, [id]);

  const loadAppointment = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, date, start_time, end_time, service_name, service_cost, status, notes, staff_id, client_name_temp, client_phone_temp, client:clients(id, name, phone), staff:staff_members(name, color)')
        .eq('id', id)
        .single();
      if (error) throw error;
      setAppt(data as unknown as AppointmentDetail);
      setNoteText(data.notes ?? '');
    } catch (e) {
      console.warn('[StaffApptDetail] load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (newStatus: string) => {
    if (!appt) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', appt.id);
      if (error) throw error;
      setAppt(prev => prev ? { ...prev, status: newStatus } : prev);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo actualizar la cita');
    } finally {
      setSaving(false);
    }
  };

  const saveNote = async () => {
    if (!appt) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ notes: noteText.trim() || null, updated_at: new Date().toISOString() })
        .eq('id', appt.id);
      if (error) throw error;
      setAppt(prev => prev ? { ...prev, notes: noteText.trim() || null } : prev);
      setShowNoteModal(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo guardar la nota');
    } finally {
      setSaving(false);
    }
  };

  const openReschedule = () => {
    if (!appt) return;
    const [y, m, d] = appt.date.split('-').map(Number);
    setRescheduleDate(new Date(y, m - 1, d));
    setRescheduleTime(appt.start_time.slice(0, 5));
    setShowDatePicker(false);
    setShowTimePicker(false);
    setShowReschedule(true);
  };

  const confirmReschedule = async () => {
    if (!appt) return;
    setSaving(true);
    try {
      const dateStr = toDateStr(rescheduleDate);
      const [h, m] = rescheduleTime.split(':').map(Number);

      // Conservar la duración original si está disponible
      let durationMin = 30;
      if (appt.end_time) {
        const [sh, sm] = appt.start_time.split(':').map(Number);
        const [eh, em] = appt.end_time.split(':').map(Number);
        const dur = (eh * 60 + em) - (sh * 60 + sm);
        if (dur > 0) durationMin = dur;
      }
      const endMin = h * 60 + m + durationMin;
      const endTime = `${Math.floor(endMin / 60).toString().padStart(2, '0')}:${(endMin % 60).toString().padStart(2, '0')}`;

      const { error } = await supabase
        .from('appointments')
        .update({
          date: dateStr,
          start_time: rescheduleTime,
          end_time: endTime,
          status: 'Reagendada',
          updated_at: new Date().toISOString(),
        })
        .eq('id', appt.id);
      if (error) throw error;

      setAppt(prev => prev
        ? { ...prev, date: dateStr, start_time: rescheduleTime, end_time: endTime, status: 'Reagendada' }
        : prev
      );
      setShowReschedule(false);
      Alert.alert('¡Listo!', 'La cita fue reagendada correctamente.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo reagendar la cita');
    } finally {
      setSaving(false);
    }
  };

  const openWhatsApp = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    const mx = digits.startsWith('52') ? digits : `52${digits}`;
    Linking.openURL(`https://wa.me/${mx}`);
  };

  if (loading) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]}>
        <View style={s.centered}><ActivityIndicator size="large" color="#10B981" /></View>
      </SafeAreaView>
    );
  }

  if (!appt) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]}>
        <View style={s.centered}>
          <Text style={{ color: tc.textMuted }}>Cita no encontrada</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
            <Text style={{ color: '#10B981', fontWeight: '600' }}>Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = getStatusColor(appt.status);
  const clientName  = appt.client?.name ?? appt.client_name_temp ?? 'Cliente';
  const clientPhone = appt.client?.phone ?? appt.client_phone_temp ?? null;
  const isActionable = ACTIONABLE_STATUSES.includes(appt.status);
  const staffColor  = (appt.staff as any)?.color ?? '#94A3B8';

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <MaterialIcons name="arrow-back" size={24} color={tc.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: tc.text }]}>Detalle de cita</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Status pill */}
        <View style={[s.statusRow, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[s.statusLabel, { color: statusColor }]}>{appt.status}</Text>
        </View>

        {/* Cliente */}
        <View style={[s.card, { backgroundColor: tc.surface, borderColor: tc.border }]}>
          <Text style={[s.cardLabel, { color: tc.textMuted }]}>CLIENTE</Text>
          <Text style={[s.cardMain, { color: tc.text }]}>{clientName}</Text>
          {clientPhone && (
            <View style={s.phoneRow}>
              <TouchableOpacity style={s.phoneBtn} onPress={() => Linking.openURL(`tel:${clientPhone}`)}>
                <MaterialIcons name="phone" size={16} color="#10B981" />
                <Text style={s.phoneBtnText}>Llamar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.phoneBtn, { backgroundColor: '#DCFCE7' }]} onPress={() => openWhatsApp(clientPhone)}>
                <MaterialIcons name="chat" size={16} color="#16A34A" />
                <Text style={[s.phoneBtnText, { color: '#16A34A' }]}>WhatsApp</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Servicio y hora */}
        <View style={[s.card, { backgroundColor: tc.surface, borderColor: tc.border }]}>
          <Text style={[s.cardLabel, { color: tc.textMuted }]}>SERVICIO</Text>
          <Text style={[s.cardMain, { color: tc.text }]}>{appt.service_name}</Text>
          {appt.service_cost != null && appt.service_cost > 0 && (
            <Text style={[s.cardSub, { color: tc.textMuted }]}>
              ${appt.service_cost.toLocaleString('es-MX')} MXN
            </Text>
          )}
        </View>

        <View style={[s.card, { backgroundColor: tc.surface, borderColor: tc.border }]}>
          <Text style={[s.cardLabel, { color: tc.textMuted }]}>FECHA Y HORA</Text>
          <Text style={[s.cardMain, { color: tc.text }]}>
            {new Date(appt.date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          <Text style={[s.cardSub, { color: tc.textMuted }]}>
            {appt.start_time.slice(0, 5)}{appt.end_time ? ` – ${appt.end_time.slice(0, 5)}` : ''}
          </Text>
        </View>

        {/* Colaborador asignado */}
        {appt.staff && (
          <View style={[s.card, { backgroundColor: tc.surface, borderColor: tc.border }]}>
            <Text style={[s.cardLabel, { color: tc.textMuted }]}>COLABORADOR</Text>
            <View style={s.staffRow}>
              <View style={[s.staffDot, { backgroundColor: staffColor }]} />
              <Text style={[s.cardMain, { color: tc.text }]}>{(appt.staff as any).name}</Text>
            </View>
          </View>
        )}

        {/* Nota */}
        <View style={[s.card, { backgroundColor: tc.surface, borderColor: tc.border }]}>
          <View style={s.noteHeader}>
            <Text style={[s.cardLabel, { color: tc.textMuted }]}>NOTA</Text>
            <TouchableOpacity onPress={() => { setNoteText(appt.notes ?? ''); setShowNoteModal(true); }}>
              <Text style={s.editLink}>{appt.notes ? 'Editar' : 'Agregar'}</Text>
            </TouchableOpacity>
          </View>
          {appt.notes ? (
            <Text style={[s.noteText, { color: tc.text }]}>{appt.notes}</Text>
          ) : (
            <Text style={[s.noteEmpty, { color: tc.textMuted }]}>Sin nota</Text>
          )}
        </View>

        {/* Acciones */}
        <Text style={[s.sectionLabel, { color: tc.textMuted }]}>ACCIONES</Text>

        {isActionable && (
          <>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
              onPress={() => Alert.alert('Confirmar', '¿Marcar como completada?', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Sí', onPress: () => updateStatus('Completada') },
              ])}
              disabled={saving}
              activeOpacity={0.7}
            >
              <MaterialIcons name="check-circle-outline" size={20} color="#10B981" />
              <Text style={[s.actionText, { color: '#10B981' }]}>Marcar como completada</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}
              onPress={() => Alert.alert('Confirmar', '¿Marcar como no show?', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Sí', onPress: () => updateStatus('No asistió') },
              ])}
              disabled={saving}
              activeOpacity={0.7}
            >
              <MaterialIcons name="person-off" size={20} color="#F97316" />
              <Text style={[s.actionText, { color: '#F97316' }]}>No show</Text>
            </TouchableOpacity>
          </>
        )}

        {appt.status !== 'Cancelada' && appt.status !== 'Completada' && appt.status !== 'No asistió' && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
            onPress={openReschedule}
            disabled={saving}
            activeOpacity={0.7}
          >
            <MaterialIcons name="event-repeat" size={20} color="#3B82F6" />
            <Text style={[s.actionText, { color: '#3B82F6' }]}>Reagendar</Text>
          </TouchableOpacity>
        )}

        {appt.status !== 'Cancelada' && appt.status !== 'Completada' && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
            onPress={() => Alert.alert('Cancelar cita', '¿Estás seguro? El cliente no será notificado automáticamente.', [
              { text: 'No', style: 'cancel' },
              { text: 'Cancelar cita', style: 'destructive', onPress: () => updateStatus('Cancelada') },
            ])}
            disabled={saving}
            activeOpacity={0.7}
          >
            <MaterialIcons name="cancel" size={20} color="#EF4444" />
            <Text style={[s.actionText, { color: '#EF4444' }]}>Cancelar cita</Text>
          </TouchableOpacity>
        )}

        {saving && <ActivityIndicator color="#10B981" style={{ marginTop: 8 }} />}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modal reagenda */}
      <Modal visible={showReschedule} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: tc.surface }]}>
            <Text style={[s.modalTitle, { color: tc.text }]}>Reagendar cita</Text>

            {/* Campo fecha */}
            <Text style={[s.rescheduleLabel, { color: tc.textMuted }]}>NUEVA FECHA</Text>
            <TouchableOpacity
              style={[s.rescheduleField, { backgroundColor: tc.bg, borderColor: showDatePicker ? '#3B82F6' : tc.border }]}
              onPress={() => { setShowTimePicker(false); setShowDatePicker(v => !v); }}
              activeOpacity={0.75}
            >
              <MaterialIcons name="calendar-today" size={18} color="#3B82F6" />
              <Text style={[s.rescheduleFieldText, { color: tc.text }]}>
                {rescheduleDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
              <MaterialIcons name={showDatePicker ? 'expand-less' : 'expand-more'} size={18} color={tc.textMuted} />
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={rescheduleDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={new Date()}
                onChange={(_, d) => {
                  if (Platform.OS === 'android') setShowDatePicker(false);
                  if (d) setRescheduleDate(d);
                }}
              />
            )}

            {/* Campo hora */}
            <Text style={[s.rescheduleLabel, { color: tc.textMuted }]}>NUEVA HORA</Text>
            <TouchableOpacity
              style={[s.rescheduleField, { backgroundColor: tc.bg, borderColor: showTimePicker ? '#3B82F6' : tc.border }]}
              onPress={() => { setShowDatePicker(false); setShowTimePicker(v => !v); }}
              activeOpacity={0.75}
            >
              <MaterialIcons name="schedule" size={18} color="#3B82F6" />
              <Text style={[s.rescheduleFieldText, { color: tc.text }]}>{rescheduleTime}</Text>
              <MaterialIcons name={showTimePicker ? 'expand-less' : 'expand-more'} size={18} color={tc.textMuted} />
            </TouchableOpacity>
            {showTimePicker && (
              <DateTimePicker
                value={(() => {
                  const [h, m] = rescheduleTime.split(':').map(Number);
                  const d = new Date(); d.setHours(h, m, 0, 0); return d;
                })()}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                is24Hour
                onChange={(_, d) => {
                  if (Platform.OS === 'android') setShowTimePicker(false);
                  if (d) {
                    const hh = d.getHours().toString().padStart(2, '0');
                    const mm = d.getMinutes().toString().padStart(2, '0');
                    setRescheduleTime(`${hh}:${mm}`);
                  }
                }}
              />
            )}

            <View style={[s.modalBtns, { marginTop: 20 }]}>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: tc.bg }]}
                onPress={() => setShowReschedule(false)}
              >
                <Text style={[s.modalBtnText, { color: tc.textMuted }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: '#3B82F6' }]}
                onPress={confirmReschedule}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={[s.modalBtnText, { color: '#fff' }]}>Confirmar reagenda</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal nota */}
      <Modal visible={showNoteModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: tc.surface }]}>
            <Text style={[s.modalTitle, { color: tc.text }]}>Nota de la cita</Text>
            <TextInput
              style={[s.noteInput, { backgroundColor: tc.bg, color: tc.text, borderColor: tc.border }]}
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Escribe una nota..."
              placeholderTextColor={tc.textMuted}
              multiline
              maxLength={500}
              autoFocus
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: tc.bg }]} onPress={() => setShowNoteModal(false)}>
                <Text style={[s.modalBtnText, { color: tc.textMuted }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: '#10B981' }]} onPress={saveNote} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[s.modalBtnText, { color: '#fff' }]}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1 },
  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  back:         { padding: 4, width: 40 },
  headerTitle:  { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  scroll:       { padding: 16 },
  statusRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 },
  statusDot:    { width: 8, height: 8, borderRadius: 4 },
  statusLabel:  { fontSize: 14, fontWeight: '700' },
  card:         { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 10 },
  cardLabel:    { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6 },
  cardMain:     { fontSize: 16, fontWeight: '600' },
  cardSub:      { fontSize: 13, marginTop: 3 },
  phoneRow:     { flexDirection: 'row', gap: 8, marginTop: 12 },
  phoneBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ECFDF5', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  phoneBtnText: { fontSize: 13, fontWeight: '600', color: '#10B981' },
  staffRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  staffDot:     { width: 10, height: 10, borderRadius: 5 },
  noteHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  editLink:     { fontSize: 13, color: '#10B981', fontWeight: '600' },
  noteText:     { fontSize: 14, lineHeight: 20 },
  noteEmpty:    { fontSize: 13 },
  sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginTop: 8, marginBottom: 10 },
  actionBtn:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 8 },
  actionText:   { fontSize: 14, fontWeight: '600' },
  rescheduleLabel:     { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6, marginTop: 14 },
  rescheduleField:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13 },
  rescheduleFieldText: { flex: 1, fontSize: 15, fontWeight: '500' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox:     { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalTitle:   { fontSize: 17, fontWeight: '700', marginBottom: 14 },
  noteInput:    { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 15, minHeight: 100, textAlignVertical: 'top', marginBottom: 16 },
  modalBtns:    { flexDirection: 'row', gap: 10 },
  modalBtn:     { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  modalBtnText: { fontSize: 15, fontWeight: '700' },
});
