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

interface TimeSlot {
  time: string;
  available: boolean;
  isBlocked?: boolean;
  blockedLabel?: string;
  unavailableReason?: 'block' | 'booked' | 'closed' | null;
}

interface TimeBlockData {
  id: string;
  staff_id: string | null;
  label: string;
  start_time: string;
  end_time: string;
  is_recurring: boolean;
  day_of_week: number | null;
  specific_date: string | null;
}

interface Appointment {
  id: string; date: string; time: string; end_time?: string; endTime?: string;
  service: string; status: string;
  client: { id: string; name: string } | null;
  clientNameTemp?: string | null;
  userId: string; clientId: string;
  staff_id?: string | null;
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getReportsCacheKey() {
  const n = new Date();
  return `reports_stats_${n.getFullYear()}_${n.getMonth()+1}`;
}

const timeToMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

// Mismo helper que new.tsx — bloqueo aplicable al slot.
function findBlockForSlot(
  slotStartMin: number,
  slotEndMin: number,
  dateStr: string,
  jsDay: number,
  staffId: string | null,
  blocks: TimeBlockData[]
): TimeBlockData | null {
  const projectDay = jsDay === 0 ? 6 : jsDay - 1;
  for (const b of blocks) {
    if (b.staff_id) {
      if (b.staff_id !== staffId) continue;
    }
    if (b.is_recurring) {
      if (b.day_of_week !== projectDay) continue;
    } else {
      if (b.specific_date !== dateStr) continue;
    }
    const bStart = timeToMin(b.start_time);
    const bEnd = timeToMin(b.end_time);
    if (slotStartMin < bEnd && slotEndMin > bStart) return b;
  }
  return null;
}

// Calcula duración (minutos) de una cita a partir de start_time y end_time.
// Si no hay end_time, asume 30 min.
function calcAppointmentDuration(appt: Appointment): number {
  const start = appt.time;
  const end = appt.end_time || appt.endTime;
  if (!end) return 30;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = (eh*60+em) - (sh*60+sm);
  return diff > 0 ? diff : 30;
}

export default function RescheduleAppointmentScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors: tc, isDark } = useTheme();
  const { user } = useAuth();

  const saveLockRef = useRef(false);
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
  const [timeBlocks, setTimeBlocks] = useState<TimeBlockData[]>([]);
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });

  useEffect(() => { loadAppointment(); loadTimeBlocks(); }, [id]);

  // Recalcular slots cuando cambia fecha, cita o bloqueos.
  useEffect(() => {
    if (appointment) checkAvailability();
  }, [date, appointment, timeBlocks]);

  const loadAppointment = async () => {
    setLoading(true);
    try {
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

  const loadTimeBlocks = async () => {
    try {
      const data = await apiGet<TimeBlockData[]>('/api/time-blocks');
      setTimeBlocks(data || []);
    } catch (e) {
      console.warn('[reschedule] loadTimeBlocks error:', e);
      setTimeBlocks([]);
    }
  };

  // Construye slots con la misma lógica de 2 pasadas que new.tsx:
  //   PASADA 1: estado atómico de cada slot de 30 min (booked / past / blocked).
  //   PASADA 2: validación por DURACIÓN del servicio que se está reagendando.
  //             Excluye la propia cita del cálculo de bookeado.
  const checkAvailability = async () => {
    if (!appointment) return;
    setLoadingSlots(true);
    try {
      const dateString = toDateStr(date);
      const dayOfWeek  = date.getDay();
      const staffId    = appointment.staff_id || null;
      const duration   = calcAppointmentDuration(appointment);
      const subBlocksNeeded = Math.ceil(duration / 30);

      // Citas del día excluyendo la actual y canceladas
      const { data: appts } = await supabase
        .from('appointments')
        .select('start_time, end_time, status, staff_id')
        .eq('user_id', user?.id)
        .eq('date', dateString)
        .neq('id', appointment.id)
        .not('status', 'in', '("Cancelada","No asistió","Rechazada")');

      // Si la cita tiene staff asignado, solo nos importan citas de ese mismo staff.
      // Si no tiene staff, todas las citas del día cuentan como conflicto.
      const relevantAppts = staffId
        ? (appts ?? []).filter((a: any) => a.staff_id === staffId)
        : (appts ?? []);

      // Horario laboral del día
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

      const today    = new Date();
      const isToday  = dateString === toDateStr(today);
      const dayStartMin = startH * 60 + startM;
      const dayEndMin   = endH * 60 + endM;

      // ── PASADA 1: estado atómico de cada slot de 30 min ──
      const slots: TimeSlot[] = [];
      for (let total = dayStartMin; total < dayEndMin; total += 30) {
        const h = Math.floor(total/60);
        const m = total % 60;
        const slotTime = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
        const slotEndMin = total + 30;

        const isBooked = relevantAppts.some((a: any) => {
          const [sh, sm] = (a.start_time || '00:00').split(':').map(Number);
          const [eh, em] = (a.end_time   || '00:00').split(':').map(Number);
          return total >= sh*60+sm && total < eh*60+em;
        });

        const isPast = isToday && (
          h < today.getHours() ||
          (h === today.getHours() && m <= today.getMinutes())
        );

        const blockingTimeBlock = findBlockForSlot(
          total, slotEndMin, dateString, dayOfWeek, staffId, timeBlocks
        );
        const isBlocked = !!blockingTimeBlock;

        slots.push({
          time: slotTime,
          available: !isBooked && !isPast && !isBlocked,
          isBlocked,
          blockedLabel: blockingTimeBlock?.label,
          unavailableReason: null,
        });
      }

      // ── PASADA 2: validar rango completo según duración de la cita ──
      // Si la cita dura 90 min (3 sub-bloques), un slot inicial libre no es válido
      // si el rango [t, t+90] invade un bloqueo, una cita o el cierre del día.
      if (subBlocksNeeded > 1) {
        for (let i = 0; i < slots.length; i++) {
          const startSlot = slots[i];
          if (!startSlot.available) continue;

          let rangeOK = true;
          let reason: 'block' | 'booked' | 'closed' | null = null;

          for (let j = 0; j < subBlocksNeeded; j++) {
            const subSlot = slots[i + j];
            if (!subSlot) {
              rangeOK = false;
              reason = 'closed';
              break;
            }
            if (subSlot.isBlocked) {
              rangeOK = false;
              reason = 'block';
              break;
            }
            if (!subSlot.available) {
              rangeOK = false;
              reason = subSlot.isBlocked ? 'block' : 'booked';
              break;
            }
          }

          if (!rangeOK) {
            slots[i].available = false;
            slots[i].unavailableReason = reason;
          }
        }
      }

      setTimeSlots(slots);
    } catch {
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
      invalidateCache('appointments_list');
      invalidateCache('today_appointments');
      invalidateCache('week_appointments');
      invalidateCache('dashboard_stats');
      invalidateCache(getReportsCacheKey());
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
  const duration = calcAppointmentDuration(appointment);
  const durationLabel = duration < 60
    ? `${duration} min`
    : duration === 60
      ? '1 hora'
      : `${Math.floor(duration/60)}h${duration%60>0?` ${duration%60}min`:''}`;
  const hasInvalidByDuration = timeSlots.some(s => s.unavailableReason);
  const hasBlockedSlots = timeSlots.some(s => s.isBlocked);

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>
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
          <Text style={[s.infoService, { color: tc.textMuted }]}>{appointment.service || 'Servicio'} · {durationLabel}</Text>
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

        {Platform.OS === 'android' && showAndroidPicker && (
          <DateTimePicker
            value={date} mode="date" display="default" minimumDate={new Date()}
            onChange={(_, d) => { setShowAndroidPicker(false); if (d) setDate(d); }}
          />
        )}

        {/* Nueva Hora */}
        <View style={s.section}>
          <Text style={[s.label, { color: tc.text }]}>Nueva Hora ({durationLabel})</Text>
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
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.timeSlotsContainer}>
                {timeSlots.map(slot => {
                  const isSel = slot.time === time;
                  const isBlocked = slot.isBlocked;
                  const isInvalidByDuration = !!slot.unavailableReason && !isBlocked;
                  return (
                    <TouchableOpacity
                      key={slot.time}
                      style={[
                        s.timeSlot,
                        { backgroundColor: tc.surface, borderColor: tc.border },
                        isSel && s.timeSlotSelected,
                        !slot.available && s.timeSlotDisabled,
                        isBlocked && s.timeSlotBlocked,
                        isInvalidByDuration && s.timeSlotDurationInvalid,
                      ]}
                      onPress={() => slot.available && setTime(slot.time)}
                      disabled={!slot.available}
                    >
                      <Text style={[
                        s.timeSlotText,
                        { color: tc.text },
                        isSel && s.timeSlotTextSelected,
                        !slot.available && s.timeSlotTextDisabled,
                        isBlocked && s.timeSlotTextBlocked,
                      ]}>
                        {slot.time}
                      </Text>
                      {isBlocked && (
                        <Text style={s.timeSlotBlockedLabel} numberOfLines={1}>
                          {slot.blockedLabel?.toLowerCase().includes('comida') ? '🍽️' : '🚫'} {slot.blockedLabel?.slice(0, 8)}
                        </Text>
                      )}
                      {isInvalidByDuration && (
                        <Text style={s.timeSlotDurationInvalidLabel} numberOfLines={1}>
                          No alcanza
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Leyendas explicativas */}
              {(hasBlockedSlots || hasInvalidByDuration) && (
                <View style={s.legendCol}>
                  {hasBlockedSlots && (
                    <View style={s.legendItem}>
                      <View style={[s.legendDot, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]} />
                      <Text style={[s.legendText, { color: tc.textMuted }]}>Bloqueado por horario de comida o descanso</Text>
                    </View>
                  )}
                  {hasInvalidByDuration && (
                    <View style={s.legendItem}>
                      <View style={[s.legendDot, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]} />
                      <Text style={[s.legendText, { color: tc.textMuted }]}>
                        La duración de la cita ({durationLabel}) no alcanza antes del próximo bloqueo o cita
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </>
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
  timeSlot:           { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, marginRight: 8, alignItems: 'center', minWidth: 80 },
  timeSlotSelected:   { backgroundColor: '#10B981', borderColor: '#10B981' },
  timeSlotDisabled:   { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },
  timeSlotBlocked:    { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  timeSlotDurationInvalid: { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },
  timeSlotText:       { fontSize: 14, fontWeight: '500' },
  timeSlotTextSelected: { color: '#ffffff' },
  timeSlotTextDisabled: { color: '#9CA3AF' },
  timeSlotTextBlocked:  { color: '#92400E', fontWeight: '600' },
  timeSlotBlockedLabel: { fontSize: 9, color: '#92400E', marginTop: 2, fontWeight: '600' },
  timeSlotDurationInvalidLabel: { fontSize: 9, color: '#991B1B', marginTop: 2, fontWeight: '700' },
  legendCol:          { marginTop: 10, gap: 6 },
  legendItem:         { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  legendDot:          { width: 10, height: 10, borderRadius: 3, borderWidth: 1, marginTop: 2 },
  legendText:         { flex: 1, fontSize: 11, fontStyle: 'italic', lineHeight: 15 },
  slotHint:           { fontSize: 11, marginTop: 8 },
  saveButton:         { backgroundColor: '#10B981', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8, marginBottom: 32 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText:     { fontSize: 16, fontWeight: '700', color: '#ffffff' },
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
