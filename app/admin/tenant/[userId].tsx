import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function TenantDetailScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadTenant(); }, []);

  const loadTenant = async () => {
    try {
      const [
        { data: profile },
        { count: totalClients },
        { count: totalAppointments },
        { count: todayAppointments },
      ] = await Promise.all([
        supabase.from('business_profiles').select('*').eq('user_id', userId).single(),
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('date', new Date().toISOString().split('T')[0]),
      ]);

      setData({ profile, totalClients, totalAppointments, todayAppointments });
    } catch (error) {
      console.error('[TenantDetail] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <SafeAreaView style={styles.container}><ActivityIndicator size="large" color="#F59E0B" style={{ flex: 1 }} /></SafeAreaView>;

  const p = data?.profile;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Detalle</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.heroCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{p?.business_name?.charAt(0)?.toUpperCase() || '?'}</Text>
          </View>
          <Text style={styles.businessName}>{p?.business_name || 'Sin nombre'}</Text>
          <Text style={styles.businessType}>{p?.business_type || '-'}</Text>
          <Text style={styles.since}>Cliente desde {p?.created_at ? new Date(p.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long' }) : '-'}</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{data?.totalClients}</Text>
            <Text style={styles.statLabel}>Clientes</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{data?.totalAppointments}</Text>
            <Text style={styles.statLabel}>Citas totales</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{data?.todayAppointments}</Text>
            <Text style={styles.statLabel}>Citas hoy</Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>📋 Información de contacto</Text>
          {p?.phone && <Text style={styles.infoRow}>📞 {p.phone}</Text>}
          {p?.alternative_phone && <Text style={styles.infoRow}>📞 {p.alternative_phone}</Text>}
          {p?.address && <Text style={styles.infoRow}>📍 {p.address}</Text>}
        </View>

        <View style={styles.actionsCard}>
          <Text style={styles.infoTitle}>⚡ Acciones rápidas</Text>
          {p?.phone && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(`https://wa.me/52${p.phone.replace(/\D/g, '')}`)}>
              <Text style={styles.actionBtnText}>💬 Contactar por WhatsApp</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#3B82F6' }]} onPress={() => router.push(`/admin/reset-password?businessName=${encodeURIComponent(p?.business_name || '')}`)}>
            <Text style={styles.actionBtnText}>🔑 Enviar reset de password</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  back: { color: '#94A3B8', fontSize: 15, width: 60 },
  title: { fontSize: 18, fontWeight: '700', color: '#F8FAFC' },
  scroll: { padding: 20, paddingBottom: 100 },
  heroCard: { backgroundColor: '#1E293B', borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#F59E0B', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { fontSize: 32, fontWeight: '800', color: '#0F172A' },
  businessName: { fontSize: 22, fontWeight: '800', color: '#F8FAFC' },
  businessType: { fontSize: 14, color: '#F59E0B', marginTop: 4 },
  since: { fontSize: 12, color: '#64748B', marginTop: 6 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: '#1E293B', borderRadius: 14, padding: 14, alignItems: 'center' },
  statValue: { fontSize: 28, fontWeight: '800', color: '#F8FAFC' },
  statLabel: { fontSize: 11, color: '#64748B', marginTop: 4 },
  infoCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 16, gap: 8 },
  infoTitle: { fontSize: 15, fontWeight: '700', color: '#94A3B8', marginBottom: 4 },
  infoRow: { fontSize: 14, color: '#F8FAFC' },
  actionsCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, gap: 10 },
  actionBtn: { backgroundColor: '#10B981', borderRadius: 12, padding: 14, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
