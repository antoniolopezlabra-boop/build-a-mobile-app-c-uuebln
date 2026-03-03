
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { useAuth } from '@/contexts/AuthContext';
import { apiPut, getBearerToken, BACKEND_URL } from '@/utils/api';
import * as ImagePicker from 'expo-image-picker';

const BUSINESS_TYPES = [
  'Spa',
  'Salón de belleza',
  'Uñas',
  'Barbería',
  'Consultorio médico',
  'Odontología',
  'Veterinaria',
  'Fotografía',
  'Tutorías',
  'Otro',
];

export default function BusinessSettingsScreen() {
  const router = useRouter();
  const { businessProfile, refreshBusinessProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });
  const [successModal, setSuccessModal] = useState(false);

  // Form state
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [alternativePhone, setAlternativePhone] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  useEffect(() => {
    if (businessProfile) {
      setBusinessName(businessProfile.businessName || '');
      setBusinessType(businessProfile.businessType || '');
      setAddress((businessProfile as any).address || '');
      setPhone((businessProfile as any).phone || '');
      setAlternativePhone((businessProfile as any).alternativePhone || '');
      setLogoUrl((businessProfile as any).logoUrl || '');
    }
  }, [businessProfile]);

  const handlePickLogo = async () => {
    console.log('[BusinessSettings] Picking logo');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await uploadLogo(asset.uri);
    }
  };

  const uploadLogo = async (uri: string) => {
    setUploadingLogo(true);
    try {
      console.log('[BusinessSettings] Uploading logo');
      const formData = new FormData();
      formData.append('logo', {
        uri,
        type: 'image/jpeg',
        name: 'logo.jpg',
      } as any);

      const token = await getBearerToken();
      const response = await fetch(`${BACKEND_URL}/api/business-profile/upload-logo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error || `Error ${response.status}`);
      }

      const data = await response.json();
      setLogoUrl(data.logoUrl);
      console.log('[BusinessSettings] Logo uploaded:', data.logoUrl);
    } catch (error: any) {
      console.error('[BusinessSettings] Failed to upload logo:', error);
      setErrorModal({ visible: true, message: 'Error al subir el logo' });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!businessName.trim() || !businessType) {
      setErrorModal({
        visible: true,
        message: 'El nombre y tipo de negocio son requeridos',
      });
      return;
    }

    setSaving(true);
    try {
      console.log('[BusinessSettings] Saving business profile');
      await apiPut('/api/business-profile', {
        businessName: businessName.trim(),
        businessType,
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        alternativePhone: alternativePhone.trim() || undefined,
        logoUrl: logoUrl || undefined,
      });

      await refreshBusinessProfile();
      setSuccessModal(true);
      console.log('[BusinessSettings] Business profile saved');
    } catch (error: any) {
      console.error('[BusinessSettings] Failed to save:', error);
      setErrorModal({ visible: true, message: error?.message || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

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
        message="La información del negocio se actualizó correctamente."
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
        <Text style={styles.title}>Mi Negocio</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Logo */}
        <View style={styles.logoSection}>
          <Text style={styles.fieldLabel}>Logo del negocio</Text>
          <TouchableOpacity style={styles.logoContainer} onPress={handlePickLogo}>
            {logoUrl ? (
              <Image source={{ uri: logoUrl }} style={styles.logoImage} />
            ) : (
              <View style={styles.logoPlaceholder}>
                <IconSymbol android_material_icon_name="store" size={40} color={colors.textSecondary} />
              </View>
            )}
            {uploadingLogo && (
              <View style={styles.logoOverlay}>
                <ActivityIndicator color="#FFFFFF" />
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.changeLogoButton} onPress={handlePickLogo}>
            <Text style={styles.changeLogoText}>Cambiar logo</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.fieldLabel}>Nombre del negocio *</Text>
        <TextInput
          style={styles.input}
          value={businessName}
          onChangeText={setBusinessName}
          placeholder="Nombre de tu negocio"
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={styles.fieldLabel}>Tipo de negocio *</Text>
        <TouchableOpacity style={styles.pickerButton} onPress={() => setShowTypePicker(true)}>
          <Text style={[styles.pickerText, !businessType && styles.pickerPlaceholder]}>
            {businessType || 'Seleccionar tipo'}
          </Text>
          <IconSymbol
            android_material_icon_name="arrow-drop-down"
            size={24}
            color={colors.textSecondary}
          />
        </TouchableOpacity>

        <Text style={styles.fieldLabel}>Dirección (opcional)</Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder="Calle, número, colonia, ciudad"
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={styles.fieldLabel}>Teléfono (opcional)</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="+52 55 1234 5678"
          placeholderTextColor={colors.textSecondary}
          keyboardType="phone-pad"
        />

        <Text style={styles.fieldLabel}>Teléfono alternativo (opcional)</Text>
        <TextInput
          style={styles.input}
          value={alternativePhone}
          onChangeText={setAlternativePhone}
          placeholder="+52 55 8765 4321"
          placeholderTextColor={colors.textSecondary}
          keyboardType="phone-pad"
        />

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

      {/* Business Type Picker */}
      <Modal
        visible={showTypePicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowTypePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Tipo de negocio</Text>
              <TouchableOpacity onPress={() => setShowTypePicker(false)}>
                <IconSymbol android_material_icon_name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {BUSINESS_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={styles.typeOption}
                  onPress={() => {
                    setBusinessType(type);
                    setShowTypePicker(false);
                  }}
                >
                  <Text style={styles.typeText}>{type}</Text>
                  {businessType === type && (
                    <IconSymbol android_material_icon_name="check" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  logoSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    marginBottom: 12,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  logoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  changeLogoButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  changeLogoText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
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
  pickerButton: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerText: {
    fontSize: 16,
    color: colors.text,
  },
  pickerPlaceholder: {
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: 32,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  typeOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  typeText: {
    fontSize: 16,
    color: colors.text,
  },
});
