import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { useAuth } from '@/contexts/AuthContext';
import { apiPut, getBearerToken, BACKEND_URL } from '@/utils/api';
import * as ImagePicker from 'expo-image-picker';
import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_OTHER,
  isCustomBusinessType,
  validateCustomBusinessType,
} from '@/constants/businessTypes';

// Lista de 31 tipos + 'Otro' definida en /constants/businessTypes.ts
// (single source of truth, compartida con app/setup/index.tsx)

export default function BusinessSettingsScreen() {
  const router = useRouter();
  const { businessProfile, refreshBusinessProfile } = useAuth();
  const [saving, setSaving]                 = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [uploadingLogo, setUploadingLogo]   = useState(false);
  const [errorModal, setErrorModal]         = useState({ visible: false, message: '' });
  const [successModal, setSuccessModal]     = useState(false);
  const [businessName, setBusinessName]     = useState('');
  // selectedType es el valor del dropdown (puede ser 'Otro' o uno de la lista)
  // customType es el texto libre cuando selectedType === 'Otro'
  // El valor que se guarda en BD es selectedType (si !== 'Otro') o customType (si === 'Otro')
  const [selectedType, setSelectedType]     = useState('');
  const [customType, setCustomType]         = useState('');
  const [address, setAddress]               = useState('');
  const [phone, setPhone]                   = useState('');
  const [alternativePhone, setAlternativePhone] = useState('');
  const [logoUrl, setLogoUrl]               = useState('');

  useEffect(() => {
    if (businessProfile) {
      setBusinessName(businessProfile.businessName || '');
      const currentType = businessProfile.businessType || '';
      // Si el valor guardado está en la lista oficial → lo seleccionamos directo
      // Si NO está (ej: 'Especialista Parasitólogo') → selectedType='Otro' + customType=ese valor
      if (currentType && isCustomBusinessType(currentType)) {
        setSelectedType(BUSINESS_TYPE_OTHER);
        setCustomType(currentType);
      } else {
        setSelectedType(currentType);
        setCustomType('');
      }
      setAddress((businessProfile as any).address || '');
      setPhone((businessProfile as any).phone || '');
      setAlternativePhone((businessProfile as any).alternativePhone || '');
      setLogoUrl((businessProfile as any).logoUrl || '');
    }
  }, [businessProfile]);

  const handlePickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1,1], quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) await uploadLogo(result.assets[0].uri);
  };

  const uploadLogo = async (uri: string) => {
    setUploadingLogo(true);
    try {
      const { getCurrentUserId } = await import('@/utils/api');
      const { supabase } = await import('@/lib/supabase');
      const userId = await getCurrentUserId();
      const response = await fetch(uri);
      const blob = await response.blob();
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload  = () => res((reader.result as string).split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(blob);
      });
      const bytes = atob(base64);
      const arr   = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const fileName = `${userId}/logo_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from('logos').upload(fileName, arr, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName);
      setLogoUrl(urlData.publicUrl);
    } catch {
      setErrorModal({ visible: true, message: 'Error al subir el logo' });
    } finally {
      setUploadingLogo(false);
    }
  };

  // Calcula el valor final que se guarda en BD
  const getEffectiveBusinessType = (): string => {
    if (selectedType === BUSINESS_TYPE_OTHER) {
      return customType.trim();
    }
    return selectedType;
  };

  const handleSave = async () => {
    if (!businessName.trim()) {
      setErrorModal({ visible: true, message: 'El nombre del negocio es requerido' });
      return;
    }
    if (!selectedType) {
      setErrorModal({ visible: true, message: 'El tipo de negocio es requerido' });
      return;
    }
    // Validar input personalizado de 'Otro'
    if (selectedType === BUSINESS_TYPE_OTHER) {
      const v = validateCustomBusinessType(customType);
      if (!v.valid) {
        setErrorModal({ visible: true, message: v.error || 'Escribe tu tipo de negocio' });
        return;
      }
    }
    setSaving(true);
    try {
      await apiPut('/api/business-profile', {
        businessName: businessName.trim(),
        businessType: getEffectiveBusinessType(),
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        alternativePhone: alternativePhone.trim() || undefined,
        logoUrl: logoUrl || undefined,
      });
      await refreshBusinessProfile();
      setSuccessModal(true);
    } catch (error: any) {
      setErrorModal({ visible: true, message: error?.message || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  // Texto que se muestra en el botón del picker
  const pickerDisplayText = () => {
    if (!selectedType) return 'Seleccionar tipo';
    if (selectedType === BUSINESS_TYPE_OTHER) {
      return customType.trim() ? `Otro: ${customType.trim()}` : 'Otro (especifica)';
    }
    return selectedType;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ConfirmModal visible={errorModal.visible} title="Error" message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'cancel' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })} />
      <ConfirmModal visible={successModal} title="¡Guardado!" message="La información del negocio se actualizó correctamente."
        buttons={[{ text: 'Aceptar', onPress: () => { setSuccessModal(false); router.back(); }, style: 'default' }]}
        onDismiss={() => { setSuccessModal(false); router.back(); }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Mi Negocio</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.logoSection}>
          <Text style={styles.fieldLabel}>Logo del negocio</Text>
          <TouchableOpacity style={styles.logoContainer} onPress={handlePickLogo}>
            {logoUrl
              ? <Image source={{ uri: logoUrl }} style={styles.logoImage} />
              : <View style={styles.logoPlaceholder}><IconSymbol android_material_icon_name="store" size={40} color={colors.textSecondary} /></View>
            }
            {uploadingLogo && (
              <View style={styles.logoOverlay}><ActivityIndicator color="#FFFFFF" /></View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.changeLogoButton} onPress={handlePickLogo}>
            <Text style={styles.changeLogoText}>Cambiar logo</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.fieldLabel}>Nombre del negocio *</Text>
        <TextInput style={styles.input} value={businessName} onChangeText={setBusinessName} placeholder="Nombre de tu negocio" placeholderTextColor={colors.textSecondary} />

        <Text style={styles.fieldLabel}>Tipo de negocio *</Text>
        <TouchableOpacity style={styles.pickerButton} onPress={() => setShowTypePicker(true)}>
          <Text style={[styles.pickerText, !selectedType && styles.pickerPlaceholder]} numberOfLines={1}>
            {pickerDisplayText()}
          </Text>
          <IconSymbol android_material_icon_name="arrow-drop-down" size={24} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Input de texto libre cuando se selecciona 'Otro' */}
        {selectedType === BUSINESS_TYPE_OTHER && (
          <View style={styles.customInputWrap}>
            <Text style={styles.customInputLabel}>Especifica tu tipo de negocio o especialidad *</Text>
            <TextInput
              style={styles.input}
              value={customType}
              onChangeText={setCustomType}
              placeholder="Ej. Especialista Parasitólogo, Acupunturista..."
              placeholderTextColor={colors.textSecondary}
              maxLength={50}
              autoCapitalize="words"
            />
            <Text style={styles.customInputHint}>{customType.length}/50 caracteres</Text>
          </View>
        )}

        <Text style={styles.fieldLabel}>Dirección (opcional)</Text>
        <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Calle, número, colonia, ciudad" placeholderTextColor={colors.textSecondary} />

        <Text style={styles.fieldLabel}>Teléfono (opcional)</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="+52 55 1234 5678" placeholderTextColor={colors.textSecondary} keyboardType="phone-pad" />

        <Text style={styles.fieldLabel}>Teléfono alternativo (opcional)</Text>
        <TextInput style={styles.input} value={alternativePhone} onChangeText={setAlternativePhone} placeholder="+52 55 8765 4321" placeholderTextColor={colors.textSecondary} keyboardType="phone-pad" />

        <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Guardar cambios</Text>}
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showTypePicker} animationType="slide" transparent onRequestClose={() => setShowTypePicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Tipo de negocio</Text>
              <TouchableOpacity onPress={() => setShowTypePicker(false)}>
                <IconSymbol android_material_icon_name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.pickerSubtitle}>
              Selecciona el que mejor describe tu negocio. Si no aparece, elige “Otro”.
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {BUSINESS_TYPES.map(type => {
                const isSelected = selectedType === type;
                const isOther = type === BUSINESS_TYPE_OTHER;
                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeOption,
                      isSelected && styles.typeOptionSelected,
                      isOther && styles.typeOptionOther,
                    ]}
                    onPress={() => {
                      setSelectedType(type);
                      setShowTypePicker(false);
                      // Si selecciona algo distinto de 'Otro', limpiamos el customType
                      if (type !== BUSINESS_TYPE_OTHER) setCustomType('');
                    }}
                  >
                    <Text style={[styles.typeText, isSelected && styles.typeTextSelected]}>{type}</Text>
                    {isSelected && <IconSymbol android_material_icon_name="check" size={20} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: colors.background },
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingVertical: 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton:         { padding: 4 },
  title:              { fontSize: 20, fontWeight: 'bold', color: colors.text },
  placeholder:        { width: 32 },
  scrollContent:      { padding: 20, paddingBottom: 40 },
  logoSection:        { alignItems: 'center', marginBottom: 24 },
  logoContainer:      { width: 120, height: 120, borderRadius: 60, overflow: 'hidden', marginBottom: 12 },
  logoImage:          { width: '100%', height: '100%' },
  logoPlaceholder:    { width: '100%', height: '100%', backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed' },
  logoOverlay:        { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  changeLogoButton:   { paddingVertical: 8, paddingHorizontal: 16 },
  changeLogoText:     { fontSize: 14, color: colors.primary, fontWeight: '600' },
  fieldLabel:         { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8, marginTop: 16 },
  input:              { backgroundColor: colors.card, borderRadius: 12, padding: 14, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border },
  pickerButton:       { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerText:         { flex: 1, fontSize: 16, color: colors.text },
  pickerPlaceholder:  { color: colors.textSecondary },

  // Input de texto libre cuando es 'Otro'
  customInputWrap:    { backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginTop: 8, borderWidth: 1, borderColor: '#FDE68A' },
  customInputLabel:   { fontSize: 12, fontWeight: '700', color: '#92400E', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  customInputHint:    { fontSize: 11, color: '#A16207', marginTop: 4, textAlign: 'right' },

  saveButton:         { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 32 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText:     { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
  modalOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerContainer:    { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', paddingBottom: 32 },
  pickerHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 8, borderBottomWidth: 0 },
  pickerTitle:        { fontSize: 20, fontWeight: 'bold', color: colors.text },
  pickerSubtitle:     { paddingHorizontal: 20, paddingBottom: 16, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  typeOption:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderTopWidth: 1, borderTopColor: colors.border },
  typeOptionSelected: { backgroundColor: '#ECFDF5' },
  typeOptionOther:    { borderTopWidth: 4, borderTopColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  typeText:           { fontSize: 16, color: colors.text, fontWeight: '500' },
  typeTextSelected:   { color: colors.primary, fontWeight: '700' },
});
