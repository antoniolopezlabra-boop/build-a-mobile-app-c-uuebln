
import { toLocalDateString, parseLocalDate } from '@/utils/dateUtils';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
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

const extraStyles = {
  datePickerOverlay: {
    position: 'absolute' as const,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 999,
  },
  datePickerSheet: {
    position: 'absolute' as const,
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    zIndex: 1000,
  },
  datePickerHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E2E8F0',
  },
  datePickerTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#0F172A',
  },
  datePickerCancel: {
    fontSize: 15,
    color: '#94A3B8',
    fontWeight: '500' as const,
  },
  datePickerDoneText: {
    fontSize: 15,
    color: '#10B981',
    fontWeight: '700' as const,
  },
  datePickerPreview: {
    alignItems: 'center' as const,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginTop: 14,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#BBF7D0',
  },
  datePickerPreviewText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#10B981',
    textTransform: 'capitalize' as const,
  },
  datePickerConfirm: {
    backgroundColor: '#10B981',
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center' as const,
  },
  datePickerConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  // CRITICAL FIX: el contenedor del picker tiene fondo blanco explícito.
  // El picker hereda colores del contenedor padre, por eso si está dentro
  // de un View con tema oscuro o transparente, los números no se ven.
  pickerWrap: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    marginTop: 4,
  },
};

export default function EditClientScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showDatePickerIOS, setShowDatePickerIOS] = useState(false);
  const [showDatePickerAndroid, setShowDatePickerAndroid] = useState(false);
  const [tempBirthday, setTempBirthday] = useState<Date>(new Date());

  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });

  const [successModal, setSuccessModal] = useState(false);

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
    setLoading(true);
    try {
      const allClients = await apiGet<Client[]>('/api/clients');
      const data = Array.isArray(allClients) ? allClients.find((c) => c.id === id) : null;
      if (!data) {
        throw new Error('Cliente no encontrado');
      }
      setFullName(data.name);
      setPhone(data.phone);
      setEmail(data.email || '');
      setNotes(data.notes || '');
      setIsActive(data.isActive !== false);
      if (data.birthday) {
        setBirthday(parseLocalDate(data.birthday));
      }
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
      await apiPut(`/api/clients/${id}`, {
        name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        birthday: birthday ? toLocalDateString(birthday) : undefined,
        notes: notes.trim() || undefined,
        isActive,
      });
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

  const formattedTempDate = tempBirthday.toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const openDatePicker = () => {
    const initialDate = birthday || new Date(1990, 0, 1);
    setTempBirthday(initialDate);
    if (Platform.OS === 'ios') {
      setShowDatePickerIOS(true);
    } else {
      setTimeout(() => setShowDatePickerAndroid(true), 100);
    }
  };

  const confirmDateIOS = () => {
    setBirthday(tempBirthday);
    setShowDatePickerIOS(false);
  };

  const cancelDateIOS = () => {
    setShowDatePickerIOS(false);
  };

  const onAndroidDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePickerAndroid(false);
    if (event.type === 'set' && selectedDate) {
      setBirthday(selectedDate);
    }
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
        <TouchableOpacity style={styles.dateButton} onPress={openDatePicker}>
          <Text style={[styles.dateText, !birthday && styles.datePlaceholder]}>
            {birthday ? formatBirthday(birthday) : 'Seleccionar fecha'}
          </Text>
          <IconSymbol
            android_material_icon_name="calendar-today"
            size={20}
            color={colors.textSecondary}
          />
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

      {/* ─── iOS Date Picker ───
           CRITICAL FIXES aplicados:
           1. themeVariant="light" — fuerza tema claro independiente del sistema
           2. accentColor="#10B981" — color del año/mes resaltado
           3. textColor="#0F172A" — color de los números (azul oscuro casi negro)
           4. Wrap con bg blanco explícito
           5. Si esto sigue fallando, fallback a display="compact" o calendario nativo */}
      {Platform.OS === 'ios' && showDatePickerIOS && (
        <>
          <TouchableOpacity
            style={extraStyles.datePickerOverlay}
            activeOpacity={1}
            onPress={cancelDateIOS}
          />
          <View style={extraStyles.datePickerSheet}>
            <View style={extraStyles.datePickerHeader}>
              <TouchableOpacity onPress={cancelDateIOS}>
                <Text style={extraStyles.datePickerCancel}>Cancelar</Text>
              </TouchableOpacity>
              <Text style={extraStyles.datePickerTitle}>Fecha de nacimiento</Text>
              <TouchableOpacity onPress={confirmDateIOS}>
                <Text style={extraStyles.datePickerDoneText}>Listo</Text>
              </TouchableOpacity>
            </View>
            <View style={extraStyles.datePickerPreview}>
              <Text style={extraStyles.datePickerPreviewText}>
                {formattedTempDate.charAt(0).toUpperCase() + formattedTempDate.slice(1)}
              </Text>
            </View>
            <View style={extraStyles.pickerWrap}>
              <DateTimePicker
                value={tempBirthday}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                locale="es-MX"
                themeVariant="light"
                accentColor="#10B981"
                textColor="#0F172A"
                onChange={(_event, selected) => {
                  if (selected) setTempBirthday(selected);
                }}
                style={{ backgroundColor: '#FFFFFF', height: 200 }}
              />
            </View>
            <TouchableOpacity style={extraStyles.datePickerConfirm} onPress={confirmDateIOS}>
              <Text style={extraStyles.datePickerConfirmText}>Confirmar fecha</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {Platform.OS === 'android' && showDatePickerAndroid && (
        <DateTimePicker
          value={tempBirthday}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={onAndroidDateChange}
        />
      )}
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
