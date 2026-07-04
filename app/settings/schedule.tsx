import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import TimePickerModal from '@/components/TimePickerModal';
import { apiGet, apiPut } from '@/utils/api';

interface DaySchedule { dayOfWeek: number; isOpen: boolean; startTime: string; endTime: string; }

const DAYS = [
  { name: 'Lunes', value: 1 }, { name: 'Martes', value: 2 },
  { name: 'Miércoles', value: 3 }, { name: 'Jueves', value: 4 },
  { name: 'Viernes', value: 5 }, { name: 'Sábado', value: 6 },
  { name: 'Domingo', value: 0 },
];

export default function ScheduleSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [schedule, setSchedule] = useState<DaySchedule[]>([]);
  const [showTimePicker, setShowTimePicker] = useState<{ visible: boolean; dayOfWeek: number; field: 'startTime' | 'endTime' } | null>(null);
  const [errorModal,   setErrorModal]   = useState({ visible: false, message: '' });
  const [successModal, setSuccessModal] = useState(false);

  // ⚡ Padding inferior dinámico para respetar zona de tolerancia (May 17 2026)
  const safeBottom = Math.max(insets.bottom, 16);

  useEffect(() => { loadSchedule(); }, []);

  const loadSchedule = async () => {
    setLoading(true);
    try {
      const data = await apiGet<DaySchedule[]>('/api/business-hours');
      if (data && data.length > 0) {
        const merged = DAYS.map(day => {
          const existing = data.find(d => d.dayOfWeek === day.value);
          return existing || { dayOfWeek: day.value, isOpen: day.value >= 1 && day.value <= 5, startTime: '09:00', endTime: '18:00' };
        });
        setSchedule(merged);
      } else {
        setSchedule(DAYS.map(day => ({ dayOfWeek: day.value, isOpen: day.value >= 1 && day.value <= 5, startTime: '09:00', endTime: '18:00' })));
      }
    } catch {
      setSchedule(DAYS.map(day => ({ dayOfWeek: day.value, isOpen: day.value >= 1 && day.value <= 5, startTime: '09:00', endTime: '18:00' })));
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (dayOfWeek: number) =>
    setSchedule(prev => prev.map(day => day.dayOfWeek === dayOfWeek ? { ...day, isOpen: !day.isOpen } : day));

  const updateTime = (dayOfWeek: number, field: 'startTime' | 'endTime', time: string) =>
    setSchedule(prev => prev.map(day => day.dayOfWeek === dayOfWeek ? { ...day, [field]: time } : day));

  const handleSave = async () => {
    // ⚡ FIX BUG (jul 2026): validar que el cierre sea posterior a la apertura en los
    // días abiertos. Antes se podía guardar 18:00→09:00 y el día quedaba sin horarios
    // en el link público sin aviso. (El server también lo rechaza; esto da mejor UX.)
    const invalidDay = schedule.find(d => d.isOpen && d.endTime <= d.startTime);
    if (invalidDay) {
      setErrorModal({ visible: true, message: 'Revisa tus horarios: la hora de cierre debe ser posterior a la de apertura.' });
      return;
    }
    setSaving(true);
    try {
      await Promise.all(schedule.map(day =>
        apiPut(`/api/business-hours/${day.dayOfWeek}`, { startTime: day.startTime, endTime: day.endTime, isOpen: day.isOpen })
      ));
      setSuccessModal(true);
    } catch (error: any) {
      setErrorModal({ visible: true, message: error?.message || 'Error al guardar el horario' });
    } finally {
      setSaving(false);
    }
  };

  const getDaySchedule = (dayOfWeek: number): DaySchedule =>
    schedule.find(s => s.dayOfWeek === dayOfWeek) || { dayOfWeek, isOpen: false, startTime: '09:00', endTime: '18:00' };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ConfirmModal visible={errorModal.visible} title="Error" message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'cancel' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })} />
      <ConfirmModal visible={successModal} title="¡Guardado!" message="El horario de atención se actualizó correctamente."
        buttons={[{ text: 'Aceptar', onPress: () => { setSuccessModal(false); router.back(); }, style: 'default' }]}
        onDismiss={() => { setSuccessModal(false); router.back(); }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Horarios de Atención</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: safeBottom }]}>
        <Text style={styles.description}>
          Configura los días y horarios en los que tu negocio está abierto. Esto se usará para validar las citas.
        </Text>
        {DAYS.map(day => {
          const ds = getDaySchedule(day.value);
          return (
            <View key={day.value} style={styles.dayCard}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayName}>{day.name}</Text>
                <Switch value={ds.isOpen} onValueChange={() => toggleDay(day.value)}
                  trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" />
              </View>
              {ds.isOpen && (
                <View style={styles.timeRow}>
                  <TouchableOpacity style={styles.timeButton} onPress={() => setShowTimePicker({ visible: true, dayOfWeek: day.value, field: 'startTime' })}>
                    <IconSymbol android_material_icon_name="schedule" size={20} color={colors.textSecondary} />
                    <Text style={styles.timeText}>{formatTime(ds.startTime)}</Text>
                  </TouchableOpacity>
                  <Text style={styles.timeSeparator}>-</Text>
                  <TouchableOpacity style={styles.timeButton} onPress={() => setShowTimePicker({ visible: true, dayOfWeek: day.value, field: 'endTime' })}>
                    <IconSymbol android_material_icon_name="schedule" size={20} color={colors.textSecondary} />
                    <Text style={styles.timeText}>{formatTime(ds.endTime)}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
        <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Guardar horarios</Text>}
        </TouchableOpacity>
      </ScrollView>

      {showTimePicker && (
        <TimePickerModal
          visible={showTimePicker.visible}
          title={showTimePicker.field === 'startTime' ? 'Hora de apertura' : 'Hora de cierre'}
          value={getDaySchedule(showTimePicker.dayOfWeek)[showTimePicker.field]}
          onConfirm={time => { updateTime(showTimePicker.dayOfWeek, showTimePicker.field, time); setShowTimePicker(null); }}
          onCancel={() => setShowTimePicker(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: colors.background },
  loadingContainer:   { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingVertical: 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton:         { padding: 4 },
  title:              { fontSize: 20, fontWeight: 'bold', color: colors.text },
  placeholder:        { width: 32 },
  // ⚡ paddingBottom removido: se aplica dinámico desde contentContainerStyle
  scrollContent:      { padding: 20 },
  description:        { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 24 },
  dayCard:            { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  dayHeader:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayName:            { fontSize: 16, fontWeight: '600', color: colors.text },
  timeRow:            { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12 },
  timeButton:         { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: 8, padding: 12, gap: 8 },
  timeText:           { fontSize: 15, color: colors.text, fontWeight: '500' },
  timeSeparator:      { fontSize: 16, color: colors.textSecondary },
  saveButton:         { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText:     { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
});
