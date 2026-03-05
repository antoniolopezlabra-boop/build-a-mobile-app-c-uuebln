import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

interface UserData {
  id: string;
  businessName: string;
  businessType: string;
  phone: string;
  createdAt: string;
  totalClients: number;
  totalAppointments: number;
}

export default function UsersScreen() {
  const router = useRouter();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [showResetForm, setShowResetForm] = useState(false);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    try {
      const { data: profiles } = await supabase
        .from('business_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (!profiles) return;

      const usersData = await Promise.all(profiles.map(async (p) => {
        const { count: totalClients } = await supabase
          .from('clients').select('*', { count: 'exact', head: true }).eq('user_id', p.user_id);
        const { count: totalAppointments } = await supabase
          .from('appointments').select('*', { count: 'exact', head: true }).eq('user_id', p.user_id);
        return {
          id: p.user_id,
          businessName: p.business_name || 'Sin nombre',
          businessType: p.business_type || '-',
          phone: p.phone || '-',
          createdAt: p.created_at,
          totalClients: totalClients || 0,
          totalAppointments: totalAppointments || 0,
        };
      }));

      setUsers(usersData);
    } catch (error) {
      console.error('[Users] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!resetEmail.trim()) return;
    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim());
      if (error) throw error;
      setResetSuccess(true);
      setResetEmail('');
      setTimeout(() => { setResetSuccess(false); setShowResetForm(false); }, 3000);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo enviar el correo');
    } finally {
      setResetLoading(false);
    }
  };

  const filtered = users.filter(u =>
    u.businessName.toLowerCase().includes(search.toLowerCase()) ||
    u.phone.includes(search)
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>👤 Usuarios</Text>
        <Text style={styles.count}>{users.length}</Text>
      </View>

      {/* Reset Password Panel */}
      <TouchableOpacity style={styles.resetToggle} onPress={() => setShowResetForm(!showResetForm)}>
        <Text style={styles.resetToggleText}>🔑 {showResetForm ? 'Ocultar' : 'Reset password a usuario'}</Text>
      </TouchableOpacity>

      {showResetForm && (
        <View style={styles.resetForm}>
          {resetSuccess ? (
            <Text style={styles.resetSuccess}>✅ Link enviado exitosamente</Text>
          ) : (
            <>
              <TextInput
                style={styles.resetInput}
                placeholder="Correo del usuario..."
                placeholderTextColor="#475569"
                value={resetEmail}
                onChangeText={setResetEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <TouchableOpacity style={styles.resetBtn} onPress={handleReset} disabled={resetLoading}>
                <Text style={styles.resetBtnText}>{resetLoading ? 'Enviando...' : 'Enviar link de recuperación'}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.search}
          placeholder="Buscar negocio o teléfono..."
          placeholderTextColor="#475569"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#F59E0B" style={{ flex: 1 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {filtered.map((user) => (
            <TouchableOpacity
              key={user.id}
              style={styles.card}
              onPress={() => router.push(`/admin/tenant/${user.id}`)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{user.businessName.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.businessName}>{user.businessName}</Text>
                  <Text style={styles.businessType}>{user.businessType}</Text>
                  <Text style={styles.date}>📞 {user.phone} · Desde {new Date(user.createdAt).toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })}</Text>
                </View>
                <Text style={styles.arrow}>›</Text>
              </View>
              <View style={styles.cardStats}>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{user.totalClients}</Text>
                  <Text style={styles.statLabel}>Clientes</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{user.totalAppointments}</Text>
                  <Text style={styles.statLabel}>Citas</Text>
                </View>
              </View>
            </TouchableOpacity>
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
  count: { backgroundColor: '#F59E0B', color: '#0F172A', fontWeight: '800', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, fontSize: 14 },
  resetToggle: { backgroundColor: '#1E293B', margin: 16, marginBottom: 0, borderRadius: 12, padding: 14, alignItems: 'center' },
  resetToggleText: { color: '#F59E0B', fontWeight: '700', fontSize: 14 },
  resetForm: { backgroundColor: '#1E293B', marginHorizontal: 16, borderRadius: 12, padding: 14, gap: 10 },
  resetInput: { backgroundColor: '#0F172A', borderRadius: 10, padding: 12, color: '#F8FAFC', fontSize: 14 },
  resetBtn: { backgroundColor: '#F59E0B', borderRadius: 10, padding: 12, alignItems: 'center' },
  resetBtnText: { color: '#0F172A', fontWeight: '700' },
  resetSuccess: { color: '#10B981', fontWeight: '700', textAlign: 'center', padding: 8 },
  searchContainer: { padding: 16, paddingBottom: 8 },
  search: { backgroundColor: '#1E293B', borderRadius: 12, padding: 12, color: '#F8FAFC', fontSize: 15 },
  scroll: { padding: 16, paddingBottom: 100 },
  card: { backgroundColor: '#1E293B', borderRadius: 16, marginBottom: 12, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800', color: '#fff' },
  cardInfo: { flex: 1 },
  businessName: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  businessType: { fontSize: 12, color: '#F59E0B', marginTop: 2 },
  date: { fontSize: 11, color: '#64748B', marginTop: 2 },
  arrow: { fontSize: 24, color: '#475569' },
  cardStats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#0F172A' },
  stat: { flex: 1, alignItems: 'center', padding: 12 },
  statValue: { fontSize: 20, fontWeight: '800', color: '#F8FAFC' },
  statLabel: { fontSize: 11, color: '#64748B', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: '#0F172A' },
});
