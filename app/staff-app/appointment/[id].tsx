import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Modal, Alert, Linking, Platform, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import { getStatusColor } from '@/utils/appointmentUtils';
import { validateNoTimeConflict, validateNoTimeBlock, getAllowOverlapping } from '@/utils/api';

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface AppointmentDetail {
  id: string;
  user_id: string;
  date: string;
  start_time: string;
  end_time: string | null;
  service_name: string;
  service_cost: number | null;
  status: string;
  paid: boolean | null;
  notes: string | null;
  staff_id: string | null;
  client: { id: string; name: string; phone: string } | null;
  client_name_temp: string | null;
  client_phone_temp: string | null;
  staff: { name: string; color: string } | null;
}

const ACTIONABLE_STATUSES = ['Pendiente', 'Confirmada'];
// Statuses where cancellation makes no sense
const NON_CANCELLABLE = ['Cancelada', 'Completada', 'No asistió'];

export default function StaffAppointmentDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: tc } = useTheme();

  const [appt, setAppt]       = useState<AppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  // Modal nota
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText]           = useState('');

  // Modal reagenda
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState(new Date());
  const [rescheduleTime, setRescheduleTime] = useState('09:00');
  // iOS panels
  const [tempRescheduleDate, setTempRescheduleDate] = useState(new Date());
  const [tempRescheduleTimeDate, setTempRescheduleTimeDate] = useState<Date>(() => { const d = new Date(); d.setHours(9,0,0,0); return d; });
  const [showDatePanel, setShowDatePanel]   = useState(false);
  const [showTimePanel, setShowTimePanel]   = useState(false);
  // Android pickers
  const [showDatePickerAndroid, setShowDatePickerAndroid] = useState(false);
  const [showTimePickerAndroid, setShowTimePickerAndroid] = useState(false);

  useEffect(() => { loadAppointment(); }, [id]);

  const loadAppointment = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, user_id, date, start_time, end_time, service_name, service_cost, status, paid, notes, staff_id, client_name_temp, client_phone_temp, client:clients(id, name, phone), staff:staff_members(name, color)')
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

  const registerPayment = async () => {
    if (!appt) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ paid: true, updated_at: new Date().toISOString() })
        .eq('id', appt.id);
      if (error) throw error;
      setAppt(prev => prev ? { ...prev, paid: true } : prev);
      Alert.alert('✅ Pago registrado', 'El pago ha sido registrado correctamente.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo registrar el pago');
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
    const [y, mo, d] = appt.date.split('-').map(Number);
    const initDate = new Date(y, mo - 1, d);
    const [h, m] = appt.start_time.slice(0, 5).split(':').map(Number);
    const initTimeDate = new Date(); initTimeDate.setHours(h, m, 0, 0);
    setRescheduleDate(initDate);
    setTempRescheduleDate(initDate);
    setRescheduleTime(appt.start_time.slice(0, 5));
    setTempRescheduleTimeDate(initTimeDate);
    setShowDatePanel(false);
    setShowTimePanel(false);
    setShowReschedule(true);
  };

  const openRescheduleDatePicker = () => {
    if (Platform.OS === 'ios') { setTempRescheduleDate(rescheduleDate); setShowTimePanel(false); setShowDatePanel(true); }
    else setTimeout(() => setShowDatePickerAndroid(true), 100);
  };
  const confirmRescheduleDate = () => { setRescheduleDate(tempRescheduleDate); setShowDatePanel(false); };
  const cancelRescheduleDate  = () => setShowDatePanel(false);
  const onAndroidRescheduleDateChange = (_: any, d?: Date) => { setShowDatePickerAndroid(false); if (d) setRescheduleDate(d); };

  const openRescheduleTimePicker = () => {
    if (Platform.OS === 'ios') { setShowDatePanel(false); setShowTimePanel(true); }
    else setTimeout(() => setShowTimePickerAndroid(true), 100);
  };
  const confirmRescheduleTime = () => {
    const hh = tempRescheduleTimeDate.getHours().toString().padStart(2,'0');
    const mm = tempRescheduleTimeDate.getMinutes().toString().padStart(2,'0');
    setRescheduleTime(`${hh}:${mm}`);
    setShowTimePanel(false);
  };
  const cancelRescheduleTime = () => setShowTimePanel(false);
  const onAndroidRescheduleTimeChange = (_: any, d?: Date) => {
    setShowTimePickerAndroid(false);
    if (d) {
      const hh = d.getHours().toString().padStart(2,'0');
      const mm = d.getMinutes().toString().padStart(2,'0');
      setRescheduleTime(`${hh}:${mm}`);
    }
  };

  const confirmReschedule = async () => {
    if (!appt) return;
    setSaving(true);
    try {
      const dateStr = toDateStr(rescheduleDate);
      const [h, m] = rescheduleTime.split(':').map(Number);
      let durationMin = 30;
      if (appt.end_time) {
        const [sh, sm] = appt.start_time.split(':').map(Number);
        const [eh, em] = appt.end_time.split(':').map(Number);
        const dur = (eh * 60 + em) - (sh * 60 + sm);
        if (dur > 0) durationMin = dur;
      }
      const endMin = h * 60 + m + durationMin;
      const endTime = `${Math.floor(endMin/60).toString().padStart(2,'0')}:${(endMin%60).toString().padStart(2,'0')}`;

      // ⚡ FIX BUG (jul 2026): validar conflicto de horario y bloqueos ANTES de escribir.
      // Antes la staff-app reagendaba directo a la BD sin ninguna validación → doble-
      // booking en la agenda del dueño y reagendados a horas de comida / días cerrados.
      // Se valida contra el negocio (appt.user_id) reusando la lógica canónica de la app.
      const allowOverlap = await getAllowOverlapping(appt.user_id);
      await validateNoTimeConflict(appt.user_id, dateStr, rescheduleTime, endTime, appt.staff_id ?? null, allowOverlap, appt.id);
      await validateNoTimeBlock(appt.user_id, dateStr, rescheduleTime, endTime, appt.staff_id ?? null);

      const { error } = await supabase
        .from('appointments')
        .update({ date: dateStr, start_time: rescheduleTime, end_time: endTime, status: 'Reagendada', updated_at: new Date().toISOString() })
        .eq('id', appt.id);
      if (error) throw error;

      setAppt(prev => prev ? { ...prev, date: dateStr, start_time: rescheduleTime, end_time: endTime, status: 'Reagendada' } : prev);
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

  const statusColor  = getStatusColor(appt.status);
  const clientName   = appt.client?.name  ?? appt.client_name_temp  ?? 'Cliente';
  const clientPhone  = appt.client?.phone ?? appt.client_phone_temp ?? null;
  const isActionable = ACTIONABLE_STATUSES.includes(appt.status);
  const isCompleted  = appt.status === 'Completada';
  const isPaid       = appt.paid === true;
  const staffColor   = (appt.staff as any)?.color ?? '#94A3B8';
  // Reagendada también puede cancelarse, pero No asistió/Cancelada/Completada no
  const canCancel    = !NON_CANCELLABLE.includes(appt.status);
  // Solo puede reagendarse si no está en estado terminal
  const canReschedule = !['Cancelada', 'Completada', 'No asistió'].includes(appt.status);

  const formattedRescheduleTempDate = tempRescheduleDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  const formattedRescheduleTempTime = `${tempRescheduleTimeDate.getHours().toString().padStart(2,'0')}:${tempRescheduleTimeDate.getMinutes().toString().padStart(2,'0')}`;

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
        {/* Status */}
        <View style={[s.statusRow, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[s.statusLabel, { color: statusColor }]}>{appt.status}</Text>
          {/* Badge de pago junto al status — solo cuando está Completada */}
          {isCompleted && (
            <View style={[
              s.paidBadge,
              { backgroundColor: isPaid ? '#ECFDF5' : '#FFF7ED', borderColor: isPaid ? '#A7F3D0' : '#FED7AA' },
            ]}>
              <MaterialIcons name={isPaid ? 'check-circle' : 'pending'} size={12} color={isPaid ? '#10B981' : '#F97316'} />
              <Text style={[s.paidBadgeText, { color: isPaid ? '#10B981' : '#F97316' }]}>
                {isPaid ? 'Pagado' : 'Sin pagar'}
              </Text>
            </View>
          )}
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

        {/* Servicio */}
        <View style={[s.card, { backgroundColor: tc.surface, borderColor: tc.border }]}>
          <Text style={[s.cardLabel, { color: tc.textMuted }]}>SERVICIO</Text>
          <Text style={[s.cardMain, { color: tc.text }]}>{appt.service_name}</Text>
          {appt.service_cost != null && appt.service_cost > 0 && (
            <Text style={[s.cardSub, { color: tc.textMuted }]}>${appt.service_cost.toLocaleString('es-MX')} MXN</Text>
          )}
        </View>

        {/* Fecha y hora */}
        <View style={[s.card, { backgroundColor: tc.surface, borderColor: tc.border }]}>
          <Text style={[s.cardLabel, { color: tc.textMuted }]}>FECHA Y HORA</Text>
          <Text style={[s.cardMain, { color: tc.text }]}>
            {new Date(appt.date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          <Text style={[s.cardSub, { color: tc.textMuted }]}>
            {appt.start_time.slice(0, 5)}{appt.end_time ? ` – ${appt.end_time.slice(0, 5)}` : ''}
          </Text>
        </View>

        {/* Colaborador */}
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
          {appt.notes
            ? <Text style={[s.noteText, { color: tc.text }]}>{appt.notes}</Text>
            : <Text style={[s.noteEmpty, { color: tc.textMuted }]}>Sin nota</Text>
          }
        </View>

        {/* ── ACCIONES ── */}
        <Text style={[s.sectionLabel, { color: tc.textMuted }]}>ACCIONES</Text>

        {/* Completar / No show — solo cuando está Pendiente o Confirmada */}
        {isActionable && (
          <>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
              onPress={() => Alert.alert('Confirmar', '¿Marcar como completada?', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Sí', onPress: () => updateStatus('Completada') },
              ])}
              disabled={saving} activeOpacity={0.7}
            >
              <MaterialIcons name="check-circle-outline" size={20} color="#10B981" />
              <Text style={[s.actionText, { color: '#10B981' }]}>Marcar como completada</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}
              onPress={() => Alert.alert('Confirmar', '¿Marcar como no asistió?', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Sí', onPress: () => updateStatus('No asistió') },
              ])}
              disabled={saving} activeOpacity={0.7}
            >
              <MaterialIcons name="person-off" size={20} color="#F97316" />
              <Text style={[s.actionText, { color: '#F97316' }]}>No asistió</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Registrar pago — visible para el staff cuando está Completada y sin pagar ── */}
        {isCompleted && !isPaid && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }]}
            onPress={() => Alert.alert(
              'Registrar pago',
              `¿Confirmar pago${appt.service_cost ? ` de $${appt.service_cost.toLocaleString('es-MX')} MXN` : ''}?`,
              [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Confirmar', onPress: registerPayment },
              ]
            )}
            disabled={saving} activeOpacity={0.7}
          >
            <MaterialIcons name="payments" size={20} color="#16A34A" />
            <View style={{ flex: 1 }}>
              <Text style={[s.actionText, { color: '#16A34A' }]}>Registrar pago</Text>
              {appt.service_cost != null && appt.service_cost > 0 && (
                <Text style={{ fontSize: 11, color: '#16A34A', opacity: 0.8, marginTop: 1 }}>
                  ${appt.service_cost.toLocaleString('es-MX')} MXN
                </Text>
              )}
            </View>
          </TouchableOpacity>
        )}

        {/* Pago ya registrado — informativo */}
        {isCompleted && isPaid && (
          <View style={[s.actionBtn, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', opacity: 0.75 }]}>
            <MaterialIcons name="check-circle" size={20} color="#10B981" />
            <Text style={[s.actionText, { color: '#10B981' }]}>Pago registrado ✓</Text>
          </View>
        )}

        {/* Reagendar — disponible salvo estados terminales */}
        {canReschedule && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
            onPress={openReschedule}
            disabled={saving} activeOpacity={0.7}
          >
            <MaterialIcons name="event-repeat" size={20} color="#3B82F6" />
            <Text style={[s.actionText, { color: '#3B82F6' }]}>Reagendar</Text>
          </TouchableOpacity>
        )}

        {/* Cancelar — no aplica para No asistió / Cancelada / Completada */}
        {canCancel && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
            onPress={() => Alert.alert('Cancelar cita', '¿Estás seguro?', [
              { text: 'No', style: 'cancel' },
              { text: 'Cancelar cita', style: 'destructive', onPress: () => updateStatus('Cancelada') },
            ])}
            disabled={saving} activeOpacity={0.7}
          >
            <MaterialIcons name="cancel" size={20} color="#EF4444" />
            <Text style={[s.actionText, { color: '#EF4444' }]}>Cancelar cita</Text>
          </TouchableOpacity>
        )}

        {saving && <ActivityIndicator color="#10B981" style={{ marginTop: 8 }} />}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Modal reagenda ── */}
      <Modal
        visible={showReschedule}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowReschedule(false); setShowDatePanel(false); setShowTimePanel(false); }}
      >
        <View style={s.sheetOverlay}>
          <View style={[s.sheet, { backgroundColor: tc.surface }]}>
            <View style={s.sheetHandle} />
            <Text style={[s.modalTitle, { color: tc.text }]}>Reagendar cita</Text>

            <Text style={[s.rescheduleLabel, { color: tc.textMuted }]}>NUEVA FECHA</Text>
            <TouchableOpacity
              style={[s.rescheduleField, { backgroundColor: tc.bg, borderColor: showDatePanel ? '#3B82F6' : tc.border }]}
              onPress={openRescheduleDatePicker}
              activeOpacity={0.75}
            >
              <MaterialIcons name="calendar-today" size={18} color="#3B82F6" />
              <Text style={[s.rescheduleFieldText, { color: tc.text }]}>
                {rescheduleDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
              <MaterialIcons name="expand-more" size={18} color={tc.textMuted} />
            </TouchableOpacity>

            {Platform.OS === 'android' && showDatePickerAndroid && (
              <DateTimePicker value={rescheduleDate} mode="date" minimumDate={new Date()} onChange={onAndroidRescheduleDateChange} />
            )}

            <Text style={[s.rescheduleLabel, { color: tc.textMuted }]}>NUEVA HORA</Text>
            <TouchableOpacity
              style={[s.rescheduleField, { backgroundColor: tc.bg, borderColor: showTimePanel ? '#3B82F6' : tc.border }]}
              onPress={openRescheduleTimePicker}
              activeOpacity={0.75}
            >
              <MaterialIcons name="schedule" size={18} color="#3B82F6" />
              <Text style={[s.rescheduleFieldText, { color: tc.text }]}>{rescheduleTime}</Text>
              <MaterialIcons name="expand-more" size={18} color={tc.textMuted} />
            </TouchableOpacity>

            {Platform.OS === 'android' && showTimePickerAndroid && (
              <DateTimePicker
                value={(() => { const d = new Date(); const [h,m] = rescheduleTime.split(':').map(Number); d.setHours(h,m,0,0); return d; })()}
                mode="time" is24Hour onChange={onAndroidRescheduleTimeChange}
              />
            )}

            <View style={[s.modalBtns, { marginTop: 20 }]}>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: tc.bg, borderWidth: 1, borderColor: tc.border }]}
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

        {Platform.OS === 'ios' && showDatePanel && (
          <>
            <TouchableOpacity style={s.panelOverlay} activeOpacity={1} onPress={cancelRescheduleDate} />
            <View style={[s.panel, { backgroundColor: '#fff' }]}>
              <View style={s.panelHeader}>
                <TouchableOpacity onPress={cancelRescheduleDate}><Text style={s.panelCancel}>Cancelar</Text></TouchableOpacity>
                <Text style={s.panelTitle}>Nueva fecha</Text>
                <TouchableOpacity onPress={confirmRescheduleDate}><Text style={s.panelConfirm}>Listo</Text></TouchableOpacity>
              </View>
              <View style={s.panelPreview}>
                <Text style={s.panelPreviewText}>
                  {formattedRescheduleTempDate.charAt(0).toUpperCase() + formattedRescheduleTempDate.slice(1)}
                </Text>
              </View>
              <DateTimePicker
                value={tempRescheduleDate} mode="date" display="spinner" minimumDate={new Date()} locale="es-MX"
                onChange={(_, d) => { if (d) setTempRescheduleDate(d); }}
                style={{ width: '100%' }} textColor="#0F172A"
              />
              <TouchableOpacity style={s.panelConfirmBtn} onPress={confirmRescheduleDate}>
                <Text style={s.panelConfirmBtnText}>Confirmar fecha</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {Platform.OS === 'ios' && showTimePanel && (
          <>
            <TouchableOpacity style={s.panelOverlay} activeOpacity={1} onPress={cancelRescheduleTime} />
            <View style={[s.panel, { backgroundColor: '#fff' }]}>
              <View style={s.panelHeader}>
                <TouchableOpacity onPress={cancelRescheduleTime}><Text style={s.panelCancel}>Cancelar</Text></TouchableOpacity>
                <Text style={s.panelTitle}>Nueva hora</Text>
                <TouchableOpacity onPress={confirmRescheduleTime}><Text style={s.panelConfirm}>Listo</Text></TouchableOpacity>
              </View>
              <View style={s.panelPreview}>
                <Text style={s.panelPreviewText}>{formattedRescheduleTempTime}</Text>
              </View>
              <DateTimePicker
                value={tempRescheduleTimeDate} mode="time" display="spinner" is24Hour locale="es-MX"
                onChange={(_, d) => { if (d) setTempRescheduleTimeDate(d); }}
                style={{ width: '100%' }} textColor="#0F172A"
              />
              <TouchableOpacity style={s.panelConfirmBtn} onPress={confirmRescheduleTime}>
                <Text style={s.panelConfirmBtnText}>Confirmar hora</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </Modal>

      {/* ── Modal nota ── */}
      <Modal visible={showNoteModal} transparent animationType="slide" onRequestClose={() => setShowNoteModal(false)}>
        <View style={s.sheetOverlay}>
          <View style={[s.sheet, { backgroundColor: tc.surface }]}>
            <View style={s.sheetHandle} />
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
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
            <View style={s.modalBtns}>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: tc.bg, borderWidth: 1, borderColor: tc.border }]}
                onPress={() => setShowNoteModal(false)}
              >
                <Text style={[s.modalBtnText, { color: tc.textMuted }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: '#10B981' }]}
                onPress={saveNote}
                disabled={saving}
              >
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
  container:           { flex: 1 },
  centered:            { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:              { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  back:                { padding: 4, width: 40 },
  headerTitle:         { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  scroll:              { padding: 16 },
  statusRow:           { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 },
  statusDot:           { width: 8, height: 8, borderRadius: 4 },
  statusLabel:         { fontSize: 14, fontWeight: '700' },
  paidBadge:           { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 'auto' },
  paidBadgeText:       { fontSize: 11, fontWeight: '700' },
  card:                { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 10 },
  cardLabel:           { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6 },
  cardMain:            { fontSize: 16, fontWeight: '600' },
  cardSub:             { fontSize: 13, marginTop: 3 },
  phoneRow:            { flexDirection: 'row', gap: 8, marginTop: 12 },
  phoneBtn:            { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ECFDF5', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  phoneBtnText:        { fontSize: 13, fontWeight: '600', color: '#10B981' },
  staffRow:            { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  staffDot:            { width: 10, height: 10, borderRadius: 5 },
  noteHeader:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  editLink:            { fontSize: 13, color: '#10B981', fontWeight: '600' },
  noteText:            { fontSize: 14, lineHeight: 20 },
  noteEmpty:           { fontSize: 13 },
  sectionLabel:        { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginTop: 8, marginBottom: 10 },
  actionBtn:           { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 8 },
  actionText:          { fontSize: 14, fontWeight: '600' },
  rescheduleLabel:     { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6, marginTop: 14 },
  rescheduleField:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13 },
  rescheduleFieldText: { flex: 1, fontSize: 15, fontWeight: '500' },
  sheetOverlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:               { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36 },
  sheetHandle:         { width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 16 },
  modalTitle:          { fontSize: 17, fontWeight: '700', marginBottom: 14 },
  noteInput:           { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 15, minHeight: 100, textAlignVertical: 'top', marginBottom: 16 },
  modalBtns:           { flexDirection: 'row', gap: 10 },
  modalBtn:            { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  modalBtnText:        { fontSize: 15, fontWeight: '700' },
  panelOverlay:        { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  panel:               { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 },
  panelHeader:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0' },
  panelTitle:          { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  panelCancel:         { fontSize: 15, color: '#94A3B8', fontWeight: '500' },
  panelConfirm:        { fontSize: 15, color: '#10B981', fontWeight: '700' },
  panelPreview:        { alignItems: 'center', paddingVertical: 10, marginHorizontal: 20, marginTop: 12, backgroundColor: '#F0FDF4', borderRadius: 12, borderWidth: 0.5, borderColor: '#BBF7D0' },
  panelPreviewText:    { fontSize: 15, fontWeight: '600', color: '#10B981' },
  panelConfirmBtn:     { backgroundColor: '#10B981', marginHorizontal: 20, marginTop: 12, paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  panelConfirmBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
