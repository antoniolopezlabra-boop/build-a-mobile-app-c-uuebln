import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, Alert,
  KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import { invalidateCache } from '@/utils/cache';

interface Client { id: string; name: string; phone: string; }
interface Service { id: string; name: string; price: number; durationMinutes: number; }
interface StaffMember { id: string; name: string; color: string; }
interface TimeSlot { time: string; available: boolean; }

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(d: Date) {
  const s = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function StaffNewAppointment() {
  const router = useRouter();
  const { staffMemberData } = useAuth();
  const { colors: tc } = useTheme();
  const insets = useSafeAreaInsets();

  const orgUserId = staffMemberData?.organizationUserId ?? '';
  const myStaffId = staffMemberData?.id ?? '';

  const [saving, setSaving] = useState(false);

  // ── Cliente ────────────────────────────────────────
  const [clients, setClients]                       = useState<Client[]>([]);
  const [clientSearch, setClientSearch]             = useState('');
  const [showClientSearch, setShowClientSearch]     = useState(false);
  const [selectedClient, setSelectedClient]         = useState<Client | null>(null);
  const [showClientPicker, setShowClientPicker]     = useState(false);
  const [newClientName, setNewClientName]           = useState('');
  const [newClientPhone, setNewClientPhone]         = useState('');
  const [showNewClientForm, setShowNewClientForm]   = useState(false);

  // ── Servicio ──────────────────────────────────────
  const [services, setServices]                     = useState<Service[]>([]);
  const [selectedService, setSelectedService]       = useState<Service | null>(null);
  const [showServicePicker, setShowServicePicker]   = useState(false);

  // ── Staff ─────────────────────────────────────────
  const [staffList, setStaffList]                   = useState<StaffMember[]>([]);
  const [selectedStaff, setSelectedStaff]           = useState<StaffMember | null>(null);
  const [showStaffPicker, setShowStaffPicker]       = useState(false);

  // ── Fecha ─────────────────────────────────────────
  const [date, setDate]                             = useState(new Date());
  const [tempDate, setTempDate]                     = useState(new Date());
  const [showDatePanel, setShowDatePanel]           = useState(false);
  const [showDatePickerAndroid, setShowDatePickerAndroid] = useState(false);

  // ── Horarios disponibles ───────────────────────────
  const [timeSlots, setTimeSlots]                   = useState<TimeSlot[]>([]);
  const [selectedBlocks, setSelectedBlocks]         = useState<string[]>([]);
  const [time, setTime]                             = useState('09:00');
  const [dayIsClosed, setDayIsClosed]               = useState(false);
  const [loadingSlots, setLoadingSlots]             = useState(false);

  const [notes, setNotes] = useState('');

  useEffect(() => { loadData(); }, []);

  // Recargar slots cuando cambia fecha o staff
  useEffect(() => {
    if (orgUserId) checkAvailability();
  }, [date, selectedStaff, orgUserId]);

  const loadData = async () => {
    try {
      const [{ data: c }, { data: sv }, { data: st }] = await Promise.all([
        supabase.from('clients').select('id, name, phone').eq('user_id', orgUserId).order('name'),
        supabase.from('services').select('id, name, price, duration_minutes').eq('user_id', orgUserId).eq('is_active', true).order('name'),
        supabase.from('staff_members').select('id, name, color').eq('user_id', orgUserId).eq('is_active', true).order('sort_order'),
      ]);
      setClients(c ?? []);
      setServices((sv ?? []).map((s: any) => ({ id: s.id, name: s.name, price: s.price, durationMinutes: s.duration_minutes })));
      const list = (st ?? []) as StaffMember[];
      setStaffList(list);
      const me = list.find(m => m.id === myStaffId);
      if (me) setSelectedStaff(me);
    } catch (e) {
      console.warn('[StaffNewAppt] loadData error:', e);
    }
  };

  // ── Misma lógica de disponibilidad que app/appointments/new.tsx ──
  const checkAvailability = async () => {
    setLoadingSlots(true);
    try {
      const dateString = toDateStr(date);
      const dayOfWeek  = date.getDay();

      // 1) Citas del día de este negocio
      const { data: appts } = await supabase
        .from('appointments')
        .select('start_time, end_time, staff_id, status')
        .eq('user_id', orgUserId)
        .eq('date', dateString)
        .not('status', 'eq', 'Cancelada');

      const allAppts = appts ?? [];

      // 2) Horario del día: staff seleccionado → negocio → fallback
      let dayConfig: { isOpen: boolean; startTime: string; endTime: string } | null = null;

      if (selectedStaff) {
        const { data: sh } = await supabase
          .from('staff_hours')
          .select('is_open, start_time, end_time')
          .eq('staff_id', selectedStaff.id)
          .eq('day_of_week', dayOfWeek)
          .single();
        if (sh) dayConfig = { isOpen: sh.is_open, startTime: sh.start_time, endTime: sh.end_time };
      }

      if (!dayConfig) {
        const { data: bh } = await supabase
          .from('business_hours')
          .select('is_open, start_time, end_time, day_of_week')
          .eq('user_id', orgUserId)
          .eq('day_of_week', dayOfWeek)
          .single();
        if (bh) {
          dayConfig = { isOpen: bh.is_open, startTime: bh.start_time, endTime: bh.end_time };
        } else {
          const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
          dayConfig = { isOpen: isWeekday, startTime: '09:00', endTime: '18:00' };
        }
      }

      if (!dayConfig || !dayConfig.isOpen) {
        setDayIsClosed(true); setTimeSlots([]); setSelectedBlocks([]);
        return;
      }

      setDayIsClosed(false);
      setSelectedBlocks([]);

      const [startH, startM] = dayConfig.startTime.split(':').map(Number);
      const [endH,   endM]   = dayConfig.endTime.split(':').map(Number);

      // 3) Citas del colaborador seleccionado (bloquean siempre)
      const staffAppts = selectedStaff
        ? allAppts.filter(a => a.staff_id === selectedStaff.id)
        : allAppts; // sin staff: bloquear todas

      // 4) Slots pasados si es hoy
      const today    = new Date();
      const todayStr = toDateStr(today);
      const isToday  = dateString === todayStr;

      // 5) Generar slots de 30 min
      const slots: TimeSlot[] = [];
      for (let total = startH * 60 + startM; total < endH * 60 + endM; total += 30) {
        const h = Math.floor(total / 60);
        const m = total % 60;
        const slotTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

        const isBooked = staffAppts.some(appt => {
          const [sh, sm] = (appt.start_time || '00:00').split(':').map(Number);
          const [eh, em] = (appt.end_time   || '00:00').split(':').map(Number);
          return total >= sh * 60 + sm && total < eh * 60 + em;
        });

        const isPast = isToday && (
          h < today.getHours() ||
          (h === today.getHours() && m <= today.getMinutes())
        );

        slots.push({ time: slotTime, available: !isBooked && !isPast });
      }
      setTimeSlots(slots);
    } catch (e) {
      console.warn('[StaffNewAppt] checkAvailability error:', e);
    } finally {
      setLoadingSlots(false);
    }
  };

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.phone.includes(clientSearch)
  );

  const closeClientPicker = () => {
    setShowClientPicker(false);
    setShowClientSearch(false);
    setClientSearch('');
  };

  // ── Fecha handlers ──────────────────────────────────
  const openDatePicker = () => {
    Keyboard.dismiss();
    if (Platform.OS === 'ios') { setTempDate(date); setShowDatePanel(true); }
    else setTimeout(() => setShowDatePickerAndroid(true), 100);
  };
  const confirmDate = () => { setDate(tempDate); setShowDatePanel(false); };
  const cancelDate  = () => { setTempDate(date); setShowDatePanel(false); };
  const onAndroidDateChange = (_: any, d?: Date) => { setShowDatePickerAndroid(false); if (d) setDate(d); };

  // ── Selección de bloques de horario ───────────────────
  const handleSlotPress = (slot: TimeSlot) => {
    if (!slot.available) return;
    Keyboard.dismiss();
    if (selectedBlocks.length === 0) {
      if (selectedService) {
        const blocks   = Math.ceil(selectedService.durationMinutes / 30);
        const thisIdx  = timeSlots.findIndex(s => s.time === slot.time);
        const range    = timeSlots.slice(thisIdx, thisIdx + blocks);
        if (range.length > 0 && range.every(s => s.available)) {
          setSelectedBlocks(range.map(s => s.time));
          setTime(slot.time);
          return;
        }
      }
      setSelectedBlocks([slot.time]);
      setTime(slot.time);
    } else {
      const firstIdx = timeSlots.findIndex(s => s.time === selectedBlocks[0]);
      const thisIdx  = timeSlots.findIndex(s => s.time === slot.time);
      if (thisIdx < firstIdx) {
        setSelectedBlocks([slot.time]); setTime(slot.time);
      } else {
        const range = timeSlots.slice(firstIdx, thisIdx + 1);
        if (range.every(s => s.available)) setSelectedBlocks(range.map(s => s.time));
      }
    }
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    if (!selectedClient && !showNewClientForm) { Alert.alert('Campo requerido', 'Selecciona o agrega un cliente.'); return; }
    if (showNewClientForm && !newClientName.trim()) { Alert.alert('Campo requerido', 'Ingresa el nombre del cliente.'); return; }
    if (!selectedService) { Alert.alert('Campo requerido', 'Selecciona un servicio.'); return; }
    if (selectedBlocks.length === 0) { Alert.alert('Campo requerido', 'Selecciona un horario disponible.'); return; }

    const selectedSlot = timeSlots.find(s => s.time === time);
    if (!selectedSlot?.available) { Alert.alert('No disponible', 'El horario seleccionado ya no está disponible.'); return; }

    setSaving(true);
    try {
      let clientId = selectedClient?.id ?? null;
      if (showNewClientForm && newClientName.trim()) {
        const { data: newC, error: cErr } = await supabase
          .from('clients')
          .insert({ user_id: orgUserId, name: newClientName.trim(), phone: newClientPhone.trim() || null })
          .select('id').single();
        if (cErr) throw cErr;
        clientId = newC.id;
      }

      // endTime basado en bloques seleccionados
      const lastBlock = selectedBlocks[selectedBlocks.length - 1];
      const [lh, lm]  = lastBlock.split(':').map(Number);
      const endMin    = lh * 60 + lm + 30;
      const endTime   = `${Math.floor(endMin / 60).toString().padStart(2, '0')}:${(endMin % 60).toString().padStart(2, '0')}`;

      const { error } = await supabase.from('appointments').insert({
        user_id:               orgUserId,
        client_id:             clientId,
        service_name:          selectedService.name,
        date:                  toDateStr(date),
        start_time:            time,
        end_time:              endTime,
        status:                'Pendiente',
        notes:                 notes.trim() || null,
        service_cost:          selectedService.price ?? 0,
        staff_id:              selectedStaff?.id ?? null,
        whatsapp_notification: false,
      });
      if (error) throw error;

      invalidateCache('dashboard_stats');
      invalidateCache('today_appointments');
      invalidateCache('appointments_list');
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo guardar la cita');
    } finally {
      setSaving(false);
    }
  };

  const formattedTempDate = tempDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const durationLabel = selectedBlocks.length > 0 ? (() => {
    const [h, m] = selectedBlocks[selectedBlocks.length - 1].split(':').map(Number);
    const e = h * 60 + m + 30;
    return `${selectedBlocks[0]} → ${Math.floor(e/60).toString().padStart(2,'0')}:${(e%60).toString().padStart(2,'0')}  ·  ${selectedBlocks.length * 30} min`;
  })() : null;

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <MaterialIcons name="arrow-back" size={24} color={tc.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: tc.text }]}>Nueva cita</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={s.saveBtn}>
          {saving ? <ActivityIndicator size="small" color="#10B981" /> : <Text style={s.saveBtnText}>Guardar</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">

          {/* ── Cliente ── */}
          <Text style={[s.label, { color: tc.textMuted }]}>CLIENTE *</Text>
          {!showNewClientForm ? (
            <>
              <TouchableOpacity style={[s.field, { backgroundColor: tc.surface }]} onPress={() => setShowClientPicker(true)} activeOpacity={0.75}>
                <MaterialIcons name="person" size={18} color="#10B981" />
                <Text style={[s.fieldText, { color: selectedClient ? tc.text : tc.textMuted }]}>
                  {selectedClient ? `${selectedClient.name}  ·  ${selectedClient.phone}` : 'Seleccionar cliente'}
                </Text>
                <MaterialIcons name="expand-more" size={18} color={tc.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity style={s.addClientLink} onPress={() => { setShowNewClientForm(true); setSelectedClient(null); }}>
                <MaterialIcons name="person-add-alt" size={14} color="#10B981" />
                <Text style={s.addClientText}>Agregar nuevo cliente</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={[s.newClientBox, { backgroundColor: tc.surface, borderColor: '#10B981' }]}>
              <TextInput style={[s.input, { color: tc.text, borderColor: tc.border, backgroundColor: tc.bg }]} placeholder="Nombre *" placeholderTextColor={tc.textMuted} value={newClientName} onChangeText={setNewClientName} returnKeyType="next" />
              <TextInput style={[s.input, { color: tc.text, borderColor: tc.border, backgroundColor: tc.bg, marginTop: 8 }]} placeholder="Teléfono" placeholderTextColor={tc.textMuted} value={newClientPhone} onChangeText={setNewClientPhone} keyboardType="phone-pad" returnKeyType="done" onSubmitEditing={Keyboard.dismiss} />
              <TouchableOpacity style={s.addClientLink} onPress={() => { setShowNewClientForm(false); setNewClientName(''); setNewClientPhone(''); }}>
                <Text style={[s.addClientText, { color: tc.textMuted }]}>Cancelar — buscar existente</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Servicio ── */}
          <Text style={[s.label, { color: tc.textMuted }]}>SERVICIO *</Text>
          <TouchableOpacity style={[s.field, { backgroundColor: tc.surface }]} onPress={() => setShowServicePicker(true)} activeOpacity={0.75}>
            <MaterialIcons name="design-services" size={18} color="#10B981" />
            <Text style={[s.fieldText, { color: selectedService ? tc.text : tc.textMuted }]}>
              {selectedService ? `${selectedService.name}  ·  ${selectedService.durationMinutes} min` : 'Seleccionar servicio'}
            </Text>
            <MaterialIcons name="expand-more" size={18} color={tc.textMuted} />
          </TouchableOpacity>

          {/* ── Colaborador ── */}
          <Text style={[s.label, { color: tc.textMuted }]}>COLABORADOR</Text>
          <TouchableOpacity style={[s.field, { backgroundColor: tc.surface }]} onPress={() => setShowStaffPicker(true)} activeOpacity={0.75}>
            <View style={[s.staffDot, { backgroundColor: selectedStaff?.color ?? '#94A3B8' }]} />
            <Text style={[s.fieldText, { color: tc.text }]}>{selectedStaff?.name ?? 'Sin asignar'}</Text>
            <MaterialIcons name="expand-more" size={18} color={tc.textMuted} />
          </TouchableOpacity>

          {/* ── Fecha ── */}
          <Text style={[s.label, { color: tc.textMuted }]}>FECHA</Text>
          <TouchableOpacity style={[s.field, { backgroundColor: tc.surface }]} onPress={openDatePicker} activeOpacity={0.75}>
            <MaterialIcons name="calendar-today" size={18} color="#10B981" />
            <Text style={[s.fieldText, { color: tc.text }]}>{formatDate(date)}</Text>
          </TouchableOpacity>
          {Platform.OS === 'android' && showDatePickerAndroid && (
            <DateTimePicker value={date} mode="date" minimumDate={new Date()} onChange={onAndroidDateChange} />
          )}

          {/* ── Hora — bloques de disponibilidad real ── */}
          <Text style={[s.label, { color: tc.textMuted }]}>
            HORA{selectedStaff ? `  —  ${selectedStaff.name}` : ''}
          </Text>

          {loadingSlots ? (
            <View style={s.slotsLoading}>
              <ActivityIndicator color="#10B981" size="small" />
              <Text style={[s.slotsLoadingText, { color: tc.textMuted }]}>Verificando disponibilidad...</Text>
            </View>
          ) : dayIsClosed ? (
            <View style={[s.dayClosed, { backgroundColor: '#FEF2F2' }]}>
              <Text style={s.dayClosedTitle}>
                🚫 {selectedStaff ? `${selectedStaff.name} no trabaja este día` : 'Sin atención este día'}
              </Text>
              <Text style={[s.dayClosedSub, { color: tc.textMuted }]}>Selecciona otra fecha o colaborador</Text>
            </View>
          ) : (
            <>
              {durationLabel && (
                <View style={s.durationBadge}>
                  <Text style={s.durationBadgeText}>⏱ {durationLabel}</Text>
                  <TouchableOpacity onPress={() => { setSelectedBlocks([]); setTime('09:00'); }}>
                    <Text style={s.durationBadgeClear}>✕ Limpiar</Text>
                  </TouchableOpacity>
                </View>
              )}
              {timeSlots.length === 0 ? (
                <Text style={[s.noSlots, { color: tc.textMuted }]}>Sin horarios disponibles</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.slotsRow} keyboardShouldPersistTaps="handled">
                  {timeSlots.map(slot => {
                    const isSel = selectedBlocks.includes(slot.time);
                    return (
                      <TouchableOpacity
                        key={slot.time}
                        style={[s.slot, isSel && s.slotSelected, !slot.available && s.slotDisabled]}
                        onPress={() => handleSlotPress(slot)}
                        disabled={!slot.available}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.slotText, isSel && s.slotTextSelected, !slot.available && s.slotTextDisabled]}>
                          {slot.time}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
              <Text style={[s.slotHint, { color: tc.textMuted }]}>Toca un bloque para seleccionar · Desliza para ver más</Text>
            </>
          )}

          {/* ── Notas ── */}
          <Text style={[s.label, { color: tc.textMuted }]}>NOTAS</Text>
          <TextInput style={[s.textArea, { backgroundColor: tc.surface, color: tc.text, borderColor: tc.border }]} value={notes} onChangeText={setNotes} placeholder="Notas opcionales..." placeholderTextColor={tc.textMuted} multiline maxLength={500} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} />

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* iOS Date Panel */}
      {Platform.OS === 'ios' && showDatePanel && (
        <>
          <TouchableOpacity style={s.panelOverlay} activeOpacity={1} onPress={cancelDate} />
          <View style={[s.panel, { backgroundColor: '#fff' }]}>
            <View style={s.panelHeader}>
              <TouchableOpacity onPress={cancelDate}><Text style={s.panelCancel}>Cancelar</Text></TouchableOpacity>
              <Text style={s.panelTitle}>Seleccionar fecha</Text>
              <TouchableOpacity onPress={confirmDate}><Text style={s.panelConfirm}>Listo</Text></TouchableOpacity>
            </View>
            <View style={s.panelPreview}>
              <Text style={s.panelPreviewText}>{formattedTempDate.charAt(0).toUpperCase() + formattedTempDate.slice(1)}</Text>
            </View>
            <DateTimePicker value={tempDate} mode="date" display="spinner" minimumDate={new Date()} locale="es-MX" onChange={(_, d) => { if (d) setTempDate(d); }} style={{ width: '100%' }} textColor="#0F172A" />
            <TouchableOpacity style={s.panelConfirmBtn} onPress={confirmDate}><Text style={s.panelConfirmBtnText}>Confirmar fecha</Text></TouchableOpacity>
          </View>
        </>
      )}

      {/* Modal clientes — useSafeAreaInsets para notch */}
      <Modal visible={showClientPicker} animationType="slide" onRequestClose={closeClientPicker}>
        <View style={[s.fullModal, { backgroundColor: tc.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={[s.fullModalHeader, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
            <TouchableOpacity onPress={closeClientPicker} style={s.back}>
              <MaterialIcons name="close" size={24} color={tc.text} />
            </TouchableOpacity>
            <Text style={[s.headerTitle, { color: tc.text }]}>Seleccionar cliente</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={[s.searchContainer, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
            {showClientSearch ? (
              <View style={[s.searchBox, { backgroundColor: tc.bg, borderColor: '#10B981' }]}>
                <MaterialIcons name="search" size={18} color="#10B981" />
                <TextInput style={[s.searchInputInner, { color: tc.text }]} placeholder="Buscar por nombre o teléfono..." placeholderTextColor={tc.textMuted} value={clientSearch} onChangeText={setClientSearch} autoFocus={true} returnKeyType="search" />
                {clientSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setClientSearch('')}><MaterialIcons name="close" size={16} color={tc.textMuted} /></TouchableOpacity>
                )}
              </View>
            ) : (
              <TouchableOpacity style={[s.searchBox, { backgroundColor: tc.bg, borderColor: tc.border }]} onPress={() => setShowClientSearch(true)}>
                <MaterialIcons name="search" size={18} color={tc.textMuted} />
                <Text style={[s.searchPlaceholder, { color: tc.textMuted }]}>Buscar por nombre o teléfono...</Text>
              </TouchableOpacity>
            )}
          </View>
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            {filteredClients.length === 0 ? (
              <View style={s.emptyState}>
                <MaterialIcons name="person-search" size={40} color={tc.border} />
                <Text style={[s.emptyText, { color: tc.textMuted }]}>{clientSearch ? 'Sin resultados' : 'No hay clientes registrados'}</Text>
                {!clientSearch && (
                  <TouchableOpacity style={s.emptyBtn} onPress={() => { closeClientPicker(); setShowNewClientForm(true); setSelectedClient(null); }}>
                    <MaterialIcons name="person-add-alt" size={16} color="#fff" />
                    <Text style={s.emptyBtnText}>Agregar nuevo cliente</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              filteredClients.map(c => (
                <TouchableOpacity key={c.id} style={[s.clientRow, { borderBottomColor: tc.border }, selectedClient?.id === c.id && { backgroundColor: '#ECFDF5' }]} onPress={() => { setSelectedClient(c); closeClientPicker(); }} activeOpacity={0.7}>
                  <View style={[s.clientAvatar, { backgroundColor: '#10B981' }]}>
                    <Text style={s.clientAvatarText}>{c.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.clientName, { color: tc.text }]}>{c.name}</Text>
                    <Text style={[s.clientPhone, { color: tc.textMuted }]}>{c.phone}</Text>
                  </View>
                  {selectedClient?.id === c.id && <MaterialIcons name="check-circle" size={20} color="#10B981" />}
                </TouchableOpacity>
              ))
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* Modal servicios */}
      <Modal visible={showServicePicker} transparent animationType="slide" onRequestClose={() => setShowServicePicker(false)}>
        <View style={s.sheetOverlay}>
          <View style={[s.sheet, { backgroundColor: tc.surface }]}>
            <View style={s.sheetHandle} />
            <Text style={[s.sheetTitle, { color: tc.text }]}>Seleccionar servicio</Text>
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              {services.length === 0 ? (
                <Text style={[s.emptyText, { color: tc.textMuted, textAlign: 'center', paddingVertical: 30 }]}>Sin servicios configurados</Text>
              ) : (
                services.map(sv => (
                  <TouchableOpacity key={sv.id}
                    style={[s.sheetRow, { borderBottomColor: tc.border }, selectedService?.id === sv.id && { backgroundColor: '#ECFDF5' }]}
                    onPress={() => {
                      setSelectedService(sv);
                      setShowServicePicker(false);
                      // Reajustar bloques seleccionados a la duración del nuevo servicio
                      if (selectedBlocks.length > 0 && timeSlots.length > 0) {
                        const blocks   = Math.ceil(sv.durationMinutes / 30);
                        const firstIdx = timeSlots.findIndex(s => s.time === selectedBlocks[0]);
                        if (firstIdx !== -1) {
                          const range = timeSlots.slice(firstIdx, firstIdx + blocks);
                          if (range.every(s => s.available)) setSelectedBlocks(range.map(s => s.time));
                        }
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.sheetRowMain, { color: tc.text }]}>{sv.name}</Text>
                      <Text style={[s.sheetRowSub, { color: tc.textMuted }]}>{sv.durationMinutes} min  ·  ${sv.price?.toLocaleString('es-MX') ?? 0} MXN</Text>
                    </View>
                    {selectedService?.id === sv.id && <MaterialIcons name="check-circle" size={20} color="#10B981" />}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={[s.sheetCancelBtn, { borderColor: tc.border }]} onPress={() => setShowServicePicker(false)}>
              <Text style={{ color: tc.textMuted, fontWeight: '600' }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal staff */}
      <Modal visible={showStaffPicker} transparent animationType="slide" onRequestClose={() => setShowStaffPicker(false)}>
        <View style={s.sheetOverlay}>
          <View style={[s.sheet, { backgroundColor: tc.surface }]}>
            <View style={s.sheetHandle} />
            <Text style={[s.sheetTitle, { color: tc.text }]}>Asignar colaborador</Text>
            <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={[s.sheetRow, { borderBottomColor: tc.border }, !selectedStaff && { backgroundColor: '#ECFDF5' }]} onPress={() => { setSelectedStaff(null); setShowStaffPicker(false); }} activeOpacity={0.7}>
                <Text style={[s.sheetRowMain, { color: tc.text, flex: 1 }]}>Sin asignar</Text>
                {!selectedStaff && <MaterialIcons name="check-circle" size={20} color="#10B981" />}
              </TouchableOpacity>
              {staffList.map(m => (
                <TouchableOpacity key={m.id} style={[s.sheetRow, { borderBottomColor: tc.border }, selectedStaff?.id === m.id && { backgroundColor: '#ECFDF5' }]} onPress={() => { setSelectedStaff(m); setShowStaffPicker(false); }} activeOpacity={0.7}>
                  <View style={[s.staffDot, { backgroundColor: m.color, marginRight: 10 }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.sheetRowMain, { color: tc.text }]}>{m.name}</Text>
                    {m.id === myStaffId && <Text style={[s.sheetRowSub, { color: '#10B981' }]}>Tú</Text>}
                  </View>
                  {selectedStaff?.id === m.id && <MaterialIcons name="check-circle" size={20} color="#10B981" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={[s.sheetCancelBtn, { borderColor: tc.border }]} onPress={() => setShowStaffPicker(false)}>
              <Text style={{ color: tc.textMuted, fontWeight: '600' }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:           { flex: 1 },
  header:              { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  back:                { padding: 4, width: 40 },
  headerTitle:         { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  saveBtn:             { minWidth: 60, alignItems: 'flex-end' },
  saveBtnText:         { fontSize: 15, fontWeight: '700', color: '#10B981' },
  scroll:              { padding: 16 },
  label:               { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8, marginTop: 20 },
  field:               { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  fieldText:           { flex: 1, fontSize: 15 },
  addClientLink:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  addClientText:       { fontSize: 13, color: '#10B981', fontWeight: '600' },
  newClientBox:        { borderRadius: 14, borderWidth: 1, padding: 14 },
  input:               { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  textArea:            { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, minHeight: 80, textAlignVertical: 'top' },
  staffDot:            { width: 10, height: 10, borderRadius: 5 },
  // Bloques de horario
  slotsLoading:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  slotsLoadingText:    { fontSize: 13 },
  dayClosed:           { borderRadius: 12, padding: 16, alignItems: 'center', gap: 4 },
  dayClosedTitle:      { fontSize: 14, fontWeight: '600', color: '#EF4444', textAlign: 'center' },
  dayClosedSub:        { fontSize: 12, textAlign: 'center' },
  durationBadge:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ECFDF5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8, borderWidth: 1, borderColor: '#10B981' },
  durationBadgeText:   { fontSize: 13, fontWeight: '700', color: '#10B981' },
  durationBadgeClear:  { fontSize: 12, color: '#EF4444', fontWeight: '600' },
  slotsRow:            { flexDirection: 'row' },
  slot:                { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#E5E7EB', marginRight: 8 },
  slotSelected:        { backgroundColor: '#10B981', borderColor: '#10B981' },
  slotDisabled:        { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },
  slotText:            { fontSize: 14, fontWeight: '500', color: '#0F172A' },
  slotTextSelected:    { color: '#ffffff' },
  slotTextDisabled:    { color: '#9CA3AF' },
  slotHint:            { fontSize: 11, marginTop: 8 },
  noSlots:             { fontSize: 13, paddingVertical: 12 },
  // iOS date panel
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
  // Modal clientes full screen
  fullModal:           { flex: 1 },
  fullModalHeader:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  searchContainer:     { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5 },
  searchBox:           { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11 },
  searchInputInner:    { flex: 1, fontSize: 15 },
  searchPlaceholder:   { flex: 1, fontSize: 15 },
  clientRow:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, gap: 12 },
  clientAvatar:        { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  clientAvatarText:    { fontSize: 18, fontWeight: '700', color: '#fff' },
  clientName:          { fontSize: 15, fontWeight: '600' },
  clientPhone:         { fontSize: 12, marginTop: 2 },
  emptyState:          { alignItems: 'center', paddingVertical: 50, gap: 12 },
  emptyText:           { fontSize: 14 },
  emptyBtn:            { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#10B981', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  emptyBtnText:        { color: '#fff', fontWeight: '700', fontSize: 14 },
  // Bottom sheets
  sheetOverlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:               { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36 },
  sheetHandle:         { width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 16 },
  sheetTitle:          { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  sheetRow:            { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 0.5 },
  sheetRowMain:        { fontSize: 15, fontWeight: '600' },
  sheetRowSub:         { fontSize: 12, marginTop: 2 },
  sheetCancelBtn:      { borderRadius: 12, borderWidth: 1, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
});
