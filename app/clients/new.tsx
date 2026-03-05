
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { invalidateCache } from '@/utils/cache';
import { apiPost } from '@/utils/api';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function NewClientScreen() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({ visible: false, message: '' });

const extraStyles = {
  datePickerModal: { position: 'absolute' as const, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' as const, zIndex: 999 },
  datePickerContainer: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  datePickerTitle: { fontSize: 17, fontWeight: '600' as const, color: '#0F172A', textAlign: 'center' as const, marginBottom: 8 },
  datePickerConfirm: { backgroundColor: '#10B981', borderRadius: 12, padding: 14, alignItems: 'center' as const, marginTop: 8 },
  datePickerConfirmText: { color: '#fff', fontSize: 16, fontWeight: '600' as const },
};

  // Form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+52 ');
  const [email, setEmail] = useState('');
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [notes, setNotes] = useState('');

  const handleSave = async () => {
    Keyboard.dismiss();
    
    if (!fullName.trim()) {
      setErrorModal({ visible: true, message: 'El nombre completo es requerido' });
      return;
    }

    if (!phone.trim() || phone.trim() === '+52') {
      setErrorModal({ visible: true, message: 'El teléfono es requerido' });
      return;
    }

    // Validate email format if provided
    if (email.trim() && !email.includes('@')) {
      setErrorModal({ visible: true, message: 'El correo electrónico no es válido' });
      return;
    }

    setSaving(true);
    try {
      console.log('[NewClient] Creating client');
      const body = {
        name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        birthday: birthday ? birthday.toISOString().split('T')[0] : undefined,
        notes: notes.trim() || undefined,
      };

      await apiPost('/api/clients', body);
      invalidateCache('clients_list');
      console.log('[NewClient] Client created successfully');
      router.back();
    } catch (error: any) {
      console.error('[NewClient] Failed to create client:', error);
      setErrorModal({ visible: true, message: error?.message || 'Error al crear el cliente' });
    } finally {
      setSaving(false);
    }
  };

  const formatBirthday = (date: Date | null) => {
    if (!date) {
      return '';
    }
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const birthdayDisplay = formatBirthday(birthday);

  return (
    <SafeAreaView style={styles.container}>
      <ConfirmModal
        visible={errorModal.visible}
        title="Error"
        message={errorModal.message}
        buttons={[
          {
            text: 'Aceptar',
            onPress: () => setErrorModal({ visible: false, message: '' }),
            style: 'cancel',
          },
        ]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })}
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Nuevo Cliente</Text>
        <View style={styles.placeholder} />
      </View>

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
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={[styles.dateText, !birthday && styles.datePlaceholder]}>
            {birthday ? birthdayDisplay : 'Seleccionar fecha'}
          </Text>
          <IconSymbol
            android_material_icon_name="calendar-today"
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>

        {showDatePicker && (
          <View style={extraStyles.datePickerModal}>
            <View style={extraStyles.datePickerContainer}>
              <Text style={extraStyles.datePickerTitle}>Fecha de nacimiento</Text>
              <DateTimePicker
                value={birthday || new Date()}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={(event, selectedDate) => {
                  if (selectedDate) setBirthday(selectedDate);
                }}
              />
              <TouchableOpacity
                style={extraStyles.datePickerConfirm}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={extraStyles.datePickerConfirmText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

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
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Guardar Cliente</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
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
    padding: 20,
    paddingTop: 48,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  placeholder: {
    width: 32,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  dateButton: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 16,
    color: colors.text,
  },
  datePlaceholder: {
    color: colors.textSecondary,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
