
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
  Modal,
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

// Constantes para el selector custom de fecha (sin DateTimePicker problemático)
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const CURRENT_YEAR = new Date().getFullYear();
// Rango de años para fecha de nacimiento: desde 1920 hasta el año actual
const YEARS = Array.from({ length: CURRENT_YEAR - 1919 }, (_, i) => CURRENT_YEAR - i);

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export default function EditClientScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Date picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAndroidNative, setShowAndroidNative] = useState(false);
  const [tempBirthday, setTempBirthday] = useState<Date>(new Date(1990, 0, 1));

  // Estados separados para los 3 selectores en iOS (custom)
  const [selectedDay, setSelectedDay] = useState(1);
  const [selectedMonth, setSelectedMonth] = useState(0);
  const [selectedYear, setSelectedYear] = useState(1990);

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
        const parsedDate = parseLocalDate(data.birthday);
        setBirthday(parsedDate);
        setSelectedDay(parsedDate.getDate());
        setSelectedMonth(parsedDate.getMonth());
        setSelectedYear(parsedDate.getFullYear());
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

  const openDatePicker = () => {
    if (birthday) {
      setSelectedDay(birthday.getDate());
      setSelectedMonth(birthday.getMonth());
      setSelectedYear(birthday.getFullYear());
    } else {
      setSelectedDay(1);
      setSelectedMonth(0);
      setSelectedYear(1990);
    }

    if (Platform.OS === 'android') {
      // Android: usar el calendario nativo (que sí funciona perfecto)
      setTempBirthday(birthday || new Date(1990, 0, 1));
      setTimeout(() => setShowAndroidNative(true), 100);
    } else {
      // iOS: usar nuestro selector custom (que SIEMPRE se ve bien)
      setShowDatePicker(true);
    }
  };

  const confirmCustomDate = () => {
    // Validar que el día sea válido para el mes/año (ej: 31 de febrero no existe)
    const maxDays = getDaysInMonth(selectedYear, selectedMonth);
    const validDay = Math.min(selectedDay, maxDays);
    const newDate = new Date(selectedYear, selectedMonth, validDay);
    setBirthday(newDate);
    setShowDatePicker(false);
  };

  const cancelCustomDate = () => {
    setShowDatePicker(false);
  };

  const onAndroidDateChange = (event: any, selectedDate?: Date) => {
    setShowAndroidNative(false);
    if (event.type === 'set' && selectedDate) {
      setBirthday(selectedDate);
    }
  };

  // Días disponibles según mes/año seleccionado
  const daysInSelectedMonth = getDaysInMonth(selectedYear, selectedMonth);
  const days = Array.from({ length: daysInSelectedMonth }, (_, i) => i + 1);

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

      {/* ─── iOS Custom Date Picker ───
           Tres ScrollViews verticales: Día / Mes / Año.
           SIN dependencia de DateTimePicker (que tiene bugs de visibilidad).
           Render 100% controlado: SIEMPRE se ven los números. */}
      <Modal
        visible={showDatePicker}
        animationType="slide"
        transparent
        onRequestClose={cancelCustomDate}
      >
        <TouchableOpacity
          style={dpStyles.overlay}
          activeOpacity={1}
          onPress={cancelCustomDate}
        >
          <TouchableOpacity activeOpacity={1} style={dpStyles.sheet}>
            <View style={dpStyles.header}>
              <TouchableOpacity onPress={cancelCustomDate}>
                <Text style={dpStyles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <Text style={dpStyles.title}>Fecha de nacimiento</Text>
              <TouchableOpacity onPress={confirmCustomDate}>
                <Text style={dpStyles.doneText}>Listo</Text>
              </TouchableOpacity>
            </View>

            {/* Preview de la fecha seleccionada */}
            <View style={dpStyles.preview}>
              <Text style={dpStyles.previewText}>
                {selectedDay} de {MESES[selectedMonth]} de {selectedYear}
              </Text>
            </View>

            {/* 3 columnas: Día / Mes / Año */}
            <View style={dpStyles.pickerRow}>
              {/* DÍA */}
              <View style={dpStyles.column}>
                <Text style={dpStyles.columnLabel}>Día</Text>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  style={dpStyles.scroll}
                  nestedScrollEnabled
                >
                  {days.map((d) => (
                    <TouchableOpacity
                      key={d}
                      onPress={() => setSelectedDay(d)}
                      style={[
                        dpStyles.item,
                        selectedDay === d && dpStyles.itemSelected,
                      ]}
                    >
                      <Text
                        style={[
                          dpStyles.itemText,
                          selectedDay === d && dpStyles.itemTextSelected,
                        ]}
                      >
                        {d}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* MES */}
              <View style={dpStyles.column}>
                <Text style={dpStyles.columnLabel}>Mes</Text>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  style={dpStyles.scroll}
                  nestedScrollEnabled
                >
                  {MESES.map((m, idx) => (
                    <TouchableOpacity
                      key={m}
                      onPress={() => setSelectedMonth(idx)}
                      style={[
                        dpStyles.item,
                        selectedMonth === idx && dpStyles.itemSelected,
                      ]}
                    >
                      <Text
                        style={[
                          dpStyles.itemText,
                          selectedMonth === idx && dpStyles.itemTextSelected,
                        ]}
                      >
                        {m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* AÑO */}
              <View style={dpStyles.column}>
                <Text style={dpStyles.columnLabel}>Año</Text>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  style={dpStyles.scroll}
                  nestedScrollEnabled
                >
                  {YEARS.map((y) => (
                    <TouchableOpacity
                      key={y}
                      onPress={() => setSelectedYear(y)}
                      style={[
                        dpStyles.item,
                        selectedYear === y && dpStyles.itemSelected,
                      ]}
                    >
                      <Text
                        style={[
                          dpStyles.itemText,
                          selectedYear === y && dpStyles.itemTextSelected,
                        ]}
                      >
                        {y}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            <TouchableOpacity style={dpStyles.confirmBtn} onPress={confirmCustomDate}>
              <Text style={dpStyles.confirmBtnText}>Confirmar fecha</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ─── Android Native Calendar Picker ───
           El calendario nativo de Android funciona perfecto sin manipulación. */}
      {Platform.OS === 'android' && showAndroidNative && (
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

// Estilos del Date Picker custom (3 columnas Día/Mes/Año)
const dpStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 30,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E2E8F0',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  cancelText: {
    fontSize: 15,
    color: '#94A3B8',
    fontWeight: '500',
  },
  doneText: {
    fontSize: 15,
    color: '#10B981',
    fontWeight: '700',
  },
  preview: {
    alignItems: 'center',
    paddingVertical: 12,
    marginHorizontal: 20,
    marginTop: 14,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#BBF7D0',
  },
  previewText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10B981',
  },
  pickerRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 16,
    height: 240,
    gap: 8,
  },
  column: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  columnLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
    paddingVertical: 8,
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scroll: {
    flex: 1,
  },
  item: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemSelected: {
    backgroundColor: '#10B981',
  },
  itemText: {
    fontSize: 16,
    color: '#0F172A',
    fontWeight: '500',
  },
  itemTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  confirmBtn: {
    backgroundColor: '#10B981',
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
