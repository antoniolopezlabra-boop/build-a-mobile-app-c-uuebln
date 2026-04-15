import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal, Share,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import StaffFormScreen from '@/components/StaffFormScreen';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';

interface StaffAccount {
  id: string;
  user_id: string;
  email: string | null; // Email viene del auth user, lo cargamos aparte
}

export default function EditStaffScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors: tc } = useTheme();

  const [staffName, setStaffName] = useState('');
  const [staffAccount, setStaffAccount] = useState<StaffAccount | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [loadingAccess, setLoadingAccess] = useState(true);

  // Modal crear acceso
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [creatingAccess, setCreatingAccess] = useState(false);

  // Modal confirmación de credenciales
  const [showCredentials, setShowCredentials] = useState(false);
  const [createdEmail, setCreatedEmail]       = useState('');
  const [createdPassword, setCreatedPassword] = useState('');

  useFocusEffect(useCallback(() => {
    loadStaffName();
    loadAccessStatus();
  }, [id]));

  const loadStaffName = async () => {
    try {
      const { data } = await supabase
        .from('staff_members')
        .select('name')
        .eq('id', id)
        .single();
      if (data) setStaffName(data.name);
    } catch {}
  };

  const loadAccessStatus = async () => {
    setLoadingAccess(true);
    try {
      const { data } = await supabase
        .from('staff_accounts')
        .select('id, user_id')
        .eq('staff_member_id', id)
        .single();

      if (!data) {
        setStaffAccount(null);
        setAccountEmail(null);
        setLoadingAccess(false);
        return;
      }

      setStaffAccount(data as StaffAccount);

      // Obtener email del usuario (no está en staff_accounts, está en auth.users)
      // Lo obtenemos a través de una consulta indirecta al perfil del negocio no aplica
      // En su lugar lo almacenamos en user_metadata del usuario creado → sin acceso directo desde cliente
      // Mostraremos solo que tiene acceso activo
      setAccountEmail('●●●●@●●●●.com'); // placeholder de privacidad
    } catch (e) {
      console.warn('[EditStaff] loadAccessStatus error:', e);
    } finally {
      setLoadingAccess(false);
    }
  };

  const handleCreateAccess = async () => {
    if (!email.trim()) { Alert.alert('Campo requerido', 'Ingresa un correo electrónico.'); return; }
    if (password.length < 8) { Alert.alert('Contraseña inválida', 'Mínimo 8 caracteres.'); return; }

    setCreatingAccess(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-staff-account', {
        body: {
          staffMemberId: id,
          email: email.trim().toLowerCase(),
          password,
          organizationUserId: user?.id,
        },
      });

      if (error || data?.error) {
        throw new Error(data?.error ?? error?.message ?? 'Error al crear acceso');
      }

      // Guardar para mostrar en modal de credenciales
      setCreatedEmail(email.trim().toLowerCase());
      setCreatedPassword(password);
      setShowCreateModal(false);
      setEmail(''); setPassword('');
      setShowCredentials(true);
      await loadAccessStatus();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo crear el acceso');
    } finally {
      setCreatingAccess(false);
    }
  };

  const handleRevokeAccess = () => {
    Alert.alert(
      'Revocar acceso',
      `¿Eliminar el acceso a la app de ${staffName}? El colaborador ya no podrá iniciar sesión.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Revocar acceso',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data, error } = await supabase.functions.invoke('delete-staff-account', {
                body: { staffMemberId: id, organizationUserId: user?.id },
              });
              if (error || data?.error) throw new Error(data?.error ?? error?.message);
              Alert.alert('¡Listo!', 'El acceso ha sido revocado.');
              await loadAccessStatus();
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'No se pudo revocar el acceso');
            }
          },
        },
      ]
    );
  };

  const handleShareCredentials = () => {
    const text =
      `Hola ${staffName}, aquí están tus accesos para VYLTA:\n\n` +
      `Email: ${createdEmail}\n` +
      `Contraseña: ${createdPassword}\n\n` +
      `Descarga la app y entra con estos datos.`;
    Share.share({ message: text });
  };

  // Sección de acceso inyectada en StaffFormScreen
  const renderAccessSection = () => (
    <View style={{ marginTop: 8 }}>
      <Text style={[s.label, { color: tc.textMuted }]}>ACCESO A LA APP</Text>

      {loadingAccess ? (
        <View style={[s.accessCard, { backgroundColor: tc.surface, borderColor: tc.border }]}>
          <ActivityIndicator color="#10B981" />
        </View>
      ) : staffAccount ? (
        /* ── Tiene acceso ── */
        <View style={[s.accessCard, { backgroundColor: tc.surface, borderColor: '#A7F3D0' }]}>
          <View style={s.accessRow}>
            <View style={[s.accessIconWrap, { backgroundColor: '#ECFDF5' }]}>
              <MaterialIcons name="check-circle" size={20} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.accessTitle, { color: tc.text }]}>Acceso activo</Text>
              <Text style={[s.accessSub, { color: tc.textMuted }]}>
                Este colaborador puede iniciar sesión en la app.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[s.revokeBtn, { borderColor: '#FECACA' }]}
            onPress={handleRevokeAccess}
            activeOpacity={0.7}
          >
            <MaterialIcons name="no-accounts" size={16} color="#EF4444" />
            <Text style={s.revokeBtnText}>Revocar acceso</Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* ── Sin acceso ── */
        <View style={[s.accessCard, { backgroundColor: tc.surface, borderColor: tc.border }]}>
          <View style={s.accessRow}>
            <View style={[s.accessIconWrap, { backgroundColor: tc.bg }]}>
              <MaterialIcons name="no-accounts" size={20} color={tc.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.accessTitle, { color: tc.text }]}>Sin acceso a la app</Text>
              <Text style={[s.accessSub, { color: tc.textMuted }]}>
                Crea un acceso para que este colaborador pueda ver y gestionar citas.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[s.createBtn]}
            onPress={() => setShowCreateModal(true)}
            activeOpacity={0.8}
          >
            <MaterialIcons name="person-add-alt" size={16} color="#fff" />
            <Text style={s.createBtnText}>Crear acceso</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal crear acceso */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modalOverlay}>
            <View style={[s.modalBox, { backgroundColor: tc.surface }]}>
              <Text style={[s.modalTitle, { color: tc.text }]}>Crear acceso para {staffName}</Text>
              <Text style={[s.modalDesc, { color: tc.textMuted }]}>
                Define el correo y contraseña temporal que usará para iniciar sesión.
              </Text>

              <TextInput
                style={[s.input, { backgroundColor: tc.bg, color: tc.text, borderColor: tc.border }]}
                placeholder="Correo electrónico"
                placeholderTextColor={tc.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoFocus
              />
              <TextInput
                style={[s.input, { backgroundColor: tc.bg, color: tc.text, borderColor: tc.border, marginTop: 10 }]}
                placeholder="Contraseña temporal (mín. 8 caracteres)"
                placeholderTextColor={tc.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <View style={s.modalBtns}>
                <TouchableOpacity
                  style={[s.modalBtn, { backgroundColor: tc.bg, borderWidth: 1, borderColor: tc.border }]}
                  onPress={() => { setShowCreateModal(false); setEmail(''); setPassword(''); }}
                >
                  <Text style={[s.modalBtnText, { color: tc.textMuted }]}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.modalBtn, { backgroundColor: '#10B981' }]}
                  onPress={handleCreateAccess}
                  disabled={creatingAccess}
                >
                  {creatingAccess
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={[s.modalBtnText, { color: '#fff' }]}>Crear acceso</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal credenciales creadas */}
      <Modal visible={showCredentials} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: tc.surface }]}>
            <View style={s.successIcon}>
              <MaterialIcons name="check-circle" size={40} color="#10B981" />
            </View>
            <Text style={[s.modalTitle, { color: tc.text, textAlign: 'center' }]}>¡Acceso creado!</Text>
            <Text style={[s.modalDesc, { color: tc.textMuted, textAlign: 'center' }]}>
              Comparte estas credenciales con {staffName}:
            </Text>

            <View style={[s.credBox, { backgroundColor: tc.bg, borderColor: tc.border }]}>
              <Text style={[s.credLabel, { color: tc.textMuted }]}>Email</Text>
              <Text style={[s.credValue, { color: tc.text }]}>{createdEmail}</Text>
              <View style={[s.credDivider, { backgroundColor: tc.border }]} />
              <Text style={[s.credLabel, { color: tc.textMuted }]}>Contraseña temporal</Text>
              <Text style={[s.credValue, { color: tc.text }]}>{createdPassword}</Text>
            </View>

            <TouchableOpacity style={s.shareBtn} onPress={handleShareCredentials} activeOpacity={0.8}>
              <MaterialIcons name="share" size={18} color="#fff" />
              <Text style={s.shareBtnText}>Copiar / compartir por WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.closeBtn, { borderColor: tc.border }]}
              onPress={() => setShowCredentials(false)}
            >
              <Text style={{ color: tc.textMuted, fontWeight: '600' }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );

  return (
    <StaffFormScreen
      mode="edit"
      staffId={id}
      onSaved={() => router.back()}
      onCancel={() => router.back()}
      renderExtraSection={renderAccessSection}
    />
  );
}

const s = StyleSheet.create({
  label:         { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
  accessCard:    { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  accessRow:     { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  accessIconWrap:{ width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  accessTitle:   { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  accessSub:     { fontSize: 12, lineHeight: 17 },
  createBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10B981', borderRadius: 12, paddingVertical: 12 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  revokeBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 11 },
  revokeBtnText: { color: '#EF4444', fontWeight: '600', fontSize: 13 },
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalTitle:    { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  modalDesc:     { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  input:         { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  modalBtns:     { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBtn:      { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  modalBtnText:  { fontSize: 15, fontWeight: '700' },
  successIcon:   { alignItems: 'center', marginBottom: 10 },
  credBox:       { borderRadius: 14, borderWidth: 1, padding: 14, marginVertical: 12 },
  credLabel:     { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 3 },
  credValue:     { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  credDivider:   { height: 0.5, marginVertical: 10 },
  shareBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 13, marginBottom: 10 },
  shareBtnText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
  closeBtn:      { borderRadius: 12, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
});
