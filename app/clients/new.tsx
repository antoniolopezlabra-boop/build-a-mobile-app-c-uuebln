
import React, { useState, useRef } from 'react';
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
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { invalidateCache } from '@/utils/cache';
import { apiPost } from '@/utils/api';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function NewClientScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets(); // FIX #1 y #7: safe area para header y date picker
  const saveLockRef = useRef(false);  // FIX #9: guard doble-submit

  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({ visible: false, message: '' });

  // Form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+52 ');
  const [email, setEmail] = useState('');
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [notes, setNotes] = useState('');

  const handleSave = async () => {
    // FIX #9: guard doble-submit con ref
    if (saveLockRef.current) return;

    Keyboard.dismiss();

    if (!fullName.trim()) {
      setErrorModal({ visible: true, message: 'El nombre completo es requerido' });
      return;
    }
    if (!phone.trim() || phone.trim() === '+52') {
      setErrorModal({ visible: true, message: 'El teléfono es requerido' });
      return;
    }
    if (email.trim() && !email.includes('@')) {
      setErrorModal({ visible: true, message: 'El correo electrónico no es válido' });
      return;
    }

    saveLockRef.current = true;
    setSaving(true);
    try {
      const body = {
        name:     fullName.trim(),
        phone:    phone.trim(),
        email:    email.trim() || undefined,
        birthday: birthday ? birthday.toISOString().split('T')[0] : undefined,
        notes:    notes.trim() || undefined,
      };
      await apiPost('/api/clients', body);
      invalidateCache('clients_list');
      router.back();
    } catch (error: any) {
      saveLockRef.current = false; // desbloquear solo en error
      setErrorModal({ visible: true, message: error?.message || 'Error al crear el cliente' });
    } finally {
      setSaving(false);
    }
  };

  const formatBirthday = (date: Date | null) => {
    if (!date) return '';
    return `${date.getDate().toString().padStart(2,'0')}/${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getFullYear()}`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ConfirmModal
        visible={errorModal.visible}
        title="Error"
        message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'cancel' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })}
      />

      {/* FIX #1: header sin paddingTop hardcodeado — SafeAreaView edges={['top']} ya lo maneja */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Nuevo Cliente</Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.fieldLabel}>Nombre completo *</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Ej: María González"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="words"
            returnKeyType="next"
          />

          <Text style={styles.fieldLabel}>Teléfono *</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+52 55 1234 5678"
            placeholderTextColor={colors.textSecondary}
            keyboardType="phone-pad"
            returnKeyType="next"
          />

          <Text style={styles.fieldLabel}>Correo electrónico (opcional)</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="cliente@email.com"
            placeholderTextColor={colors.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            returnKeyType="next"
          />

          <Text style={styles.fieldLabel}>Fecha de nacimiento (opcional)</Text>
          <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
            <Text style={[styles.dateText, !birthday && styles.datePlaceholder]}>
              {birthday ? formatBirthday(birthday) : 'Seleccionar fecha'}
            </Text>
            <IconSymbol android_material_icon_name="calendar-today" size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          <Text style={styles.fieldLabel}>Notas internas (opcional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Ej: Prefiere citas por la tarde, alérgico a..."
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={styles.saveButtonText}>Guardar Cliente</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* FIX #7: date picker con paddingBottom del safe area para home indicator */}
      {showDatePicker && (
        <View style={styles.datePickerModal}>
          <View style={[styles.datePickerContainer, { paddingBottom: insets.bottom + 12 }]}>
            <Text style={styles.datePickerTitle}>Fecha de nacimiento</Text>
            <DateTimePicker
              value={birthday || new Date()}
              mode="date"
              display="spinner"
              maximumDate={new Date()}
              locale="es-MX"
              onChange={(_event, selectedDate) => { if (selectedDate) setBirthday(selectedDate); }}
              style={{ width: '100%' }}
              textColor="#0F172A"
            />
            <TouchableOpacity style={styles.datePickerConfirm} onPress={() => setShowDatePicker(false)}>
              <Text style={styles.datePickerConfirmText}>Confirmar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:              { flex: 1, backgroundColor: colors.background },
  // FIX #1: header sin paddingTop hardcodeado
  header:                 { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton:             { padding: 4 },
  title:                  { fontSize: 20, fontWeight: 'bold', color: colors.text },
  placeholder:            { width: 32 },
  scrollContent:          { padding: 20, paddingBottom: 40 },
  fieldLabel:             { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8, marginTop: 16 },
  input:                  { backgroundColor: colors.card, borderRadius: 12, padding: 14, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border },
  textArea:               { height: 100, textAlignVertical: 'top' },
  dateButton:             { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateText:               { fontSize: 16, color: colors.text },
  datePlaceholder:        { color: colors.textSecondary },
  saveButton:             { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 32 },
  saveButtonDisabled:     { opacity: 0.6 },
  saveButtonText:         { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
  // FIX #7: date picker con overlay
  datePickerModal:        { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  datePickerContainer:    { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  datePickerTitle:        { fontSize: 17, fontWeight: '600', color: '#0F172A', textAlign: 'center', marginBottom: 8 },
  datePickerConfirm:      { backgroundColor: '#10B981', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 },
  datePickerConfirmText:  { color: '#fff', fontSize: 16, fontWeight: '600' },
});
