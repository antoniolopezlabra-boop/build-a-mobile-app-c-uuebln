
import React, { useState } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
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
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';

export default function PasswordSettingsScreen() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });
  const [successModal, setSuccessModal] = useState(false);

  const handleSave = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorModal({ visible: true, message: 'Por favor completa todos los campos' });
      return;
    }

    if (newPassword.length < 8) {
      setErrorModal({
        visible: true,
        message: 'La nueva contraseña debe tener al menos 8 caracteres',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorModal({ visible: true, message: 'Las contraseñas no coinciden' });
      return;
    }

    setSaving(true);
    try {
      console.log('[Password] Changing password');
      const { supabase } = await import('@/lib/supabase');
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccessModal(true);
      setTimeout(() => router.back(), 1500);
      console.log('[Password] Password changed');
    } catch (error: any) {
      console.error('[Password] Failed to change:', error);
      setErrorModal({
        visible: true,
        message: error?.message?.includes('different from the old')
          ? 'La nueva contraseña debe ser diferente a la actual.'
          : error?.message?.includes('at least')
          ? 'La contraseña debe tener al menos 6 caracteres.'
          : 'Error al cambiar la contraseña. Intenta de nuevo.',
      });
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
        title="¡Contraseña actualizada!"
        message="Tu contraseña se cambió correctamente."
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
        <Text style={styles.title}>Cambiar Contraseña</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.description}>
          Por seguridad, necesitas ingresar tu contraseña actual para cambiarla.
        </Text>

        <Text style={styles.fieldLabel}>Contraseña actual</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="Ingresa tu contraseña actual"
            placeholderTextColor={colors.textSecondary}
            secureTextEntry={!showCurrentPassword}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowCurrentPassword(!showCurrentPassword)}
          >
            <IconSymbol
              ios_icon_name={showCurrentPassword ? 'eye.slash' : 'eye'}
              android_material_icon_name={showCurrentPassword ? 'visibility-off' : 'visibility'}
              size={24}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        <Text style={styles.fieldLabel}>Nueva contraseña</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="Mínimo 8 caracteres"
            placeholderTextColor={colors.textSecondary}
            secureTextEntry={!showNewPassword}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowNewPassword(!showNewPassword)}
          >
            <IconSymbol
              ios_icon_name={showNewPassword ? 'eye.slash' : 'eye'}
              android_material_icon_name={showNewPassword ? 'visibility-off' : 'visibility'}
              size={24}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        <Text style={styles.fieldLabel}>Confirmar nueva contraseña</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Repite la nueva contraseña"
            placeholderTextColor={colors.textSecondary}
            secureTextEntry={!showConfirmPassword}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
          >
            <IconSymbol
              ios_icon_name={showConfirmPassword ? 'eye.slash' : 'eye'}
              android_material_icon_name={showConfirmPassword ? 'visibility-off' : 'visibility'}
              size={24}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Cambiar contraseña</Text>
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
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    marginTop: 16,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passwordInput: {
    flex: 1,
    padding: 14,
    fontSize: 16,
    color: colors.text,
  },
  eyeButton: {
    padding: 14,
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
