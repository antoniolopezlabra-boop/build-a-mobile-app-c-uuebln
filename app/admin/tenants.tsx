import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, Modal, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

const PLAN_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  Premium: { label: 'Premium', color: '#6366F1', bg: '#1A1040' },
  Basico:  { label: 'Básico',  color: '#10B981', bg: '#0F2E1F' },
  Básico:  { label: 'Básico',  color: '#10B981', bg: '#0F2E1F' },
  Gratuito:{ label: 'Gratuito',color: '#64748B', bg: '#1E293B' },
};

function normalizePlan(raw: string) {
  const lower = (raw || '').toLowerCase().trim();
  if (lower === 'basico' || lower === 'básico') return 'Basico';
  if (lower === 'premium') return 'Premium';
  return 'Gratuito';
}

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
  plan: string;
  planStatus: string;
}

export default function TenantsScreen() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState<string | null>(null);

  // Modal reset password
  const [resetModal, setResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => { loadTenants(); }, []);

  const loadTenants = async () => {
    try {
      const { data: profiles } = await supabase
        .from('business_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (!profiles) return;

      // SECURITY DEFINER — bypasea RLS, devuelve todos los planes
      const { data: plansData, error: plansError } = await supabase
        .rpc('get_all_subscription_plans');

      if (plansError) console.error('[Tenants] Plans RPC error:', plansError);

      // Construir mapa user_id → plan en memoria
      const planMap: Record<string, { plan_type: string; status: string }> = {};
      plansData?.forEach((p: any) => { planMap[p.user_id] = p; });

      const tenantsData = await Promise.all(profiles.map(async (p: any) => {
        const [{ count: totalClients }, { count: totalAppointments }] = await Promise.all([
          supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', p.user_id),
          supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('user_id', p.user_id),
        ]);
        const planInfo = planMap[p.user_id];
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
          plan: planInfo ? normalizePlan(planInfo.plan_type) : 'Gratuito',
          planStatus: planInfo?.status || 'active',
        };
      }));

      setTenants(tenantsData);
    } catch (error) {
      console.error('[Tenants] Error:', error);
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
      setTimeout(() => { setResetSuccess(false); setResetModal(false); }, 2500);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo enviar el correo');
    } finally {
      setResetLoading(false);
    }
  };

  const planFilters = ['Basico', 'Premium', 'Gratuito'];
  const filtered = tenants.filter(t => {
    const matchSearch =
      t.businessName.toLowerCase().includes(search.toLowerCase()) ||
      t.phone.includes(search) ||
      t.email.toLowerCase().includes(search.toLowerCase());
    const matchPlan = !filterPlan || t.plan === filterPlan;
    return matchSearch && matchPlan;
  });

  const counts = {
    Basico: tenants.filter(t => t.plan === 'Basico').length,
    Premium: tenants.filter(t => t.plan === 'Premium').length,
    Gratuito: tenants.filter(t => t.plan === 'Gratuito').length,
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🏢 Negocios</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{tenants.length}</Text>
        </View>
      </View>

      {/* Filtros de plan */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, !filterPlan && styles.filterChipActive]}
          onPress={() => setFilterPlan(null)}>
          <Text style={[styles.filterChipText, !filterPlan && styles.filterChipTextActive]}>Todos</Text>
        </TouchableOpacity>
        {planFilters.map(plan => {
          const cfg = PLAN_CONFIG[plan];
          const active = filterPlan === plan;
          return (
            <TouchableOpacity
              key={plan}
              style={[styles.filterChip, active && { backgroundColor: cfg.color + '22', borderColor: cfg.color }]}
              onPress={() => setFilterPlan(active ? null : plan)}>
              <Text style={[styles.filterChipText, active && { color: cfg.color }]}>
                {cfg.label} ({counts[plan as keyof typeof counts]})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Busqueda + Reset btn */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          placeholder="Buscar negocio, teléfono, email..."
          placeholderTextColor="#475569"
          value={search}
          onChangeText={setSearch}
        />
        <TouchableOpacity style={styles.resetBtn} onPress={() => setResetModal(true)}>
          <Text style={styles.resetBtnText}>🔑</Text>
        </TouchableOpacity>
      </View>

      {/* Lista */}
      {loading ? (
        <ActivityIndicator size="large" color="#F59E0B" style={{ flex: 1 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {filtered.length === 0 ? (
            <Text style={styles.empty}>No hay negocios que coincidan</Text>
          ) : (
            filtered.map((tenant) => {
              const planCfg = PLAN_CONFIG[tenant.plan] || PLAN_CONFIG.Gratuito;
              return (
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
                    <View>
                      <View style={[styles.planBadge, { backgroundColor: planCfg.bg, borderColor: planCfg.color }]}>
                        <Text style={[styles.planBadgeText, { color: planCfg.color }]}>{planCfg.label}</Text>
                      </View>
                      <Text style={styles.arrow}>›</Text>
                    </View>
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
                      <Text style={styles.statValue}>
                        {new Date(tenant.createdAt).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
                      </Text>
                      <Text style={styles.statLabel}>Registro</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Modal Reset Password */}
      <Modal visible={resetModal} transparent animationType="fade" onRequestClose={() => setResetModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>🔑 Reset de contraseña</Text>
            <Text style={styles.modalDesc}>Ingresa el email del usuario para enviarle un link de recuperación.</Text>
            {resetSuccess ? (
              <Text style={styles.successText}>✅ Link enviado exitosamente</Text>
            ) : (
              <>
                <TextInput
                  style={styles.modalInput}
                  placeholder="email@usuario.com"
                  placeholderTextColor="#475569"
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoFocus
                />
                <TouchableOpacity
                  style={[styles.sendBtn, resetLoading && { opacity: 0.6 }]}
                  onPress={handleReset}
                  disabled={resetLoading}>
                  <Text style={styles.sendBtnText}>{resetLoading ? 'Enviando...' : 'Enviar link'}</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setResetModal(false); setResetEmail(''); setResetSuccess(false); }}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  back: { color: '#94A3B8', fontSize: 15 },
  title: { fontSize: 17, fontWeight: '700', color: '#F8FAFC' },
  countBadge: { backgroundColor: '#F59E0B', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  countText: { color: '#0F172A', fontWeight: '800', fontSize: 13 },
  filterRow: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 4 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155' },
  filterChipActive: { backgroundColor: '#F59E0B22', borderColor: '#F59E0B' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  filterChipTextActive: { color: '#F59E0B' },
  searchRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  search: { flex: 1, backgroundColor: '#1E293B', borderRadius: 12, padding: 12, color: '#F8FAFC', fontSize: 14 },
  resetBtn: { backgroundColor: '#1E293B', borderRadius: 12, width: 46, justifyContent: 'center', alignItems: 'center' },
  resetBtnText: { fontSize: 20 },
  scroll: { padding: 12, paddingBottom: 100 },
  empty: { textAlign: 'center', color: '#475569', marginTop: 40, fontSize: 15 },
  card: { backgroundColor: '#1E293B', borderRadius: 16, marginBottom: 10, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F59E0B', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  cardInfo: { flex: 1 },
  businessName: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  businessType: { fontSize: 11, color: '#F59E0B', marginTop: 2 },
  phone: { fontSize: 11, color: '#64748B', marginTop: 2 },
  planBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, marginBottom: 4 },
  planBadgeText: { fontSize: 10, fontWeight: '700' },
  arrow: { fontSize: 20, color: '#475569', textAlign: 'right' },
  cardStats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#0F172A' },
  stat: { flex: 1, alignItems: 'center', padding: 10 },
  statValue: { fontSize: 16, fontWeight: '800', color: '#F8FAFC' },
  statLabel: { fontSize: 10, color: '#64748B', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: '#0F172A' },
  modalOverlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#1E293B', borderRadius: 20, padding: 24, gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#F8FAFC' },
  modalDesc: { fontSize: 13, color: '#64748B', lineHeight: 20 },
  modalInput: { backgroundColor: '#0F172A', borderRadius: 12, padding: 14, color: '#F8FAFC', fontSize: 14 },
  sendBtn: { backgroundColor: '#F59E0B', borderRadius: 12, padding: 14, alignItems: 'center' },
  sendBtnText: { color: '#0F172A', fontWeight: '800', fontSize: 15 },
  cancelBtn: { alignItems: 'center', padding: 8 },
  cancelBtnText: { color: '#64748B', fontSize: 14 },
  successText: { color: '#10B981', fontWeight: '700', textAlign: 'center', fontSize: 15, padding: 8 },
});
