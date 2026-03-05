
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { apiGet, apiPut } from '@/utils/api';
import DateTimePicker from '@react-native-community/datetimepicker';

interface Client {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  birthday?: string | null;
  isActive?: boolean;
}

export default function EditClientScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });

const extraStyles = {
  datePickerModal: { position: 'absolute' as const, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' as const, zIndex: 999 },
  datePickerContainer: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  datePickerTitle: { fontSize: 17, fontWeight: '600' as const, color: '#0F172A', textAlign: 'center' as const, marginBottom: 8 },
  datePickerConfirm: { backgroundColor: '#10B981', borderRadius: 12, padding: 14, alignItems: 'center' as const, marginTop: 8 },
  datePickerConfirmText: { color: '#fff', fontSize: 16, fontWeight: '600' as const },
};
  const [successModal, setSuccessModal] = useState(false);

  // Form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (id) {
      loadClient();
    }
  }, [id]);

  const loadClient = async () => {
    console.log('[EditClient] Loading client:', id);
    setLoading(true);
    try {
      // Fetch all clients and find the one with matching id
      const allClients = await apiGet<Client[]>('/api/clients');
      const data = allClients.find((c) => c.id === id);
      if (!data) {
        throw new Error('Cliente no encontrado');
      }
      setFullName(data.name);
      setPhone(data.phone);
      setEmail(data.email || '');
      setNotes(data.notes || '');
      setIsActive(data.isActive !== false);
      if (data.birthday) {
        setBirthday(new Date(data.birthday));
      }
      console.log('[EditClient] Client loaded');
    } catch (error) {
      console.error('[EditClient] Failed to load:', error);
      setErrorModal({ visible: true, message: 'Error al cargar el cliente' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      setErrorModal({ visible: true, message: 'El nombre completo es requerido' });
      return;
    }

    if (!phone.trim()) {
      setErrorModal({ visible: true, message: 'El teléfono es requerido' });
      return;
    }

    setSaving(true);
    try {
      console.log('[EditClient] Updating client');
      await apiPut(`/api/clients/${id}`, {
        name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        birthday: birthday ? birthday.toISOString().split('T')[0] : undefined,
        notes: notes.trim() || undefined,
        isActive,
      });
      console.log('[EditClient] Client updated');
      setSuccessModal(true);
    } catch (error: any) {
      console.error('[EditClient] Failed to update:', error);
      setErrorModal({ visible: true, message: error?.message || 'Error al actualizar el cliente' });
    } finally {
      setSaving(false);
    }
  };

  const formatBirthday = (date: Date | null) => {
    if (!date) return '';
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

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

      <ConfirmModal
        visible={successModal}
        title="¡Guardado!"
        message="El cliente se actualizó correctamente."
        buttons={[
          {
            text: 'Aceptar',
            onPress: () => {
              setSuccessModal(false);
              router.back();
            },
            style: 'default',
          },
        ]}
        onDismiss={() => {
          setSuccessModal(false);
          router.back();
        }}
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Editar Cliente</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.fieldLabel}>Nombre completo *</Text>
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Ej: María González"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="words"
        />

        <Text style={styles.fieldLabel}>Teléfono *</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="+52 55 1234 5678"
          placeholderTextColor={colors.textSecondary}
          keyboardType="phone-pad"
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
        />

        <Text style={styles.fieldLabel}>Fecha de nacimiento (opcional)</Text>
        <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
          <Text style={[styles.dateText, !birthday && styles.datePlaceholder]}>
            {birthday ? formatBirthday(birthday) : 'Seleccionar fecha'}
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
        />

        <View style={styles.statusSection}>
          <Text style={styles.fieldLabel}>Estado del cliente</Text>
          <View style={styles.statusButtons}>
            <TouchableOpacity
              style={[styles.statusButton, isActive && styles.statusButtonActive]}
              onPress={() => setIsActive(true)}
            >
              <Text style={[styles.statusButtonText, isActive && styles.statusButtonTextActive]}>
                Activo
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.statusButton, !isActive && styles.statusButtonInactive]}
              onPress={() => setIsActive(false)}
            >
              <Text
                style={[styles.statusButtonText, !isActive && styles.statusButtonTextInactive]}
              >
                Inactivo
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Guardar cambios</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  statusSection: {
    marginTop: 24,
  },
  statusButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  statusButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  statusButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  statusButtonInactive: {
    borderColor: colors.textSecondary,
    backgroundColor: colors.textSecondary,
  },
  statusButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  statusButtonTextActive: {
    color: '#FFFFFF',
  },
  statusButtonTextInactive: {
    color: '#FFFFFF',
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
