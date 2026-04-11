import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';

export default function StaffProfileScreen() {
  const router = useRouter();
  const { staffMemberData, user, signOut } = useAuth();
  const { colors: tc } = useTheme();
  const insets = useSafeAreaInsets();

  const [businessName, setBusinessName] = useState<string | null>(null);
  const [loadingBiz, setLoadingBiz]     = useState(true);

  // Modal cambiar contraseña
  const [showPwModal, setShowPwModal] = useState(false);
  const [newPw, setNewPw]             = useState('');
  const [confirmPw, setConfirmPw]     = useState('');
  const [savingPw, setSavingPw]       = useState(false);
  const [showNewPw, setShowNewPw]     = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  useEffect(() => { loadBusinessName(); }, []);

  const loadBusinessName = async () => {
    if (!staffMemberData?.organizationUserId) { setLoadingBiz(false); return; }
    try {
      const { data } = await supabase
        .from('business_profiles')
        .select('business_name')
        .eq('user_id', staffMemberData.organizationUserId)
        .single();
      setBusinessName(data?.business_name ?? null);
    } catch (e) {
      console.warn('[StaffProfile] loadBusinessName error:', e);
    } finally {
      setLoadingBiz(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPw.length < 8) {
      Alert.alert('Contraseña inválida', 'Debe tener al menos 8 caracteres.'); return;
    }
    if (newPw !== confirmPw) {
      Alert.alert('Error', 'Las contraseñas no coinciden.'); return;
    }
    setSavingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      Alert.alert('¡Listo!', 'Tu contraseña fue actualizada.');
      setShowPwModal(false);
      setNewPw(''); setConfirmPw('');
      setShowNewPw(false); setShowConfirmPw(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo cambiar la contraseña.');
    } finally {
      setSavingPw(false);
    }
  };

  const closePwModal = () => {
    Keyboard.dismiss();
    setShowPwModal(false);
    setNewPw(''); setConfirmPw('');
    setShowNewPw(false); setShowConfirmPw(false);
  };

  const handleSignOut = () => {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const initials = staffMemberData?.name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() ?? 'C';

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <MaterialIcons name="arrow-back" size={24} color={tc.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: tc.text }]}>Mi perfil</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Avatar */}
        <View style={s.avatarSection}>
          <View style={s.avatarCircle}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <Text style={[s.staffName, { color: tc.text }]}>{staffMemberData?.name ?? 'Colaborador'}</Text>
          <View style={[s.roleBadge, { backgroundColor: '#ECFDF5' }]}>
            <Text style={s.roleText}>Colaborador</Text>
          </View>
        </View>

        {/* Info */}
        <View style={[s.card, { backgroundColor: tc.surface, borderColor: tc.border }]}>
          <View style={s.infoRow}>
            <MaterialIcons name="email" size={18} color="#10B981" />
            <View style={{ flex: 1 }}>
              <Text style={[s.infoLabel, { color: tc.textMuted }]}>Correo electrónico</Text>
              <Text style={[s.infoValue, { color: tc.text }]}>{user?.email ?? '—'}</Text>
            </View>
          </View>
          <View style={[s.divider, { backgroundColor: tc.border }]} />
          <View style={s.infoRow}>
            <MaterialIcons name="store" size={18} color="#10B981" />
            <View style={{ flex: 1 }}>
              <Text style={[s.infoLabel, { color: tc.textMuted }]}>Negocio</Text>
              {loadingBiz
                ? <ActivityIndicator size="small" color="#10B981" />
                : <Text style={[s.infoValue, { color: tc.text }]}>{businessName ?? '—'}</Text>
              }
            </View>
          </View>
        </View>

        {/* Acciones */}
        <TouchableOpacity
          style={[s.actionRow, { backgroundColor: tc.surface, borderColor: tc.border }]}
          onPress={() => setShowPwModal(true)}
          activeOpacity={0.7}
        >
          <MaterialIcons name="lock-outline" size={20} color="#10B981" />
          <Text style={[s.actionText, { color: tc.text }]}>Cambiar contraseña</Text>
          <MaterialIcons name="chevron-right" size={18} color={tc.border} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.actionRow, { backgroundColor: tc.surface, borderColor: '#FECACA' }]}
          onPress={handleSignOut}
          activeOpacity={0.7}
        >
          <MaterialIcons name="logout" size={20} color="#EF4444" />
          <Text style={[s.actionText, { color: '#EF4444' }]}>Cerrar sesión</Text>
          <MaterialIcons name="chevron-right" size={18} color="#FECACA" />
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modal cambiar contraseña — sube con el teclado */}
      <Modal visible={showPwModal} transparent animationType="slide">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={s.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={[
                  s.modalBox,
                  { backgroundColor: tc.surface, paddingBottom: insets.bottom + 20 }
                ]}>
                  <View style={s.modalHandle} />
                  <Text style={[s.modalTitle, { color: tc.text }]}>Cambiar contraseña</Text>

                  {/* Nueva contraseña */}
                  <View style={[s.inputWrap, { backgroundColor: tc.bg, borderColor: tc.border }]}>
                    <TextInput
                      style={[s.input, { color: tc.text }]}
                      placeholder="Nueva contraseña (mín. 8 caracteres)"
                      placeholderTextColor={tc.textMuted}
                      value={newPw}
                      onChangeText={setNewPw}
                      secureTextEntry={!showNewPw}
                      autoFocus
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      onPress={() => setShowNewPw(v => !v)}
                      style={s.eyeBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <MaterialIcons
                        name={showNewPw ? 'visibility' : 'visibility-off'}
                        size={20}
                        color={tc.textMuted}
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Confirmar contraseña */}
                  <View style={[s.inputWrap, { backgroundColor: tc.bg, borderColor: tc.border, marginTop: 10 }]}>
                    <TextInput
                      style={[s.input, { color: tc.text }]}
                      placeholder="Confirmar contraseña"
                      placeholderTextColor={tc.textMuted}
                      value={confirmPw}
                      onChangeText={setConfirmPw}
                      secureTextEntry={!showConfirmPw}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirmPw(v => !v)}
                      style={s.eyeBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <MaterialIcons
                        name={showConfirmPw ? 'visibility' : 'visibility-off'}
                        size={20}
                        color={tc.textMuted}
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={s.modalBtns}>
                    <TouchableOpacity
                      style={[s.modalBtn, { backgroundColor: tc.bg, borderWidth: 1, borderColor: tc.border }]}
                      onPress={closePwModal}
                    >
                      <Text style={[s.modalBtnText, { color: tc.textMuted }]}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.modalBtn, { backgroundColor: '#10B981' }]}
                      onPress={handleChangePassword}
                      disabled={savingPw}
                    >
                      {savingPw
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={[s.modalBtnText, { color: '#fff' }]}>Guardar</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  back:         { padding: 4, width: 40 },
  headerTitle:  { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  scroll:       { padding: 16 },
  avatarSection:{ alignItems: 'center', paddingVertical: 24, gap: 10 },
  avatarCircle: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
  avatarText:   { fontSize: 28, fontWeight: '800', color: '#fff' },
  staffName:    { fontSize: 22, fontWeight: '700' },
  roleBadge:    { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  roleText:     { fontSize: 13, fontWeight: '600', color: '#10B981' },
  card:         { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  infoRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  infoLabel:    { fontSize: 11, marginBottom: 2 },
  infoValue:    { fontSize: 15, fontWeight: '600' },
  divider:      { height: 0.5, marginVertical: 12 },
  actionRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 10 },
  actionText:   { flex: 1, fontSize: 15, fontWeight: '600' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox:     { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingTop: 12 },
  modalHandle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 16 },
  modalTitle:   { fontSize: 17, fontWeight: '700', marginBottom: 16 },
  inputWrap:    { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 14 },
  input:        { flex: 1, paddingVertical: 12, fontSize: 15 },
  eyeBtn:       { paddingLeft: 8, paddingVertical: 12 },
  modalBtns:    { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBtn:     { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  modalBtnText: { fontSize: 15, fontWeight: '700' },
});
