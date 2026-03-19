
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, TouchableOpacity, TextInput, ActivityIndicator,
  Modal, Switch, Keyboard, Dimensions,
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
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

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

interface CatalogService {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  durationMinutes: number;
}

const durationLabel = (min: number) =>
  min < 60 ? `${min} min` : min === 60 ? '1 hora' : `${Math.floor(min / 60)}h${min % 60 > 0 ? ` ${min % 60}min` : ''}`;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function NewAppointmentScreen() {
  const router = useRouter();
  const { canSchedule, isGratuito } = usePlan();
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [service, setService] = useState('');
  const [selectedCatalogService, setSelectedCatalogService] = useState<CatalogService | null>(null);
  const [catalogServices, setCatalogServices] = useState<CatalogService[]>([]);
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [serviceSearchQuery, setServiceSearchQuery] = useState('');

  const [date, setDate] = useState(new Date());
  const [showDatePanel, setShowDatePanel] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());
  const [showDatePickerAndroid, setShowDatePickerAndroid] = useState(false);

  const [time, setTime] = useState('09:00');
  const [selectedBlocks, setSelectedBlocks] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [serviceCost, setServiceCost] = useState('');
  const [sendWhatsApp, setSendWhatsApp] = useState(true);

  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [dayIsClosed, setDayIsClosed] = useState(false);
  const [allowOverlapping, setAllowOverlapping] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });

  const serviceInputRef = useRef<TextInput>(null);
  const costInputRef = useRef<TextInput>(null);
  const notesInputRef = useRef<TextInput>(null);

  const dismissKeyboard = () => {
    serviceInputRef.current?.blur();
    costInputRef.current?.blur();
    notesInputRef.current?.blur();
    Keyboard.dismiss();
  };

  const openDatePicker = () => {
    dismissKeyboard();
    if (Platform.OS === 'ios') {
      setTempDate(date);
      setShowDatePanel(true);
    } else {
      setTimeout(() => setShowDatePickerAndroid(true), 150);
    }
  };

  const confirmDateIOS = () => { setDate(tempDate); setShowDatePanel(false); };
  const cancelDateIOS = () => { setTempDate(date); setShowDatePanel(false); };
  const onAndroidDateChange = (_event: any, selected?: Date) => {
    setShowDatePickerAndroid(false);
    if (_event.type === 'set' && selected) setDate(selected);
  };

  const handleSelectCatalogService = (svc: CatalogService) => {
    setSelectedCatalogService(svc);
    setService(svc.name);
    setServiceCost(svc.price.toString());
    const blocks = Math.ceil(svc.durationMinutes / 30);
    if (selectedBlocks.length > 0 && timeSlots.length > 0) {
      const firstIdx = timeSlots.findIndex(s => s.time === selectedBlocks[0]);
      if (firstIdx !== -1) {
        const range = timeSlots.slice(firstIdx, firstIdx + blocks);
        if (range.length > 0 && range.every(s => s.available)) {
          setSelectedBlocks(range.map(s => s.time));
        }
      }
    }
    setShowServicePicker(false);
    setServiceSearchQuery('');
  };

  const clearCatalogService = () => {
    setSelectedCatalogService(null);
    setService('');
    setServiceCost('');
  };

  useEffect(() => {
    loadClients();
    loadOverlapConfig();
    loadCatalogServices();
  }, []);

  const loadCatalogServices = async () => {
    try {
      const data = await apiGet<CatalogService[]>('/api/services');
      setCatalogServices(data);
    } catch (e) {}
  };

  const loadOverlapConfig = async () => {
    try {
      const { supabase } = await import('@/lib/supabase');
      const { getCurrentUserId } = await import('@/utils/api');
      const userId = await getCurrentUserId();
      const { data } = await supabase.from('business_profiles').select('allow_overlapping').eq('user_id', userId).single();
      if (data) setAllowOverlapping(data.allow_overlapping || false);
    } catch (e) {}
  };

  useEffect(() => { checkAvailability(); }, [date]);

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
      // FIX CRÍTICO: usar endpoint por fecha — evita descargar todas las citas del historial
      // Antes: apiGet('/api/appointments') descargaba TODAS sin filtro, con 500 citas era muy lento
      // Ahora: solo trae las citas del día seleccionado, sin canceladas ni no-shows
      const [appointments, businessHours] = await Promise.all([
        apiGet<any[]>(`/api/appointments/date/${dateString}`),
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
      // appointments ya viene filtrado por fecha — no necesita filtro adicional
      const dateAppointments = appointments as any[];
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
    // FIX: calcular endTime basado en los bloques seleccionados (duración real del servicio)
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

  const filteredCatalogServices = catalogServices.filter((s) =>
    s.name.toLowerCase().includes(serviceSearchQuery.toLowerCase())
  );

  const formattedDate = date.toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const formattedTempDate = tempDate.toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const hasCatalog = catalogServices.length > 0;

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
          keyboardDismissMode="on-drag"
          scrollEnabled={!showDatePanel}
        >
          <View style={styles.section}>
            <Text style={styles.label}>Cliente *</Text>
            <TouchableOpacity style={styles.input} onPress={() => { dismissKeyboard(); setShowClientPicker(true); }}>
              <Text style={selectedClient ? styles.inputText : styles.inputPlaceholder}>
                {selectedClient ? selectedClient.name : 'Seleccionar cliente'}
              </Text>
              <IconSymbol android_material_icon_name="arrow-drop-down" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Servicio *</Text>
              {hasCatalog && (
                <TouchableOpacity style={styles.catalogBtn} onPress={() => { dismissKeyboard(); setShowServicePicker(true); }}>
                  <MaterialIcons name="menu-book" size={14} color="#10B981" />
                  <Text style={styles.catalogBtnText}>Ver catálogo</Text>
                </TouchableOpacity>
              )}
            </View>
            {selectedCatalogService ? (
              <View style={styles.catalogSelected}>
                <View style={styles.catalogSelectedIcon}>
                  <MaterialIcons name="content-cut" size={16} color="#10B981" />
                </View>
                <View style={styles.catalogSelectedInfo}>
                  <Text style={styles.catalogSelectedName}>{selectedCatalogService.name}</Text>
                  <Text style={styles.catalogSelectedMeta}>
                    {durationLabel(selectedCatalogService.durationMinutes)} · ${selectedCatalogService.price.toLocaleString('es-MX')} MXN
                  </Text>
                </View>
                <TouchableOpacity onPress={clearCatalogService} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialIcons name="close" size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>
            ) : (
              <TextInput
                ref={serviceInputRef}
                style={styles.textInput}
                value={service}
                onChangeText={setService}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                placeholder={hasCatalog ? 'Escribe o selecciona del catálogo' : 'Ej: Corte de cabello, Manicure...'}
                placeholderTextColor={colors.textSecondary}
              />
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Fecha *</Text>
            <TouchableOpacity style={[styles.input, showDatePanel && styles.inputActive]} onPress={openDatePicker}>
              <Text style={styles.inputText}>{formattedDate}</Text>
              <IconSymbol android_material_icon_name="event" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

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
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeSlotsContainer} keyboardShouldPersistTaps="handled">
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
                          Keyboard.dismiss();
                          if (selectedBlocks.length === 0) {
                            if (selectedCatalogService) {
                              const blocks = Math.ceil(selectedCatalogService.durationMinutes / 30);
                              const thisIdx = timeSlots.findIndex(s => s.time === slot.time);
                              const range = timeSlots.slice(thisIdx, thisIdx + blocks);
                              if (range.length > 0 && range.every(s => s.available)) {
                                setSelectedBlocks(range.map(s => s.time));
                                setTime(slot.time);
                                return;
                              }
                            }
                            setSelectedBlocks([slot.time]); setTime(slot.time);
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
            {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveButtonText}>Guardar Cita</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {Platform.OS === 'ios' && showDatePanel && (
        <>
          <TouchableOpacity style={styles.dateOverlay} activeOpacity={1} onPress={cancelDateIOS} />
          <View style={styles.datePanelContainer}>
            <View style={styles.datePanelHeader}>
              <TouchableOpacity onPress={cancelDateIOS}>
                <Text style={styles.datePanelCancel}>Cancelar</Text>
              </TouchableOpacity>
              <Text style={styles.datePanelTitle}>Seleccionar fecha</Text>
              <TouchableOpacity onPress={confirmDateIOS}>
                <Text style={styles.datePanelConfirmText}>Listo</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.datePanelPreview}>
              <Text style={styles.datePanelPreviewText}>
                {formattedTempDate.charAt(0).toUpperCase() + formattedTempDate.slice(1)}
              </Text>
            </View>
            <DateTimePicker
              value={tempDate}
              mode="date"
              display="spinner"
              minimumDate={new Date()}
              locale="es-MX"
              onChange={(_event, selected) => { if (selected) setTempDate(selected); }}
              style={{ backgroundColor: '#ffffff', width: '100%' }}
              textColor="#0F172A"
            />
            <TouchableOpacity style={styles.datePanelConfirmBtn} onPress={confirmDateIOS}>
              <Text style={styles.datePanelConfirmBtnText}>Confirmar fecha</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {Platform.OS === 'android' && showDatePickerAndroid && (
        <DateTimePicker value={date} mode="date" display="default" minimumDate={new Date()} onChange={onAndroidDateChange} />
      )}

      <Modal visible={showServicePicker} animationType="slide" transparent onRequestClose={() => setShowServicePicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Catálogo de servicios</Text>
              <TouchableOpacity onPress={() => setShowServicePicker(false)}>
                <MaterialIcons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.serviceSearch}>
              <MaterialIcons name="search" size={18} color="#94A3B8" />
              <TextInput
                style={styles.serviceSearchInput}
                value={serviceSearchQuery}
                onChangeText={setServiceSearchQuery}
                placeholder="Buscar servicio..."
                placeholderTextColor="#CBD5E1"
                autoFocus={false}
              />
              {serviceSearchQuery ? (
                <TouchableOpacity onPress={() => setServiceSearchQuery('')}>
                  <MaterialIcons name="close" size={16} color="#94A3B8" />
                </TouchableOpacity>
              ) : null}
            </View>
            <ScrollView style={styles.serviceList}>
              {filteredCatalogServices.length === 0 ? (
                <View style={styles.serviceEmpty}>
                  <MaterialIcons name="content-cut" size={40} color="#CBD5E1" />
                  <Text style={styles.serviceEmptyText}>
                    {serviceSearchQuery ? 'Sin resultados' : 'No tienes servicios en el catálogo'}
                  </Text>
                  {!serviceSearchQuery && (
                    <TouchableOpacity style={styles.serviceEmptyBtn} onPress={() => { setShowServicePicker(false); router.push('/settings/services'); }}>
                      <Text style={styles.serviceEmptyBtnText}>Ir al catálogo →</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                filteredCatalogServices.map((svc) => (
                  <TouchableOpacity
                    key={svc.id}
                    style={[styles.serviceItem, selectedCatalogService?.id === svc.id && styles.serviceItemSelected]}
                    onPress={() => handleSelectCatalogService(svc)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.serviceItemIcon}>
                      <MaterialIcons name="content-cut" size={18} color="#10B981" />
                    </View>
                    <View style={styles.serviceItemInfo}>
                      <Text style={styles.serviceItemName}>{svc.name}</Text>
                      {svc.description ? <Text style={styles.serviceItemDesc}>{svc.description}</Text> : null}
                      <View style={styles.serviceItemMeta}>
                        <View style={styles.serviceMetaChip}>
                          <MaterialIcons name="access-time" size={11} color="#94A3B8" />
                          <Text style={styles.serviceMetaText}>{durationLabel(svc.durationMinutes)}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.serviceItemPrice}>
                      <Text style={styles.serviceItemPriceText}>${svc.price.toLocaleString('es-MX')}</Text>
                      <Text style={styles.serviceItemPriceSub}>MXN</Text>
                    </View>
                    {selectedCatalogService?.id === svc.id && (
                      <MaterialIcons name="check-circle" size={20} color="#10B981" style={{ marginLeft: 8 }} />
                    )}
                  </TouchableOpacity>
                ))
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showClientPicker} animationType="slide" transparent onRequestClose={() => setShowClientPicker(false)}>
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
                    <TouchableOpacity style={styles.addClientButton} onPress={() => { setShowClientPicker(false); router.push('/clients/new'); }}>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backButton: { padding: 4 },
  title: { fontSize: 20, fontWeight: '600', color: colors.text },
  placeholder: { width: 32 },
  content: { flex: 1, padding: 20 },
  section: { marginBottom: 24 },
  inputGroup: { marginBottom: 24 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 16, fontWeight: '600', color: colors.text },
  catalogBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  catalogBtnText: { fontSize: 12, fontWeight: '600', color: '#10B981' },
  input: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ffffff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  inputActive: { borderColor: colors.primary, borderWidth: 2 },
  inputText: { fontSize: 16, color: colors.text },
  inputPlaceholder: { fontSize: 16, color: colors.textSecondary },
  textInput: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: '#E5E7EB' },
  textArea: { minHeight: 100 },
  catalogSelected: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#BBF7D0' },
  catalogSelectedIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center' },
  catalogSelectedInfo: { flex: 1 },
  catalogSelectedName: { fontSize: 15, fontWeight: '700', color: '#065F46' },
  catalogSelectedMeta: { fontSize: 12, color: '#10B981', marginTop: 2, fontWeight: '500' },
  dayClosedContainer: { backgroundColor: '#FEF2F2', borderRadius: 12, padding: 16, marginTop: 8 },
  dayClosedText: { fontSize: 15, fontWeight: '600', color: '#EF4444', textAlign: 'center' },
  dayClosedSubtext: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginTop: 4 },
  durationBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ECFDF5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8, borderWidth: 1, borderColor: '#10B981' },
  durationText: { fontSize: 13, fontWeight: '700', color: '#10B981' },
  durationClear: { fontSize: 12, color: '#EF4444', fontWeight: '600' },
  timeSlotOverlap: { borderWidth: 1, borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
  timeSlotsContainer: { flexDirection: 'row' },
  timeSlot: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#E5E7EB', marginRight: 8 },
  timeSlotSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  timeSlotDisabled: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },
  timeSlotText: { fontSize: 14, fontWeight: '500', color: colors.text },
  timeSlotTextSelected: { color: '#ffffff' },
  timeSlotTextDisabled: { color: '#9CA3AF' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ffffff', borderRadius: 12, padding: 16 },
  switchLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  switchText: { fontSize: 16, fontWeight: '600', color: colors.text },
  saveButton: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8, marginBottom: 32 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  dateOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.40)' },
  datePanelContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 },
  datePanelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0' },
  datePanelTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  datePanelCancel: { fontSize: 15, color: '#94A3B8', fontWeight: '500' },
  datePanelConfirmText: { fontSize: 15, color: '#10B981', fontWeight: '700' },
  datePanelPreview: { alignItems: 'center', paddingVertical: 12, marginHorizontal: 20, marginTop: 14, backgroundColor: '#F0FDF4', borderRadius: 12, borderWidth: 0.5, borderColor: '#BBF7D0' },
  datePanelPreviewText: { fontSize: 15, fontWeight: '600', color: '#10B981', textTransform: 'capitalize' },
  datePanelConfirmBtn: { backgroundColor: '#10B981', marginHorizontal: 20, marginTop: 12, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  datePanelConfirmBtnText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  serviceSearch: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 12, marginHorizontal: 16, marginTop: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 0.5, borderColor: '#E2E8F0' },
  serviceSearchInput: { flex: 1, fontSize: 14, color: '#0F172A' },
  serviceList: { padding: 16 },
  serviceEmpty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  serviceEmptyText: { fontSize: 15, color: '#94A3B8', textAlign: 'center' },
  serviceEmptyBtn: { backgroundColor: '#ECFDF5', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  serviceEmptyBtnText: { color: '#10B981', fontWeight: '700', fontSize: 14 },
  serviceItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 0.5, borderColor: '#E2E8F0' },
  serviceItemSelected: { borderColor: '#10B981', borderWidth: 1.5, backgroundColor: '#F0FDF4' },
  serviceItemIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center' },
  serviceItemInfo: { flex: 1 },
  serviceItemName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  serviceItemDesc: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  serviceItemMeta: { flexDirection: 'row', gap: 8, marginTop: 5 },
  serviceMetaChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  serviceMetaText: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  serviceItemPrice: { alignItems: 'flex-end' },
  serviceItemPriceText: { fontSize: 16, fontWeight: '800', color: '#10B981' },
  serviceItemPriceSub: { fontSize: 10, color: '#94A3B8' },
  searchInput: { backgroundColor: colors.background, borderRadius: 12, padding: 12, margin: 20, marginBottom: 0, fontSize: 16, color: colors.text },
  clientsList: { padding: 20 },
  emptyClientState: { alignItems: 'center', paddingVertical: 40 },
  emptyClientText: { fontSize: 16, color: colors.textSecondary, marginBottom: 16 },
  addClientButton: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  addClientButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  clientItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  clientAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  clientAvatarText: { fontSize: 20, fontWeight: '600', color: '#ffffff' },
  clientInfo: { flex: 1 },
  clientName: { fontSize: 16, fontWeight: '600', color: colors.text },
  clientPhone: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
});
