import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAdmin } from '@/contexts/AdminContext';

interface AdminMember {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export default function AdminsScreen() {
  const router = useRouter();
  const { isSuperAdmin } = useAdmin();
  const [admins, setAdmins] = useState<AdminMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { loadAdmins(); }, []);

  const loadAdmins = async () => {
    try {
      const { data } = await supabase
        .from('vylta_admins')
        .select('*')
        .order('created_at', { ascending: true });

      setAdmins((data || []).map(a => ({
        id: a.id,
        name: a.name,
        email: a.email,
        role: a.role,
        isActive: a.is_active,
        createdAt: a.created_at,
      })));
    } catch (error) {
      console.error('[Admins] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from('vylta_admins').update({ is_active: !current }).eq('id', id);
    loadAdmins();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🛡️ Admins VYLTA</Text>
        {isSuperAdmin && (
          <TouchableOpacity onPress={() => setShowForm(!showForm)}>
            <Text style={styles.addBtn}>{showForm ? 'Cancelar' : '+ Agregar'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {showForm && (
        <View style={styles.form}>
          <TextInput style={styles.input} placeholder="Nombre" placeholderTextColor="#475569" value={name} onChangeText={setName} />
          <TextInput style={styles.input} placeholder="Correo" placeholderTextColor="#475569" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Text style={styles.hint}>El usuario debe ya estar registrado en VYLTA. Se le asignará rol Admin (solo lectura).</Text>
          <TouchableOpacity style={styles.submitBtn} disabled={adding} onPress={async () => {
            if (!email || !name) return;
            setAdding(true);
            const { data: authUser } = await supabase.from('business_profiles').select('user_id').eq('phone', email).single();
            // Buscar por email en auth
            setAdding(false);
            alert('Para agregar un admin, ve a Supabase → Table Editor → vylta_admins e inserta el user_id del usuario.');
          }}>
            <Text style={styles.submitBtnText}>{adding ? 'Agregando...' : 'Agregar Admin'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#F59E0B" style={{ flex: 1 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {admins.map((admin) => (
            <View key={admin.id} style={styles.card}>
              <View style={styles.cardLeft}>
                <View style={[styles.roleBadge, { backgroundColor: admin.role === 'superadmin' ? '#F59E0B' : '#3B82F6' }]}>
                  <Text style={styles.roleText}>{admin.role === 'superadmin' ? '⚡' : '👁'}</Text>
                </View>
                <View>
                  <Text style={styles.adminName}>{admin.name}</Text>
                  <Text style={styles.adminEmail}>{admin.email}</Text>
                  <Text style={styles.adminRole}>{admin.role === 'superadmin' ? 'SuperAdmin' : 'Admin'}</Text>
                </View>
              </View>
              {isSuperAdmin && admin.role !== 'superadmin' && (
                <TouchableOpacity
                  style={[styles.toggleBtn, { backgroundColor: admin.isActive ? '#EF4444' : '#10B981' }]}
                  onPress={() => toggleActive(admin.id, admin.isActive)}
                >
                  <Text style={styles.toggleText}>{admin.isActive ? 'Desactivar' : 'Activar'}</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  back: { color: '#94A3B8', fontSize: 15 },
  title: { fontSize: 18, fontWeight: '700', color: '#F8FAFC' },
  addBtn: { color: '#F59E0B', fontWeight: '700', fontSize: 15 },
  form: { backgroundColor: '#1E293B', margin: 16, borderRadius: 16, padding: 16, gap: 10 },
  input: { backgroundColor: '#0F172A', borderRadius: 10, padding: 12, color: '#F8FAFC' },
  hint: { fontSize: 12, color: '#64748B' },
  submitBtn: { backgroundColor: '#F59E0B', borderRadius: 10, padding: 12, alignItems: 'center' },
  submitBtnText: { color: '#0F172A', fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 100 },
  card: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  roleBadge: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  roleText: { fontSize: 20 },
  adminName: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  adminEmail: { fontSize: 12, color: '#64748B' },
  adminRole: { fontSize: 12, color: '#F59E0B', marginTop: 2 },
  toggleBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  toggleText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
