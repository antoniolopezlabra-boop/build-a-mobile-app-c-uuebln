
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { useAuth } from '@/contexts/AuthContext';
import { apiPut } from '@/utils/api';

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

export default function SettingsScreen() {
  const router = useRouter();
  const { user, businessProfile, signOut, refreshBusinessProfile } = useAuth();
  const [logoutModal, setLogoutModal] = useState(false);
  const [showBusinessForm, setShowBusinessForm] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });
  const [successModal, setSuccessModal] = useState(false);

  // Business form state
  const [formBusinessName, setFormBusinessName] = useState(businessProfile?.businessName || '');
  const [formBusinessType, setFormBusinessType] = useState(businessProfile?.businessType || '');

  const handleLogout = async () => {
    setLogoutModal(false);
    console.log('User confirmed logout');
    try {
      await signOut();
    } finally {
      router.replace('/auth/onboarding');
    }
  };

  const openBusinessForm = () => {
    setFormBusinessName(businessProfile?.businessName || '');
    setFormBusinessType(businessProfile?.businessType || '');
    setShowBusinessForm(true);
  };

  const handleSaveBusiness = async () => {
    if (!formBusinessName || !formBusinessType) {
      setErrorModal({ visible: true, message: 'Por favor completa todos los campos' });
      return;
    }

    setSaving(true);
    try {
      console.log('[Settings] Updating business profile');
      await apiPut('/api/business-profile', {
        businessName: formBusinessName,
        businessType: formBusinessType,
      });
      await refreshBusinessProfile();
      setShowBusinessForm(false);
      setSuccessModal(true);
      console.log('[Settings] Business profile updated');
    } catch (error: any) {
      console.error('[Settings] Failed to update business profile:', error);
      setErrorModal({ visible: true, message: error?.message || 'Error al actualizar el negocio' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ConfirmModal
        visible={logoutModal}
        title="Cerrar sesión"
        message="¿Estás seguro de que deseas cerrar sesión?"
        buttons={[
          {
            text: 'Cerrar sesión',
            onPress: handleLogout,
            style: 'destructive',
          },
          {
            text: 'Cancelar',
            onPress: () => setLogoutModal(false),
            style: 'cancel',
          },
        ]}
        onDismiss={() => setLogoutModal(false)}
      />

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
        title="¡Listo!"
        message="La información del negocio se actualizó correctamente."
        buttons={[
          {
            text: 'Aceptar',
            onPress: () => setSuccessModal(false),
            style: 'default',
          },
        ]}
        onDismiss={() => setSuccessModal(false)}
      />

      <View style={styles.header}>
        <Text style={styles.title}>Configuración</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* User info card */}
        {user ? (
          <View style={styles.userCard}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>
                {user.name?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{user.name}</Text>
              <Text style={styles.userEmail}>{user.email}</Text>
              {businessProfile ? (
                <Text style={styles.userBusiness}>{businessProfile.businessName}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Negocio</Text>
          
          <TouchableOpacity style={styles.settingItem} onPress={openBusinessForm}>
            <View style={styles.settingLeft}>
              <IconSymbol
                android_material_icon_name="store"
                size={24}
                color={colors.text}
              />
              <Text style={styles.settingText}>Información del negocio</Text>
            </View>
            <IconSymbol
              android_material_icon_name="arrow-forward"
              size={24}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <IconSymbol
                android_material_icon_name="schedule"
                size={24}
                color={colors.text}
              />
              <Text style={styles.settingText}>Horarios de atención</Text>
            </View>
            <IconSymbol
              android_material_icon_name="arrow-forward"
              size={24}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notificaciones</Text>
          
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <IconSymbol
                android_material_icon_name="message"
                size={24}
                color={colors.text}
              />
              <Text style={styles.settingText}>WhatsApp</Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>No configurado</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <IconSymbol
                android_material_icon_name="notifications"
                size={24}
                color={colors.text}
              />
              <Text style={styles.settingText}>Recordatorios</Text>
            </View>
            <IconSymbol
              android_material_icon_name="arrow-forward"
              size={24}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cuenta</Text>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => {
              console.log('User tapped logout');
              setLogoutModal(true);
            }}
          >
            <View style={styles.settingLeft}>
              <IconSymbol
                android_material_icon_name="logout"
                size={24}
                color={colors.error}
              />
              <Text style={[styles.settingText, styles.logoutText]}>
                Cerrar sesión
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>VYLTA v1.0.0</Text>
          <Text style={styles.footerSubtext}>Cada cliente regresa</Text>
        </View>
      </ScrollView>

      {/* Business Profile Edit Modal */}
      <Modal
        visible={showBusinessForm}
        animationType="slide"
        transparent
        onRequestClose={() => setShowBusinessForm(false)}
      >
        <View style={styles.formOverlay}>
          <View style={styles.formContainer}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Información del negocio</Text>
              <TouchableOpacity onPress={() => setShowBusinessForm(false)}>
                <IconSymbol android_material_icon_name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formScroll}>
              <Text style={styles.fieldLabel}>Nombre del negocio</Text>
              <TextInput
                style={styles.input}
                value={formBusinessName}
                onChangeText={setFormBusinessName}
                placeholder="Nombre de tu negocio"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.fieldLabel}>Tipo de negocio</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowTypePicker(true)}
              >
                <Text style={[styles.pickerText, !formBusinessType && styles.pickerPlaceholder]}>
                  {formBusinessType || 'Seleccionar tipo'}
                </Text>
                <IconSymbol android_material_icon_name="arrow-drop-down" size={24} color={colors.textSecondary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSaveBusiness}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Guardar cambios</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Business Type Picker */}
      <Modal
        visible={showTypePicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowTypePicker(false)}
      >
        <View style={styles.formOverlay}>
          <View style={styles.pickerContainer}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Tipo de negocio</Text>
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
                    setFormBusinessType(type);
                    setShowTypePicker(false);
                  }}
                >
                  <Text style={styles.typeText}>{type}</Text>
                  {formBusinessType === type && (
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
    padding: 20,
    paddingTop: 48,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  userCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  userAvatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  userEmail: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  userBusiness: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  settingItem: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    fontSize: 16,
    color: colors.text,
    marginLeft: 12,
  },
  logoutText: {
    color: colors.error,
  },
  statusBadge: {
    backgroundColor: colors.warning,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    marginTop: 32,
  },
  footerText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  footerSubtext: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  formOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  formContainer: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
  },
  pickerContainer: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: 32,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  formScroll: {
    padding: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerButton: {
    backgroundColor: colors.background,
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
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 32,
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
