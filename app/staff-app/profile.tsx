import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';

export default function StaffProfileScreen() {
  const router = useRouter();
  const { staffMemberData, user, signOut } = useAuth();
  const { colors: tc } = useTheme();

  const [businessName, setBusinessName] = useState<string | null>(null);
  const [loadingBiz, setLoadingBiz]     = useState(true);

  // Modal cambiar contraseña
  const [showPwModal, setShowPwModal] = useState(false);
  const [newPw, setNewPw]             = useState('');
  const [confirmPw, setConfirmPw]     = useState('');
  const [savingPw, setSavingPw]       = useState(false);

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
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo cambiar la contraseña.');
    } finally {
      setSavingPw(false);
    }
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

      {/* Modal cambiar contraseña */}
      <Modal visible={showPwModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: tc.surface }]}>
            <Text style={[s.modalTitle, { color: tc.text }]}>Cambiar contraseña</Text>

            <TextInput
              style={[s.input, { backgroundColor: tc.bg, color: tc.text, borderColor: tc.border }]}
              placeholder="Nueva contraseña (mín. 8 caracteres)"
              placeholderTextColor={tc.textMuted}
              value={newPw}
              onChangeText={setNewPw}
              secureTextEntry
              autoFocus
            />
            <TextInput
              style={[s.input, { backgroundColor: tc.bg, color: tc.text, borderColor: tc.border, marginTop: 10 }]}
              placeholder="Confirmar contraseña"
              placeholderTextColor={tc.textMuted}
              value={confirmPw}
              onChangeText={setConfirmPw}
              secureTextEntry
            />

            <View style={s.modalBtns}>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: tc.bg, borderWidth: 1, borderColor: tc.border }]}
                onPress={() => { setShowPwModal(false); setNewPw(''); setConfirmPw(''); }}
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
        </View>
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox:     { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalTitle:   { fontSize: 17, fontWeight: '700', marginBottom: 14 },
  input:        { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  modalBtns:    { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBtn:     { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  modalBtnText: { fontSize: 15, fontWeight: '700' },
});
