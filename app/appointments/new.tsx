
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Switch,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { apiGet, apiPost } from '@/utils/api';
import React, { useEffect, useState } from 'react';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter } from 'expo-router';
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
}

export default function NewAppointmentScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [service, setService] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [time, setTime] = useState('09:00');
  const [notes, setNotes] = useState('');
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });

  useEffect(() => {
    loadClients();
    generateTimeSlots();
  }, []);

  useEffect(() => {
    checkAvailability();
  }, [date]);

  const loadClients = async () => {
    try {
      console.log('[NewAppointment] Loading clients');
      const data = await apiGet<Client[]>('/api/clients');
      setClients(data);
    } catch (error) {
      console.error('[NewAppointment] Error loading clients:', error);
    }
  };

  const generateTimeSlots = () => {
    const slots: TimeSlot[] = [];
    const businessHoursStart = 9;
    const businessHoursEnd = 19;
    
    for (let hour = businessHoursStart; hour < businessHoursEnd; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        slots.push({ time: timeString, available: true });
      }
    }
    
    setTimeSlots(slots);
  };

  const checkAvailability = async () => {
    try {
      const dateString = date.toISOString().split('T')[0];
      console.log('[NewAppointment] Checking availability for', dateString);
      const appointments = await apiGet<any[]>('/api/appointments');
      
      const dateAppointments = appointments.filter((appt: any) => appt.date === dateString);
      
      const slots: TimeSlot[] = [];
      const businessHoursStart = 9;
      const businessHoursEnd = 19;
      
      for (let hour = businessHoursStart; hour < businessHoursEnd; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
          const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          const isBooked = dateAppointments.some((appt: any) => appt.time === timeString);
          slots.push({ time: timeString, available: !isBooked });
        }
      }
      
      setTimeSlots(slots);
    } catch (error) {
      console.error('[NewAppointment] Error checking availability:', error);
      generateTimeSlots();
    }
  };

  const handleSave = async () => {
    console.log('[NewAppointment] Saving new appointment');
    
    if (!selectedClient) {
      setErrorModal({ visible: true, message: 'Por favor selecciona un cliente' });
      return;
    }
    
    if (!service.trim()) {
      setErrorModal({ visible: true, message: 'Por favor ingresa el servicio' });
      return;
    }

    const selectedSlot = timeSlots.find((slot) => slot.time === time);
    if (!selectedSlot || !selectedSlot.available) {
      setErrorModal({ visible: true, message: 'El horario seleccionado no está disponible. Por favor elige otro.' });
      return;
    }

    setLoading(true);
    try {
      const dateString = date.toISOString().split('T')[0];
      
      const newAppointment = {
        clientId: selectedClient.id,
        service: service.trim(),
        date: dateString,
        time: time,
        status: 'Pendiente',
        notes: notes.trim() || undefined,
      };

      console.log('[NewAppointment] Creating appointment:', newAppointment);
      await apiPost('/api/appointments', newAppointment);
      
      console.log('[NewAppointment] Appointment created successfully');
      router.back();
    } catch (error: any) {
      console.error('[NewAppointment] Error creating appointment:', error);
      setErrorModal({ visible: true, message: error?.message || 'Error al crear la cita' });
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = clients.filter((client) =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.phone.includes(searchQuery)
  );

  const formattedDate = date.toLocaleDateString('es-MX', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={styles.title}>Nueva Cita</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Client selector */}
        <View style={styles.section}>
          <Text style={styles.label}>Cliente *</Text>
          <TouchableOpacity
            style={styles.input}
            onPress={() => setShowClientPicker(true)}
          >
            <Text style={selectedClient ? styles.inputText : styles.inputPlaceholder}>
              {selectedClient ? selectedClient.name : 'Seleccionar cliente'}
            </Text>
            <IconSymbol
              ios_icon_name="chevron.down"
              android_material_icon_name="arrow-downward"
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* Service text input */}
        <View style={styles.section}>
          <Text style={styles.label}>Servicio *</Text>
          <TextInput
            style={styles.textInput}
            value={service}
            onChangeText={setService}
            placeholder="Ej: Corte de cabello, Manicure, etc."
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        {/* Date selector */}
        <View style={styles.section}>
          <Text style={styles.label}>Fecha *</Text>
          <TouchableOpacity
            style={styles.input}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={styles.inputText}>{formattedDate}</Text>
            <IconSymbol
              ios_icon_name="calendar"
              android_material_icon_name="event"
              size={20}
              color={colors.primary}
            />
          </TouchableOpacity>
        </View>

        {/* Time slots */}
        <View style={styles.section}>
          <Text style={styles.label}>Hora *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeSlotsContainer}>
            {timeSlots.map((slot) => {
              const isSelected = slot.time === time;
              const slotAvailable = slot.available;
              
              return (
                <TouchableOpacity
                  key={slot.time}
                  style={[
                    styles.timeSlot,
                    isSelected && styles.timeSlotSelected,
                    !slotAvailable && styles.timeSlotDisabled,
                  ]}
                  onPress={() => slotAvailable && setTime(slot.time)}
                  disabled={!slotAvailable}
                >
                  <Text
                    style={[
                      styles.timeSlotText,
                      isSelected && styles.timeSlotTextSelected,
                      !slotAvailable && styles.timeSlotTextDisabled,
                    ]}
                  >
                    {slot.time}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.label}>Notas</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
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
              <IconSymbol
                ios_icon_name="message"
                android_material_icon_name="message"
                size={20}
                color={colors.primary}
              />
              <Text style={styles.label}>Enviar confirmación por WhatsApp</Text>
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

      {/* Client picker modal */}
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
                <IconSymbol
                  ios_icon_name="xmark"
                  android_material_icon_name="close"
                  size={24}
                  color={colors.text}
                />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Buscar cliente..."
              placeholderTextColor={colors.textSecondary}
            />

            <ScrollView style={styles.clientsList}>
              {filteredClients.length === 0 ? (
                <Text style={[styles.hintText, { padding: 20 }]}>
                  {searchQuery ? 'No se encontraron clientes' : 'No tienes clientes registrados'}
                </Text>
              ) : (
                filteredClients.map((client) => (
                  <TouchableOpacity
                    key={client.id}
                    style={styles.clientItem}
                    onPress={() => {
                      setSelectedClient(client);
                      setShowClientPicker(false);
                      setSearchQuery('');
                    }}
                  >
                    <View style={styles.clientAvatar}>
                      <Text style={styles.clientAvatarText}>
                        {client.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.clientInfo}>
                      <Text style={styles.clientName}>{client.name}</Text>
                      <Text style={styles.clientPhone}>{client.phone}</Text>
                    </View>
                    {selectedClient?.id === client.id && (
                      <IconSymbol
                        ios_icon_name="checkmark"
                        android_material_icon_name="check"
                        size={24}
                        color={colors.primary}
                      />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display="default"
          minimumDate={new Date()}
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) {
              setDate(selectedDate);
            }
          }}
        />
      )}

      <ConfirmModal
        visible={errorModal.visible}
        title="Error"
        message={errorModal.message}
        buttons={[
          {
            text: 'OK',
            onPress: () => setErrorModal({ visible: false, message: '' }),
            style: 'default',
          },
        ]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  inputText: {
    fontSize: 16,
    color: colors.text,
  },
  inputPlaceholder: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  textInput: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  textArea: {
    minHeight: 100,
  },
  timeSlotsContainer: {
    flexDirection: 'row',
  },
  timeSlot: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
  },
  timeSlotSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  timeSlotDisabled: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  timeSlotText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  timeSlotTextSelected: {
    color: '#ffffff',
  },
  timeSlotTextDisabled: {
    color: '#9CA3AF',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
  },
  switchLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  searchInput: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    margin: 20,
    marginBottom: 0,
    fontSize: 16,
    color: colors.text,
  },
  clientsList: {
    padding: 20,
  },
  clientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  clientAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clientAvatarText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  clientPhone: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  hintText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
  },
});
