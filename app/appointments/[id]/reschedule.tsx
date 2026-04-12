import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Platform,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { invalidateCache } from '@/utils/cache';
import { apiGet, apiPut } from '@/utils/api';
import { supabase } from '@/lib/supabase';
import React, { useEffect, useState, useRef } from 'react';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ConfirmModal } from '@/components/button';
import DateTimePicker from '@react-native-community/datetimepicker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface TimeSlot { time: string; available: boolean; }

interface Appointment {
  id: string; date: string; time: string; end_time?: string; endTime?: string;
  service: string; status: string;
  client: { id: string; name: string } | null;
  clientNameTemp?: string | null;
  userId: string; clientId: string;
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// FIX #7/#9/#12: clave dinámica de caché de reportes (año_mes)
function getReportsCacheKey() {
  const n = new Date();
  return `reports_stats_${n.getFullYear()}_${n.getMonth()+1}`;
}

export default function RescheduleAppointmentScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors: tc, isDark } = useTheme();
  const { user } = useAuth();

  const saveLockRef = useRef(false); // FIX #2: guard doble-submit
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [appointment, setAppointment]   = useState<Appointment | null>(null);
  const [date, setDate]         = useState(new Date());
  const [tempDate, setTempDate] = useState(new Date());
  const [showDatePanel, setShowDatePanel] = useState(false);
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const [time, setTime]         = useState('09:00');
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });

  useEffect(() => { loadAppointment(); }, [id]);

  // FIX #1: recargar slots cuando cambia la fecha
  useEffect(() => {
    if (appointment) checkAvailability();
  }, [date, appointment]);

  const loadAppointment = async () => {
    setLoading(true);
    try {
      // FIX #1: cargar solo la cita específica en lugar de todas
      const appt = await apiGet<Appointment>(`/api/appointments/${id}`);
      if (appt) {
        setAppointment(appt);
        setDate(new Date(appt.date + 'T12:00:00'));
        setTime(appt.time);
      } else {
        router.back();
      }
    } catch {
      router.back();
    } finally {
      setLoading(false);
    }
  };

  // FIX #1: disponibilidad correcta con rangos start_time/end_time + business_hours
  const checkAvailability = async () => {
    if (!appointment) return;
    setLoadingSlots(true);
    try {
      const dateString = toDateStr(date);
      const dayOfWeek  = date.getDay();

      // Citas del día excluyendo la actual y canceladas
      const { data: appts } = await supabase
        .from('appointments')
        .select('start_time, end_time, status')
        .eq('user_id', user?.id)
        .eq('date', dateString)
        .neq('id', appointment.id)
        .not('status', 'in', '("Cancelada","No asistió","Rechazada")');

      // Horario del negocio para ese día
      let startH = 9, startM = 0, endH = 19, endM = 0;
      const { data: bh } = await supabase
        .from('business_hours')
        .select('is_open, start_time, end_time')
        .eq('user_id', user?.id)
        .eq('day_of_week', dayOfWeek)
        .single();

      if (bh) {
        if (!bh.is_open) { setTimeSlots([]); setLoadingSlots(false); return; }
        [startH, startM] = (bh.start_time || '09:00').split(':').map(Number);
        [endH,   endM]   = (bh.end_time   || '19:00').split(':').map(Number);
      }

      // Slots pasados si es hoy
      const today    = new Date();
      const isToday  = dateString === toDateStr(today);

      const slots: TimeSlot[] = [];
      for (let total = startH*60+startM; total < endH*60+endM; total += 30) {
        const h = Math.floor(total/60);
        const m = total % 60;
        const slotTime = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;

        // FIX #1: comparar rangos, no igualdad exacta de hora
        const isBooked = (appts ?? []).some((a: any) => {
          const [sh, sm] = (a.start_time || '00:00').split(':').map(Number);
          const [eh, em] = (a.end_time   || '00:00').split(':').map(Number);
          return total >= sh*60+sm && total < eh*60+em;
        });

        const isPast = isToday && (
          h < today.getHours() ||
          (h === today.getHours() && m <= today.getMinutes())
        );

        slots.push({ time: slotTime, available: !isBooked && !isPast });
      }
      setTimeSlots(slots);
    } catch {
      // Fallback: slots de 9-19 todos disponibles
      const slots: TimeSlot[] = [];
      for (let h = 9; h < 19; h++) {
        for (let m = 0; m < 60; m += 30) {
          slots.push({ time: `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`, available: true });
        }
      }
      setTimeSlots(slots);
    } finally {
      setLoadingSlots(false);
    }
  };

  // FIX #2: guard doble-submit
  // FIX #9: invalida caché al reagendar
  const handleSave = async () => {
    if (saveLockRef.current || !appointment) return;

    const selectedSlot = timeSlots.find(s => s.time === time);
    if (!selectedSlot?.available) {
      setErrorModal({ visible: true, message: 'El horario seleccionado no está disponible. Por favor elige otro.' });
      return;
    }

    saveLockRef.current = true;
    setSaving(true);
    try {
      const dateString = toDateStr(date);
      await apiPut(`/api/appointments/${appointment.id}`, {
        date: dateString,
        time: time,
        status: 'Pendiente',
      });
      // FIX #9: invalidar todos los cachés afectados
      invalidateCache('appointments_list');
      invalidateCache('today_appointments');
      invalidateCache('week_appointments');
      invalidateCache('dashboard_stats');
      invalidateCache(getReportsCacheKey()); // clave dinámica
      router.back();
    } catch (error: any) {
      saveLockRef.current = false;
      setErrorModal({ visible: true, message: error?.message || 'Error al reagendar la cita' });
    } finally {
      setSaving(false);
    }
  };

  const openDatePicker = () => {
    if (Platform.OS === 'ios') { setTempDate(date); setShowDatePanel(true); }
    else setShowAndroidPicker(true);
  };
  const confirmDate = () => { setDate(tempDate); setShowDatePanel(false); };
  const cancelDate  = () => setShowDatePanel(false);

  if (loading || !appointment) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={[s.loadingText, { color: tc.textMuted }]}>Cargando...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const formattedDate = date.toLocaleDateString('es-MX', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const formattedTempDate = tempDate.toLocaleDateString('es-MX', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const clientName = appointment.client?.name || appointment.clientNameTemp || 'Cliente';

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>
      {/* Header — usa tc.surface para dark mode FIX #15 */}
      <View style={[s.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={tc.text} />
        </TouchableOpacity>
        <Text style={[s.title, { color: tc.text }]}>Reagendar Cita</Text>
        <View style={s.placeholder} />
      </View>

      <ScrollView style={s.content} showsVerticalScrollIndicator={false}>
        {/* Cita actual */}
        <View style={[s.infoCard, { backgroundColor: tc.surface, borderColor: tc.border }]}>
          <Text style={[s.infoTitle, { color: tc.textMuted }]}>Cita actual</Text>
          <Text style={[s.infoClient, { color: tc.text }]}>{clientName}</Text>
          <Text style={[s.infoService, { color: tc.textMuted }]}>{appointment.service || 'Servicio'}</Text>
          <Text style={[s.infoDateTime, { color: tc.textMuted }]}>
            {new Date(appointment.date+'T12:00:00').toLocaleDateString('es-MX')} · {appointment.time}
          </Text>
        </View>

        {/* Nueva Fecha */}
        <View style={s.section}>
          <Text style={[s.label, { color: tc.text }]}>Nueva Fecha</Text>
          <TouchableOpacity style={[s.input, { backgroundColor: tc.surface, borderColor: tc.border }]} onPress={openDatePicker}>
            <Text style={[s.inputText, { color: tc.text }]}>{formattedDate.charAt(0).toUpperCase()+formattedDate.slice(1)}</Text>
            <MaterialIcons name="event" size={20} color="#10B981" />
          </TouchableOpacity>
        </View>

        {/* Android date picker */}
        {Platform.OS === 'android' && showAndroidPicker && (
          <DateTimePicker
            value={date} mode="date" display="default" minimumDate={new Date()}
            onChange={(_, d) => { setShowAndroidPicker(false); if (d) setDate(d); }}
          />
        )}

        {/* Nueva Hora */}
        <View style={s.section}>
          <Text style={[s.label, { color: tc.text }]}>Nueva Hora</Text>
          {loadingSlots ? (
            <View style={s.slotsLoading}>
              <ActivityIndicator color="#10B981" size="small" />
              <Text style={[s.slotsLoadingText, { color: tc.textMuted }]}>Verificando disponibilidad...</Text>
            </View>
          ) : timeSlots.length === 0 ? (
            <View style={[s.closedBanner, { backgroundColor: '#FEF2F2' }]}>
              <Text style={s.closedText}>🚫 Sin atención este día</Text>
              <Text style={[s.closedSub, { color: tc.textMuted }]}>Selecciona otra fecha</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.timeSlotsContainer}>
              {timeSlots.map(slot => {
                const isSel = slot.time === time;
                return (
                  <TouchableOpacity
                    key={slot.time}
                    style={[s.timeSlot, { backgroundColor: tc.surface, borderColor: tc.border }, isSel && s.timeSlotSelected, !slot.available && s.timeSlotDisabled]}
                    onPress={() => slot.available && setTime(slot.time)}
                    disabled={!slot.available}
                  >
                    <Text style={[s.timeSlotText, { color: tc.text }, isSel && s.timeSlotTextSelected, !slot.available && s.timeSlotTextDisabled]}>
                      {slot.time}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
          <Text style={[s.slotHint, { color: tc.textMuted }]}>Desliza para ver más horarios</Text>
        </View>

        <TouchableOpacity
          style={[s.saveButton, (saving || saveLockRef.current) && s.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#ffffff" />
            : <Text style={s.saveButtonText}>Guardar Cambios</Text>
          }
        </TouchableOpacity>
      </ScrollView>

      {/* iOS date panel */}
      {Platform.OS === 'ios' && showDatePanel && (
        <>
          <TouchableOpacity style={s.panelOverlay} activeOpacity={1} onPress={cancelDate} />
          <View style={[s.panel, { backgroundColor: tc.surface }]}>
            <View style={s.panelHeader}>
              <TouchableOpacity onPress={cancelDate}><Text style={s.panelCancel}>Cancelar</Text></TouchableOpacity>
              <Text style={[s.panelTitle, { color: tc.text }]}>Seleccionar fecha</Text>
              <TouchableOpacity onPress={confirmDate}><Text style={s.panelConfirm}>Listo</Text></TouchableOpacity>
            </View>
            <View style={s.panelPreview}>
              <Text style={s.panelPreviewText}>{formattedTempDate.charAt(0).toUpperCase()+formattedTempDate.slice(1)}</Text>
            </View>
            <DateTimePicker
              value={tempDate} mode="date" display="spinner" minimumDate={new Date()}
              locale="es-MX" onChange={(_, d) => { if (d) setTempDate(d); }}
              style={{ width: '100%' }} textColor={isDark ? '#F1F5F9' : '#0F172A'}
            />
            <TouchableOpacity style={s.panelConfirmBtn} onPress={confirmDate}>
              <Text style={s.panelConfirmBtnText}>Confirmar fecha</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <ConfirmModal
        visible={errorModal.visible}
        title="Error"
        message={errorModal.message}
        buttons={[{ text: 'OK', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'default' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:          { flex: 1 },
  loadingContainer:   { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText:        { marginTop: 16, fontSize: 16 },
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  backButton:         { padding: 4 },
  title:              { fontSize: 20, fontWeight: '700' },
  placeholder:        { width: 32 },
  content:            { flex: 1, padding: 20 },
  infoCard:           { borderRadius: 14, padding: 18, marginBottom: 24, borderWidth: 1 },
  infoTitle:          { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  infoClient:         { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  infoService:        { fontSize: 15, marginBottom: 6 },
  infoDateTime:       { fontSize: 13 },
  section:            { marginBottom: 24 },
  label:              { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  input:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, padding: 16, borderWidth: 1 },
  inputText:          { fontSize: 15 },
  slotsLoading:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  slotsLoadingText:   { fontSize: 13 },
  closedBanner:       { borderRadius: 12, padding: 16, alignItems: 'center', gap: 4 },
  closedText:         { fontSize: 14, fontWeight: '700', color: '#EF4444' },
  closedSub:          { fontSize: 12 },
  timeSlotsContainer: { flexDirection: 'row' },
  timeSlot:           { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, marginRight: 8 },
  timeSlotSelected:   { backgroundColor: '#10B981', borderColor: '#10B981' },
  timeSlotDisabled:   { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },
  timeSlotText:       { fontSize: 14, fontWeight: '500' },
  timeSlotTextSelected: { color: '#ffffff' },
  timeSlotTextDisabled: { color: '#9CA3AF' },
  slotHint:           { fontSize: 11, marginTop: 8 },
  saveButton:         { backgroundColor: '#10B981', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8, marginBottom: 32 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText:     { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  // iOS date panel
  panelOverlay:       { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  panel:              { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 },
  panelHeader:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0' },
  panelTitle:         { fontSize: 16, fontWeight: '700' },
  panelCancel:        { fontSize: 15, color: '#94A3B8', fontWeight: '500' },
  panelConfirm:       { fontSize: 15, color: '#10B981', fontWeight: '700' },
  panelPreview:       { alignItems: 'center', paddingVertical: 10, marginHorizontal: 20, marginTop: 12, backgroundColor: '#F0FDF4', borderRadius: 12, borderWidth: 0.5, borderColor: '#BBF7D0' },
  panelPreviewText:   { fontSize: 14, fontWeight: '600', color: '#10B981' },
  panelConfirmBtn:    { backgroundColor: '#10B981', marginHorizontal: 20, marginTop: 12, paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  panelConfirmBtnText:{ fontSize: 16, fontWeight: '700', color: '#fff' },
});
