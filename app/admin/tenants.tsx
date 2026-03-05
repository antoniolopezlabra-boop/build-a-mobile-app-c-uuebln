import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

interface Tenant {
  id: string;
  userId: string;
  businessName: string;
  businessType: string;
  phone: string;
  email: string;
  createdAt: string;
  totalClients: number;
  totalAppointments: number;
}

export default function TenantsScreen() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { loadTenants(); }, []);

  const loadTenants = async () => {
    try {
      const { data: profiles } = await supabase
        .from('business_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (!profiles) return;

      const tenantsData = await Promise.all(profiles.map(async (p) => {
        const { data: authUser } = await supabase
          .from('vylta_admins')
          .select('email')
          .eq('user_id', p.user_id)
          .single();

        const { count: totalClients } = await supabase
          .from('clients')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', p.user_id);

        const { count: totalAppointments } = await supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', p.user_id);

        return {
          id: p.id,
          userId: p.user_id,
          businessName: p.business_name || 'Sin nombre',
          businessType: p.business_type || '-',
          phone: p.phone || '-',
          email: p.email || '-',
          createdAt: p.created_at,
          totalClients: totalClients || 0,
          totalAppointments: totalAppointments || 0,
        };
      }));

      setTenants(tenantsData);
    } catch (error) {
      console.error('[Tenants] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = tenants.filter(t =>
    t.businessName.toLowerCase().includes(search.toLowerCase()) ||
    t.phone.includes(search) ||
    t.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🏢 Negocios</Text>
        <Text style={styles.count}>{tenants.length}</Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.search}
          placeholder="Buscar negocio, teléfono..."
          placeholderTextColor="#475569"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#F59E0B" style={{ flex: 1 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {filtered.length === 0 ? (
            <Text style={styles.empty}>No hay negocios registrados</Text>
          ) : (
            filtered.map((tenant) => (
              <TouchableOpacity
                key={tenant.id}
                style={styles.card}
                onPress={() => router.push(`/admin/tenant/${tenant.userId}`)}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{tenant.businessName.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.businessName}>{tenant.businessName}</Text>
                    <Text style={styles.businessType}>{tenant.businessType}</Text>
                    <Text style={styles.phone}>📞 {tenant.phone}</Text>
                  </View>
                  <Text style={styles.arrow}>›</Text>
                </View>
                <View style={styles.cardStats}>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{tenant.totalClients}</Text>
                    <Text style={styles.statLabel}>Clientes</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{tenant.totalAppointments}</Text>
                    <Text style={styles.statLabel}>Citas</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{new Date(tenant.createdAt).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}</Text>
                    <Text style={styles.statLabel}>Registro</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
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
  searchContainer: { padding: 16, paddingTop: 12 },
  search: { backgroundColor: '#1E293B', borderRadius: 12, padding: 12, color: '#F8FAFC', fontSize: 15 },
  scroll: { padding: 16, paddingBottom: 100 },
  empty: { textAlign: 'center', color: '#475569', marginTop: 40, fontSize: 15 },
  card: { backgroundColor: '#1E293B', borderRadius: 16, marginBottom: 12, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F59E0B', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  cardInfo: { flex: 1 },
  businessName: { fontSize: 16, fontWeight: '700', color: '#F8FAFC' },
  businessType: { fontSize: 12, color: '#F59E0B', marginTop: 2 },
  phone: { fontSize: 12, color: '#64748B', marginTop: 2 },
  arrow: { fontSize: 24, color: '#475569' },
  cardStats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#0F172A' },
  stat: { flex: 1, alignItems: 'center', padding: 12 },
  statValue: { fontSize: 18, fontWeight: '800', color: '#F8FAFC' },
  statLabel: { fontSize: 11, color: '#64748B', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: '#0F172A' },
});
