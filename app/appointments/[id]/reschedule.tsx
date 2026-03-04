
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { apiGet, apiPut } from '@/utils/api';
import React, { useEffect, useState } from 'react';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ConfirmModal } from '@/components/button';
import DateTimePicker from '@react-native-community/datetimepicker';

interface TimeSlot {
  time: string;
  available: boolean;
}

interface Appointment {
  id: string;
  date: string;
  time: string;
  service: string;
  status: string;
  client: {
    id: string;
    name: string;
  };
  userId: string;
  clientId: string;
}

export default function RescheduleAppointmentScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [time, setTime] = useState('09:00');
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });

  useEffect(() => {
    loadAppointment();
  }, [id]);

  useEffect(() => {
    if (appointment) {
      checkAvailability();
    }
  }, [date, appointment]);

  const loadAppointment = async () => {
    setLoading(true);
    try {
      console.log('[Reschedule] Loading appointment:', id);
      const appointments = await apiGet<Appointment[]>('/api/appointments');
      const found = appointments.find((appt) => appt.id === id);
      if (found) {
        console.log('[Reschedule] Loaded appointment:', found);
        setAppointment(found);
        setDate(new Date(found.date + 'T12:00:00'));
        setTime(found.time);
      } else {
        console.error('[Reschedule] Appointment not found');
        router.back();
      }
    } catch (error) {
      console.error('[Reschedule] Error loading appointment:', error);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const checkAvailability = async () => {
    if (!appointment) return;
    try {
      const dateString = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      console.log('[Reschedule] Checking availability for', dateString);
      const appointments = await apiGet<any[]>('/api/appointments');
      
      const dateAppointments = appointments.filter(
        (appt: any) => appt.date === dateString && appt.id !== appointment.id
      );
      
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
      console.error('[Reschedule] Error checking availability:', error);
      // Generate default slots if check fails
      const slots: TimeSlot[] = [];
      for (let hour = 9; hour < 19; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
          const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          slots.push({ time: timeString, available: true });
        }
      }
      setTimeSlots(slots);
    }
  };

  const handleSave = async () => {
    if (!appointment) return;

    console.log('[Reschedule] Rescheduling appointment');
    
    const selectedSlot = timeSlots.find((slot) => slot.time === time);
    if (!selectedSlot || !selectedSlot.available) {
      setErrorModal({
        visible: true,
        message: 'El horario seleccionado no está disponible. Por favor elige otro.',
      });
      return;
    }

    setSaving(true);
    try {
      const dateString = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      
      // Use PUT /api/appointments/{id} to reschedule
      await apiPut(`/api/appointments/${appointment.id}`, {
        date: dateString,
        time: time,
        status: 'Pendiente',
      });

      console.log('[Reschedule] Appointment rescheduled successfully');
      router.back();
    } catch (error: any) {
      console.error('[Reschedule] Error rescheduling appointment:', error);
      setErrorModal({ visible: true, message: error?.message || 'Error al reagendar la cita' });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !appointment) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Cargando...</Text>
        </View>
      </SafeAreaView>
    );
  }

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
        <Text style={styles.title}>Reagendar Cita</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Cita actual</Text>
          <Text style={styles.infoClient}>{appointment.client?.name || 'Cliente'}</Text>
          <Text style={styles.infoService}>{appointment.service || 'Servicio'}</Text>
          <Text style={styles.infoDateTime}>
            {new Date(appointment.date + 'T12:00:00').toLocaleDateString('es-MX')} • {appointment.time}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Nueva Fecha</Text>
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

        <View style={styles.section}>
          <Text style={styles.label}>Nueva Hora</Text>
          {timeSlots.length === 0 ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
          ) : (
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
          )}
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.saveButtonText}>Guardar Cambios</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display="spinner"
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
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
  infoCard: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  infoClient: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  infoService: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 8,
  },
  infoDateTime: {
    fontSize: 14,
    color: colors.textSecondary,
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
  hintText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
  },
});
