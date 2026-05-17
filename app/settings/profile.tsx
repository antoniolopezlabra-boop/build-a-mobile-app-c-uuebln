import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { useAuth } from '@/contexts/AuthContext';
import { BACKEND_URL, getBearerToken } from '@/utils/api';

export default function ProfileSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, fetchUser } = useAuth();
  const saveLockRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [name, setName]     = useState('');
  const [email, setEmail]   = useState('');
  const [errorModal,   setErrorModal]   = useState({ visible: false, message: '' });
  const [successModal, setSuccessModal] = useState(false);

  // ⚡ Padding inferior dinámico para respetar zona de tolerancia (May 17 2026)
  const safeBottom = Math.max(insets.bottom, 16);

  useEffect(() => {
    if (user) { setName(user.name || ''); setEmail(user.email || ''); }
  }, [user]);

  const handleSave = async () => {
    if (saveLockRef.current) return;
    if (!name.trim()) { setErrorModal({ visible: true, message: 'El nombre es requerido' }); return; }

    saveLockRef.current = true;
    setSaving(true);
    try {
      const token = await getBearerToken();
      const response = await fetch(`${BACKEND_URL}/api/auth/update-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.message || errData?.error || `Error ${response.status}`);
      }
      await fetchUser();
      setSuccessModal(true);
    } catch (error: any) {
      saveLockRef.current = false;
      setErrorModal({ visible: true, message: error?.message || 'Error al actualizar el perfil' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ConfirmModal
        visible={errorModal.visible} title="Error" message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'cancel' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })}
      />
      <ConfirmModal
        visible={successModal} title="¡Guardado!" message="Tu perfil se actualizó correctamente."
        buttons={[{ text: 'Aceptar', onPress: () => { setSuccessModal(false); router.back(); }, style: 'default' }]}
        onDismiss={() => { setSuccessModal(false); router.back(); }}
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Editar Perfil</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: safeBottom }]}>
        <Text style={styles.fieldLabel}>Nombre completo</Text>
        <TextInput
          style={styles.input} value={name} onChangeText={setName}
          placeholder="Tu nombre" placeholderTextColor={colors.textSecondary}
          autoCapitalize="words"
        />
        <Text style={styles.fieldLabel}>Correo electrónico</Text>
        <TextInput
          style={[styles.input, styles.inputDisabled]} value={email}
          editable={false} placeholderTextColor={colors.textSecondary}
        />
        <Text style={styles.helperText}>El correo electrónico no se puede cambiar por seguridad</Text>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave} disabled={saving}
        >
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Guardar cambios</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: colors.background },
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingVertical: 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton:         { padding: 4 },
  title:              { fontSize: 20, fontWeight: 'bold', color: colors.text },
  placeholder:        { width: 32 },
  // ⚡ paddingBottom removido: se aplica dinámico desde contentContainerStyle
  scrollContent:      { padding: 20 },
  fieldLabel:         { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8, marginTop: 16 },
  input:              { backgroundColor: colors.card, borderRadius: 12, padding: 14, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border },
  inputDisabled:      { backgroundColor: colors.background, color: colors.textSecondary },
  helperText:         { fontSize: 12, color: colors.textSecondary, marginTop: 6 },
  saveButton:         { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 32 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText:     { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
});
