import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface StaffMember {
  id: string;
  name: string;
  role: string | null;
  color: string;
  avatar_url: string | null;
  is_active: boolean;
  sort_order: number;
}

const COLORS = [
  '#10B981','#3B82F6','#F59E0B','#EF4444','#8B5CF6',
  '#EC4899','#06B6D4','#F97316','#84CC16','#6366F1',
];

export default function StaffListScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors: tc } = useTheme();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => { loadStaff(); }, []));

  const loadStaff = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('staff_members')
        .select('*')
        .eq('user_id', user?.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      setStaff(data || []);
    } catch (e) {
      console.error('[Staff]', e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (member: StaffMember) => {
    const newState = !member.is_active;
    const label = newState ? 'activar' : 'desactivar';
    Alert.alert(
      `${newState ? 'Activar' : 'Desactivar'} a ${member.name}`,
      `¿Deseas ${label} a este colaborador? ${!newState ? 'Sus citas existentes no se verán afectadas.' : ''}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: newState ? 'Activar' : 'Desactivar',
          style: newState ? 'default' : 'destructive',
          onPress: async () => {
            await supabase.from('staff_members')
              .update({ is_active: newState })
              .eq('id', member.id);
            loadStaff();
          },
        },
      ]
    );
  };

  const activeStaff   = staff.filter(s => s.is_active);
  const inactiveStaff = staff.filter(s => !s.is_active);

  const renderMember = (member: StaffMember) => (
    <TouchableOpacity
      key={member.id}
      style={[st.card, { backgroundColor: tc.surface }]}
      onPress={() => router.push(`/settings/staff/${member.id}` as any)}
      activeOpacity={0.75}
    >
      {/* Avatar con inicial y color */}
      <View style={[st.avatar, { backgroundColor: member.color + '20', borderColor: member.color }]}>
        <Text style={[st.avatarText, { color: member.color }]}>
          {member.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
        </Text>
      </View>

      {/* Info */}
      <View style={st.cardInfo}>
        <Text style={[st.cardName, { color: tc.text }]}>{member.name}</Text>
        {member.role ? (
          <Text style={[st.cardRole, { color: tc.textMuted }]}>{member.role}</Text>
        ) : null}
      </View>

      {/* Acciones */}
      <View style={st.cardActions}>
        {/* Dot de color identificador */}
        <View style={[st.colorDot, { backgroundColor: member.color }]} />
        <TouchableOpacity
          onPress={() => handleToggleActive(member)}
          style={[st.statusBadge, { backgroundColor: member.is_active ? '#ECFDF5' : '#F1F5F9' }]}
        >
          <Text style={[st.statusText, { color: member.is_active ? '#10B981' : '#94A3B8' }]}>
            {member.is_active ? 'Activo' : 'Inactivo'}
          </Text>
        </TouchableOpacity>
        <MaterialIcons name="arrow-forward-ios" size={14} color={tc.border} />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[st.container, { backgroundColor: tc.bg }]} edges={['top']}>

      {/* Header */}
      <View style={[st.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.back}>
          <MaterialIcons name="arrow-back" size={24} color={tc.text} />
        </TouchableOpacity>
        <View style={st.headerMid}>
          <Text style={[st.title, { color: tc.text }]}>Mi equipo</Text>
          <Text style={[st.subtitle, { color: tc.textMuted }]}>
            {activeStaff.length} colaborador{activeStaff.length !== 1 ? 'es' : ''} activo{activeStaff.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={st.addBtn}
          onPress={() => router.push('/settings/staff/new' as any)}
        >
          <MaterialIcons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={st.centered}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : staff.length === 0 ? (
        // Estado vacío
        <View style={st.empty}>
          <View style={st.emptyIcon}>
            <MaterialIcons name="group" size={48} color="#10B981" />
          </View>
          <Text style={[st.emptyTitle, { color: tc.text }]}>Agrega tu equipo</Text>
          <Text style={[st.emptyDesc, { color: tc.textMuted }]}>
            Registra a tus colaboradores para asignarles citas y gestionar su agenda por separado.
          </Text>
          <TouchableOpacity
            style={st.emptyBtn}
            onPress={() => router.push('/settings/staff/new' as any)}
          >
            <MaterialIcons name="add" size={18} color="#fff" />
            <Text style={st.emptyBtnText}>Agregar primer colaborador</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

          {/* Banner informativo */}
          <View style={st.infoBanner}>
            <MaterialIcons name="info-outline" size={16} color="#3B82F6" />
            <Text style={st.infoText}>
              Cada colaborador tiene su propio horario y agenda. Tus clientes podrán elegir con quién quieren su cita al agendar en línea.
            </Text>
          </View>

          {/* Activos */}
          {activeStaff.length > 0 && (
            <>
              <Text style={[st.sectionLabel, { color: tc.textMuted }]}>ACTIVOS</Text>
              {activeStaff.map(renderMember)}
            </>
          )}

          {/* Inactivos */}
          {inactiveStaff.length > 0 && (
            <>
              <Text style={[st.sectionLabel, { color: tc.textMuted }]}>INACTIVOS</Text>
              {inactiveStaff.map(renderMember)}
            </>
          )}

          {/* Botón agregar */}
          <TouchableOpacity
            style={st.addMoreBtn}
            onPress={() => router.push('/settings/staff/new' as any)}
          >
            <MaterialIcons name="person-add" size={18} color="#10B981" />
            <Text style={st.addMoreText}>Agregar colaborador</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container:      { flex: 1 },
  centered:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  back:           { padding: 4 },
  headerMid:      { flex: 1, paddingHorizontal: 12 },
  title:          { fontSize: 20, fontWeight: '700' },
  subtitle:       { fontSize: 12, marginTop: 1 },
  addBtn:         { width: 36, height: 36, borderRadius: 10, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
  scroll:         { padding: 16 },
  infoBanner:     { flexDirection: 'row', gap: 10, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: '#BFDBFE', marginBottom: 16 },
  infoText:       { flex: 1, fontSize: 12, color: '#1E40AF', lineHeight: 18 },
  sectionLabel:   { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8, marginTop: 8 },
  card:           { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  avatar:         { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, marginRight: 12 },
  avatarText:     { fontSize: 16, fontWeight: '800' },
  cardInfo:       { flex: 1 },
  cardName:       { fontSize: 15, fontWeight: '700' },
  cardRole:       { fontSize: 12, marginTop: 2 },
  cardActions:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colorDot:       { width: 8, height: 8, borderRadius: 4 },
  statusBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText:     { fontSize: 11, fontWeight: '700' },
  empty:          { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyIcon:      { width: 88, height: 88, borderRadius: 24, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center' },
  emptyTitle:     { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  emptyDesc:      { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  emptyBtn:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#10B981', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, marginTop: 8 },
  emptyBtnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },
  addMoreBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: '#10B981', borderRadius: 14, paddingVertical: 14, marginTop: 8 },
  addMoreText:    { color: '#10B981', fontWeight: '700', fontSize: 15 },
});
