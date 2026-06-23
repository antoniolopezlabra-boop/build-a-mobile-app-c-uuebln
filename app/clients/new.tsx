
import { toLocalDateString } from '@/utils/dateUtils';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { invalidateCache } from '@/utils/cache';
import { apiPost } from '@/utils/api';
import DateTimePicker from '@react-native-community/datetimepicker';

// ── Clave AsyncStorage para señalizar al formulario de Nueva Cita
//    cuál cliente acabamos de crear (auto-selección al regresar).
const NEW_APPT_NEW_CLIENT_KEY = 'vylta_new_appt_new_client';

export default function NewClientScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const saveLockRef = useRef(false);

  // ── returnTo: si viene 'appointments-new', al guardar exitoso
  //    guardamos el ID del nuevo cliente en AsyncStorage y router.back()
  //    para que la pantalla anterior (Nueva Cita) lo auto-seleccione.
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = params.returnTo || '';

  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({ visible: false, message: '' });

  // Form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+52 ');
  const [email, setEmail] = useState('');
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [notes, setNotes] = useState('');

  // ⚡ Padding inferior dinámico para respetar zona de tolerancia (May 17 2026)
  // - Android botones clásicos: insets.bottom = 0 → mínimo 16px
  // - Android barra gestual:    respeta el inset real
  // - iPhone X+:                respeta el home indicator
  const safeBottom = Math.max(insets.bottom, 16);

  const handleSave = async () => {
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
        birthday: birthday ? toLocalDateString(birthday) : undefined,
        notes:    notes.trim() || undefined,
      };
      const created = await apiPost<{ id: string; name: string; phone: string }>('/api/clients', body);
      invalidateCache('clients_list');

      // ── Si venimos de Nueva Cita, guardar el ID del cliente recién creado
      //    para que la pantalla anterior lo auto-seleccione al regresar.
      if (returnTo === 'appointments-new' && created?.id) {
        try {
          await AsyncStorage.setItem(NEW_APPT_NEW_CLIENT_KEY, JSON.stringify({
            id: created.id,
            name: created.name || fullName.trim(),
            phone: created.phone || phone.trim(),
          }));
        } catch (e) {
          console.warn('[clients/new] no se pudo guardar señal de regreso:', e);
        }
      }

      router.back();
    } catch (error: any) {
      saveLockRef.current = false;
      // Traducimos errores conocidos a mensajes claros en español, evitando
      // exponer detalles crudos de la BD (p. ej. "duplicate key ... clients_phone_key").
      const rawMsg = (error?.message || '').toLowerCase();
      const isDuplicatePhone =
        error?.code === '23505' ||
        rawMsg.includes('clients_phone_key') ||
        ((rawMsg.includes('duplicate') || rawMsg.includes('unique')) && rawMsg.includes('phone'));
      const friendlyMessage = isDuplicatePhone
        ? 'Ya existe un cliente con ese teléfono.'
        : 'No se pudo guardar el cliente. Intenta de nuevo.';
      setErrorModal({ visible: true, message: friendlyMessage });
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

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Nuevo Cliente</Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: safeBottom }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hint contextual: si vienen desde Nueva Cita, indicar que regresará automáticamente */}
          {returnTo === 'appointments-new' && (
            <View style={styles.contextHint}>
              <IconSymbol android_material_icon_name="info-outline" size={16} color="#0EA5E9" />
              <Text style={styles.contextHintText}>
                Al guardar, regresarás a la cita con este cliente ya seleccionado.
              </Text>
            </View>
          )}

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
              : <Text style={styles.saveButtonText}>
                  {returnTo === 'appointments-new' ? 'Guardar y volver a la cita' : 'Guardar Cliente'}
                </Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

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
  header:                 { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton:             { padding: 4 },
  title:                  { fontSize: 20, fontWeight: 'bold', color: colors.text },
  placeholder:            { width: 32 },
  // ⚡ paddingBottom removido del estilo: se aplica dinámico desde contentContainerStyle
  scrollContent:          { padding: 20 },
  // Hint cuando vienen desde Nueva Cita
  contextHint:            { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#E0F2FE', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#7DD3FC' },
  contextHintText:        { flex: 1, fontSize: 13, color: '#0369A1', lineHeight: 18, fontWeight: '500' },
  fieldLabel:             { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8, marginTop: 16 },
  input:                  { backgroundColor: colors.card, borderRadius: 12, padding: 14, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border },
  textArea:               { height: 100, textAlignVertical: 'top' },
  dateButton:             { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateText:               { fontSize: 16, color: colors.text },
  datePlaceholder:        { color: colors.textSecondary },
  saveButton:             { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 32 },
  saveButtonDisabled:     { opacity: 0.6 },
  saveButtonText:         { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
  datePickerModal:        { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  datePickerContainer:    { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  datePickerTitle:        { fontSize: 17, fontWeight: '600', color: '#0F172A', textAlign: 'center', marginBottom: 8 },
  datePickerConfirm:      { backgroundColor: '#10B981', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 },
  datePickerConfirmText:  { color: '#fff', fontSize: 16, fontWeight: '600' },
});
