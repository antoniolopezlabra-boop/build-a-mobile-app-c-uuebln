
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Switch,
  Keyboard,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { apiGet, apiPost } from '@/utils/api';
import { invalidateCache } from '@/utils/cache';
import React, { useEffect, useState, useRef } from 'react';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
import { usePlan } from '@/contexts/PlanContext';
import { ConfirmModal } from '@/components/button';
import DateTimePicker from '@react-native-community/datetimepicker';

interface Client {
  id: string;
  name: string;
  phone: string;
}

interface TimeSlot {
  time: string;
  available: boolean;
  endTime?: string;
  isOverlap?: boolean;
}

export default function NewAppointmentScreen() {
  const router = useRouter();
  const { canSchedule, isGratuito } = usePlan();
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [service, setService] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [time, setTime] = useState('09:00');
  const [selectedBlocks, setSelectedBlocks] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [serviceCost, setServiceCost] = useState('');
  const [sendWhatsApp, setSendWhatsApp] = useState(true);

  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [dayIsClosed, setDayIsClosed] = useState(false);
  const [allowOverlapping, setAllowOverlapping] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });

  // ─── Refs de los TextInput para poder hacer .blur() explícito ───────────
  const serviceInputRef = useRef<TextInput>(null);
  const costInputRef = useRef<TextInput>(null);
  const notesInputRef = useRef<TextInput>(null);

  // ─── Cierra TODOS los inputs antes de mostrar el date picker ────────────
  const openDatePicker = () => {
    // 1. Quita el foco de cualquier TextInput activo
    serviceInputRef.current?.blur();
    costInputRef.current?.blur();
    notesInputRef.current?.blur();
    // 2. Dispara Keyboard.dismiss() para asegurarse que el teclado baja
    Keyboard.dismiss();
    // 3. Pequeño delay para que el teclado cierre antes de que aparezca el picker
    setTimeout(() => setShowDatePicker(true), Platform.OS === 'android' ? 150 : 50);
  };

  useEffect(() => {
    loadClients();
    loadOverlapConfig();
  }, []);

  const loadOverlapConfig = async () => {
    try {
      const { supabase } = await import('@/lib/supabase');
      const { getCurrentUserId } = await import('@/utils/api');
      const userId = await getCurrentUserId();
      const { data } = await supabase.from('business_profiles').select('allow_overlapping').eq('user_id', userId).single();
      if (data) setAllowOverlapping(data.allow_overlapping || false);
    } catch (e) {}
  };

  useEffect(() => {
    checkAvailability();
  }, [date]);

  const loadClients = async () => {
    try {
      const data = await apiGet<Client[]>('/api/clients');
      setClients(data);
    } catch (error) {
      setErrorModal({ visible: true, message: 'Error al cargar los clientes' });
    }
  };

  const generateTimeSlots = () => {
    const slots: TimeSlot[] = [];
    for (let hour = 9; hour < 19; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        slots.push({ time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`, available: true });
      }
    }
    setTimeSlots(slots);
  };

  const checkAvailability = async () => {
    try {
      const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const [appointments, businessHours] = await Promise.all([
        apiGet<any[]>('/api/appointments'),
        apiGet<any[]>('/api/business-hours'),
      ]);
      const dayOfWeek = date.getDay();
      const defaultHours = [
        { dayOfWeek: 0, isOpen: false, startTime: '09:00', endTime: '18:00' },
        { dayOfWeek: 1, isOpen: true,  startTime: '09:00', endTime: '18:00' },
        { dayOfWeek: 2, isOpen: true,  startTime: '09:00', endTime: '18:00' },
        { dayOfWeek: 3, isOpen: true,  startTime: '09:00', endTime: '18:00' },
        { dayOfWeek: 4, isOpen: true,  startTime: '09:00', endTime: '18:00' },
        { dayOfWeek: 5, isOpen: true,  startTime: '09:00', endTime: '18:00' },
        { dayOfWeek: 6, isOpen: false, startTime: '09:00', endTime: '18:00' },
      ];
      const hoursToUse = (businessHours as any[]).length > 0 ? businessHours as any[] : defaultHours;
      const dayConfig = hoursToUse.find((d: any) => d.dayOfWeek === dayOfWeek);
      if (!dayConfig || !dayConfig.isOpen) { setDayIsClosed(true); setTimeSlots([]); return; }
      setDayIsClosed(false);
      setSelectedBlocks([]);
      const startHour = parseInt(dayConfig.startTime.split(':')[0]);
      const startMin  = parseInt(dayConfig.startTime.split(':')[1]);
      const endHour   = parseInt(dayConfig.endTime.split(':')[0]);
      const endMin    = parseInt(dayConfig.endTime.split(':')[1]);
      const dateAppointments = (appointments as any[]).filter((appt: any) =>
        appt.date === dateString && !['Cancelada', 'No-show'].includes(appt.status)
      );
      const slots: TimeSlot[] = [];
      const today = new Date();
      const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const isToday = dateString === todayString;
      for (let totalMin = startHour * 60 + startMin; totalMin < endHour * 60 + endMin; totalMin += 30) {
        const hour = Math.floor(totalMin / 60);
        const minute = totalMin % 60;
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const isBooked = dateAppointments.some((appt: any) => {
          const [sh, sm] = (appt.time || '00:00').split(':').map(Number);
          const [eh, em] = (appt.endTime || appt.end_time || '00:00').split(':').map(Number);
          return totalMin >= sh * 60 + sm && totalMin < eh * 60 + em;
        });
        const isOverlap = isBooked && allowOverlapping;
        const isPast = isToday && (hour < today.getHours() || (hour === today.getHours() && minute <= today.getMinutes()));
        slots.push({ time: timeString, available: (!isBooked || isOverlap) && !isPast, isOverlap });
      }
      setTimeSlots(slots);
    } catch (error) {
      generateTimeSlots();
    }
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    if (!canSchedule) {
      setErrorModal({ visible: true, message: '⚠️ Tu plan Gratuito no permite agendar citas. Actualiza a Plan Básico para comenzar.' });
      return;
    }
    if (!selectedClient) { setErrorModal({ visible: true, message: 'Por favor selecciona un cliente' }); return; }
    if (!service.trim())  { setErrorModal({ visible: true, message: 'Por favor ingresa el servicio' }); return; }
    const lastBlock = selectedBlocks.length > 0 ? selectedBlocks[selectedBlocks.length - 1] : time;
    const [lh, lm] = lastBlock.split(':').map(Number);
    const endMinutes = lh * 60 + lm + 30;
    const calculatedEndTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;
    const selectedSlot = timeSlots.find((slot) => slot.time === time);
    if (!selectedSlot || !selectedSlot.available) {
      setErrorModal({ visible: true, message: 'El horario seleccionado no está disponible. Por favor elige otro.' });
      return;
    }
    setLoading(true);
    try {
      const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      await apiPost('/api/appointments', {
        clientId: selectedClient.id,
        service: service.trim(),
        date: dateString,
        time,
        status: 'Pendiente',
        notes: notes.trim() || undefined,
        service_cost: serviceCost ? parseFloat(serviceCost) : 0,
        endTime: calculatedEndTime,
        isOverlapping: selectedBlocks.some(b => timeSlots.find(s => s.time === b)?.isOverlap),
      });
      invalidateCache('dashboard_stats');
      invalidateCache('today_appointments');
      invalidateCache('appointments_list');
      router.back();
    } catch (error: any) {
      setErrorModal({ visible: true, message: error?.message || 'Error al crear la cita' });
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.phone.includes(searchQuery)
  );

  const formattedDate = date.toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Nueva Cita</Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // Al hacer scroll el usuario también puede querer cerrar el teclado
          keyboardDismissMode="on-drag"
        >
          {/* Cliente */}
          <View style={styles.section}>
            <Text style={styles.label}>Cliente *</Text>
            <TouchableOpacity
              style={styles.input}
              onPress={() => {
                Keyboard.dismiss();
                setShowClientPicker(true);
              }}
            >
              <Text style={selectedClient ? styles.inputText : styles.inputPlaceholder}>
                {selectedClient ? selectedClient.name : 'Seleccionar cliente'}
              </Text>
              <IconSymbol android_material_icon_name="arrow-drop-down" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Servicio */}
          <View style={styles.section}>
            <Text style={styles.label}>Servicio *</Text>
            <TextInput
              ref={serviceInputRef}
              style={styles.textInput}
              value={service}
              onChangeText={setService}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              placeholder="Ej: Corte de cabello, Manicure, etc."
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          {/* Fecha — ❗ abre picker solo después de cerrar teclado */}
          <View style={styles.section}>
            <Text style={styles.label}>Fecha *</Text>
            <TouchableOpacity style={styles.input} onPress={openDatePicker}>
              <Text style={styles.inputText}>{formattedDate}</Text>
              <IconSymbol android_material_icon_name="event" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Slots de hora */}
          <View style={styles.section}>
            <Text style={styles.label}>Hora *</Text>
            {dayIsClosed ? (
              <View style={styles.dayClosedContainer}>
                <Text style={styles.dayClosedText}>🚫 Este día no tienes atención configurada</Text>
                <Text style={styles.dayClosedSubtext}>Selecciona otro día o actualiza tu horario en Ajustes</Text>
              </View>
            ) : (
              <>
                {selectedBlocks.length > 0 && (
                  <View style={styles.durationBadge}>
                    <Text style={styles.durationText}>
                      ⏱ {selectedBlocks[0]} → {(() => {
                        const [h, m] = selectedBlocks[selectedBlocks.length - 1].split(':').map(Number);
                        const e = h * 60 + m + 30;
                        return `${Math.floor(e / 60).toString().padStart(2, '0')}:${(e % 60).toString().padStart(2, '0')}`;
                      })()} · {selectedBlocks.length * 30} min
                    </Text>
                    <TouchableOpacity onPress={() => { setSelectedBlocks([]); setTime('09:00'); }}>
                      <Text style={styles.durationClear}>✕ Limpiar</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.timeSlotsContainer}
                  keyboardShouldPersistTaps="handled"
                >
                  {timeSlots.map((slot) => {
                    const isSelected = selectedBlocks.includes(slot.time);
                    const isOverlap = slot.isOverlap && !isSelected;
                    return (
                      <TouchableOpacity
                        key={slot.time}
                        style={[
                          styles.timeSlot,
                          isSelected && styles.timeSlotSelected,
                          !slot.available && styles.timeSlotDisabled,
                          isOverlap && styles.timeSlotOverlap,
                        ]}
                        onPress={() => {
                          if (!slot.available) return;
                          // Cerrar teclado al seleccionar hora
                          Keyboard.dismiss();
                          if (selectedBlocks.length === 0) {
                            setSelectedBlocks([slot.time]);
                            setTime(slot.time);
                          } else {
                            const firstIdx = timeSlots.findIndex(s => s.time === selectedBlocks[0]);
                            const thisIdx  = timeSlots.findIndex(s => s.time === slot.time);
                            if (thisIdx < firstIdx) {
                              setSelectedBlocks([slot.time]);
                              setTime(slot.time);
                            } else {
                              const range = timeSlots.slice(firstIdx, thisIdx + 1);
                              if (range.every(s => s.available)) {
                                setSelectedBlocks(range.map(s => s.time));
                              }
                            }
                          }
                        }}
                        disabled={!slot.available}
                      >
                        <Text style={[
                          styles.timeSlotText,
                          isSelected && styles.timeSlotTextSelected,
                          !slot.available && styles.timeSlotTextDisabled,
                          isOverlap && { color: '#F59E0B' },
                        ]}>
                          {slot.time}
                        </Text>
                        {slot.isOverlap && <Text style={{ fontSize: 8, color: '#F59E0B' }}>⚡</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}
          </View>

          {/* Costo */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Costo del servicio (MXN)</Text>
            <TextInput
              ref={costInputRef}
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
              value={serviceCost}
              onChangeText={t => setServiceCost(t.replace(/[^0-9.]/g, ''))}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              keyboardType="decimal-pad"
            />
          </View>

          {/* Notas */}
          <View style={styles.section}>
            <Text style={styles.label}>Notas (opcional)</Text>
            <TextInput
              ref={notesInputRef}
              style={[styles.textInput, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              placeholder="Notas adicionales..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* WhatsApp toggle */}
          <View style={styles.section}>
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <IconSymbol android_material_icon_name="message" size={20} color={colors.primary} />
                <Text style={styles.switchText}>Enviar confirmación por WhatsApp</Text>
              </View>
              <Switch
                value={sendWhatsApp}
                onValueChange={setSendWhatsApp}
                trackColor={{ false: '#D1D5DB', true: colors.primary }}
                thumbColor="#ffffff"
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, loading && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.saveButtonText}>Guardar Cita</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal de clientes */}
      <Modal
        visible={showClientPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowClientPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar Cliente</Text>
              <TouchableOpacity onPress={() => setShowClientPicker(false)}>
                <IconSymbol android_material_icon_name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Buscar cliente..."
              placeholderTextColor={colors.textSecondary}
              autoFocus={false}
            />
            <ScrollView style={styles.clientsList}>
              {filteredClients.length === 0 ? (
                <View style={styles.emptyClientState}>
                  <Text style={styles.emptyClientText}>
                    {searchQuery ? 'No se encontraron clientes' : 'No tienes clientes registrados'}
                  </Text>
                  {!searchQuery && (
                    <TouchableOpacity
                      style={styles.addClientButton}
                      onPress={() => { setShowClientPicker(false); router.push('/clients/new'); }}
                    >
                      <Text style={styles.addClientButtonText}>Agregar cliente</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                filteredClients.map((client) => (
                  <TouchableOpacity
                    key={client.id}
                    style={styles.clientItem}
                    onPress={() => { setSelectedClient(client); setShowClientPicker(false); setSearchQuery(''); }}
                  >
                    <View style={styles.clientAvatar}>
                      <Text style={styles.clientAvatarText}>{client.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.clientInfo}>
                      <Text style={styles.clientName}>{client.name}</Text>
                      <Text style={styles.clientPhone}>{client.phone}</Text>
                    </View>
                    {selectedClient?.id === client.id && (
                      <IconSymbol android_material_icon_name="check" size={24} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Date picker — solo se muestra cuando el teclado ya bajó */}
      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display="spinner"
          minimumDate={new Date()}
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) setDate(selectedDate);
          }}
        />
      )}

      <ConfirmModal
        visible={errorModal.visible}
        title="Error"
        message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'default' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backButton: { padding: 4 },
  title: { fontSize: 20, fontWeight: '600', color: colors.text },
  placeholder: { width: 32 },
  content: { flex: 1, padding: 20 },
  section: { marginBottom: 24 },
  inputGroup: { marginBottom: 24 },
  label: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 8 },
  input: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#ffffff', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  inputText: { fontSize: 16, color: colors.text },
  inputPlaceholder: { fontSize: 16, color: colors.textSecondary },
  textInput: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 16,
    fontSize: 16, color: colors.text, borderWidth: 1, borderColor: '#E5E7EB',
  },
  textArea: { minHeight: 100 },
  dayClosedContainer: { backgroundColor: '#FEF2F2', borderRadius: 12, padding: 16, marginTop: 8 },
  dayClosedText: { fontSize: 15, fontWeight: '600', color: '#EF4444', textAlign: 'center' },
  dayClosedSubtext: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginTop: 4 },
  durationBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#ECFDF5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 8, borderWidth: 1, borderColor: '#10B981',
  },
  durationText: { fontSize: 13, fontWeight: '700', color: '#10B981' },
  durationClear: { fontSize: 12, color: '#EF4444', fontWeight: '600' },
  timeSlotOverlap: { borderWidth: 1, borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
  timeSlotsContainer: { flexDirection: 'row' },
  timeSlot: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8,
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#E5E7EB', marginRight: 8,
  },
  timeSlotSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  timeSlotDisabled: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },
  timeSlotText: { fontSize: 14, fontWeight: '500', color: colors.text },
  timeSlotTextSelected: { color: '#ffffff' },
  timeSlotTextDisabled: { color: '#9CA3AF' },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#ffffff', borderRadius: 12, padding: 16,
  },
  switchLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  switchText: { fontSize: 16, fontWeight: '600', color: colors.text },
  saveButton: {
    backgroundColor: colors.primary, borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 8, marginBottom: 32,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start', paddingTop: 100,
  },
  modalContent: { backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  modalTitle: { fontSize: 20, fontWeight: '600', color: colors.text },
  searchInput: {
    backgroundColor: colors.background, borderRadius: 12,
    padding: 12, margin: 20, marginBottom: 0, fontSize: 16, color: colors.text,
  },
  clientsList: { padding: 20 },
  emptyClientState: { alignItems: 'center', paddingVertical: 40 },
  emptyClientText: { fontSize: 16, color: colors.textSecondary, marginBottom: 16 },
  addClientButton: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  addClientButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  clientItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  clientAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  clientAvatarText: { fontSize: 20, fontWeight: '600', color: '#ffffff' },
  clientInfo: { flex: 1 },
  clientName: { fontSize: 16, fontWeight: '600', color: colors.text },
  clientPhone: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
});
