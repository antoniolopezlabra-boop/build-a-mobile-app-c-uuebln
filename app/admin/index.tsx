import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAdmin } from '@/contexts/AdminContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import Svg, { Rect, Text as SvgText, Line } from 'react-native-svg';

const SCREEN_W = Dimensions.get('window').width - 64;

interface DashboardData {
  totalTenants: number;
  activeTenants: number;
  totalAppointments: number;
  monthAppointments: number;
  retentionRate: number;
  dailyCitas: { day: string; count: number }[];
  weeklyNegocios: { week: string; count: number }[];
}

function BarChart({ data, color, height = 120 }: { data: { label: string; value: number }[], color: string, height?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  const barW = Math.floor((SCREEN_W - 20) / data.length) - 4;

  return (
    <Svg width={SCREEN_W} height={height + 30}>
      {data.map((d, i) => {
        const barH = Math.max((d.value / max) * height, 2);
        const x = i * (barW + 4) + 2;
        const y = height - barH;
        return (
          <React.Fragment key={i}>
            <Rect x={x} y={y} width={barW} height={barH} fill={color} rx={3} opacity={0.9} />
            <SvgText x={x + barW / 2} y={height + 16} fontSize={9} fill="#64748B" textAnchor="middle">{d.label}</SvgText>
            {d.value > 0 && <SvgText x={x + barW / 2} y={y - 4} fontSize={9} fill={color} textAnchor="middle">{d.value}</SvgText>}
          </React.Fragment>
        );
      })}
      <Line x1={0} y1={height} x2={SCREEN_W} y2={height} stroke="#1E293B" strokeWidth={1} />
    </Svg>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const { adminUser, isSuperAdmin, loading: adminLoading } = useAdmin();
  const { signOut } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!adminLoading && !adminUser) router.replace('/(tabs)/(home)');
  }, [adminUser, adminLoading]);

  useFocusEffect(useCallback(() => {
    if (adminUser) loadData();
  }, [adminUser]));

  const loadData = async () => {
    try {
      const monthStart = new Date(); monthStart.setDate(1);
      const monthStartStr = monthStart.toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [
        { count: totalTenants },
        { count: totalAppointments },
        { count: monthAppointments },
        { data: sessions },
        { data: dailyApts },
        { data: weeklyRegs },
      ] = await Promise.all([
        supabase.from('business_profiles').select('*', { count: 'exact', head: true }),
        supabase.from('appointments').select('*', { count: 'exact', head: true }),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).gte('date', monthStartStr),
        supabase.from('user_sessions').select('user_id').gte('last_seen_at', thirtyDaysAgo.toISOString()),
        supabase.from('appointments').select('date').gte('date', new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]).order('date'),
        supabase.from('business_profiles').select('created_at').gte('created_at', new Date(Date.now() - 60 * 86400000).toISOString()).order('created_at'),
      ]);

      const activeTenants = sessions?.length || 0;
      const retentionRate = totalTenants ? Math.round((activeTenants / totalTenants) * 100) : 0;

      // Agrupar citas por día (últimos 14 días)
      const days: Record<string, number> = {};
      for (let i = 13; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const key = `${d.getDate()}/${d.getMonth() + 1}`;
        days[key] = 0;
      }
      dailyApts?.forEach((a: any) => {
        const d = new Date(a.date + 'T12:00:00');
        const key = `${d.getDate()}/${d.getMonth() + 1}`;
        if (days[key] !== undefined) days[key]++;
      });
      const dailyCitas = Object.entries(days).map(([day, count]) => ({ day, count }));

      // Agrupar negocios por semana (últimas 8 semanas)
      const weeks: Record<string, number> = {};
      for (let i = 7; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i * 7);
        const key = `S${8 - i}`;
        weeks[key] = 0;
      }
      weeklyRegs?.forEach((p: any) => {
        const d = new Date(p.created_at);
        const weeksAgo = Math.floor((Date.now() - d.getTime()) / (7 * 86400000));
        const key = `S${8 - weeksAgo}`;
        if (weeks[key] !== undefined) weeks[key]++;
      });
      const weeklyNegocios = Object.entries(weeks).map(([week, count]) => ({ week, count }));

      setData({
        totalTenants: totalTenants || 0,
        activeTenants,
        monthAppointments: monthAppointments || 0,
        totalAppointments: totalAppointments || 0,
        retentionRate,
        dailyCitas,
        weeklyNegocios,
      });
    } catch (error) {
      console.error('[Admin] Failed to load:', error);
    } finally {
      setLoading(false);
    }
  };

  if (adminLoading || loading) {
    return <SafeAreaView style={styles.container}><ActivityIndicator size="large" color="#F59E0B" style={{ flex: 1 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={async () => { await signOut(); router.replace('/auth/onboarding'); }}>
          <Text style={styles.backBtn}>⏻ Salir</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>VYLTA Admin</Text>
          <Text style={styles.subtitle}>{adminUser?.name} · {isSuperAdmin ? 'SuperAdmin' : 'Admin'}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{isSuperAdmin ? '⚡' : '👁'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* KPIs */}
        <Text style={styles.sectionTitle}>📊 Resumen Global</Text>
        <View style={styles.kpiGrid}>
          <TouchableOpacity style={[styles.kpiCard, { borderLeftColor: '#10B981' }]} onPress={() => router.push('/admin/stats-negocios')}>
            <Text style={styles.kpiValue}>{data?.totalTenants}</Text>
            <Text style={styles.kpiLabel}>Negocios registrados</Text>
            <Text style={styles.kpiHint}>Ver gráfica →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.kpiCard, { borderLeftColor: '#3B82F6' }]} onPress={() => router.push('/admin/tenants')}>
            <Text style={styles.kpiValue}>{data?.activeTenants}</Text>
            <Text style={styles.kpiLabel}>Negocios activos</Text>
            <Text style={styles.kpiHint}>Ver lista →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.kpiCard, { borderLeftColor: '#F59E0B' }]}>
            <Text style={styles.kpiValue}>{data?.retentionRate}%</Text>
            <Text style={styles.kpiLabel}>Tasa de retención</Text>
            <Text style={styles.kpiHint}>Activos / Total</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.kpiCard, { borderLeftColor: '#6366F1' }]} onPress={() => router.push('/admin/stats-citas')}>
            <Text style={styles.kpiValue}>{data?.monthAppointments}</Text>
            <Text style={styles.kpiLabel}>Citas este mes</Text>
            <Text style={styles.kpiHint}>Ver gráfica →</Text>
          </TouchableOpacity>
        </View>

        {/* Suscripciones */}
        <Text style={styles.sectionTitle}>💳 Suscripciones</Text>
        <View style={styles.plansRow}>
          <View style={[styles.planCard, { backgroundColor: '#ECFDF5' }]}>
            <Text style={styles.planValue}>0</Text>
            <Text style={styles.planLabel}>Plan Básico</Text>
            <Text style={styles.planPrice}>$990 MXN/mes</Text>
          </View>
          <View style={[styles.planCard, { backgroundColor: '#EEF2FF' }]}>
            <Text style={styles.planValue}>0</Text>
            <Text style={styles.planLabel}>Plan Premium</Text>
            <Text style={styles.planPrice}>$1,490 MXN/mes</Text>
          </View>
        </View>

        {/* Acciones */}
        {isSuperAdmin && (
          <>
            <Text style={styles.sectionTitle}>⚡ Acciones</Text>
            <View style={styles.actionsGrid}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/admin/tenants')}>
                <Text style={styles.actionIcon}>🏢</Text>
                <Text style={styles.actionLabel}>Ver negocios</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/admin/users')}>
                <Text style={styles.actionIcon}>👤</Text>
                <Text style={styles.actionLabel}>Gestionar usuarios</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/admin/promo-codes')}>
                <Text style={styles.actionIcon}>🎟️</Text>
                <Text style={styles.actionLabel}>Códigos promo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/admin/admins')}>
                <Text style={styles.actionIcon}>🛡️</Text>
                <Text style={styles.actionLabel}>Admins VYLTA</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  backBtn: { color: '#94A3B8', fontSize: 15 },
  title: { fontSize: 20, fontWeight: '800', color: '#F59E0B', textAlign: 'center' },
  subtitle: { fontSize: 12, color: '#64748B', textAlign: 'center' },
  badge: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center' },
  badgeText: { fontSize: 18 },
  scroll: { padding: 20, paddingBottom: 100 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#94A3B8', marginBottom: 12, marginTop: 8 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  kpiCard: { width: '47%', backgroundColor: '#1E293B', borderRadius: 14, padding: 16, borderLeftWidth: 3 },
  kpiValue: { fontSize: 32, fontWeight: '800', color: '#F8FAFC' },
  kpiLabel: { fontSize: 12, color: '#64748B', marginTop: 4 },
  kpiHint: { fontSize: 11, color: '#475569', marginTop: 6 },
  chartCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 24, alignItems: 'center' },
  plansRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  planCard: { flex: 1, borderRadius: 14, padding: 16, alignItems: 'center' },
  planValue: { fontSize: 36, fontWeight: '800', color: '#0F172A' },
  planLabel: { fontSize: 13, fontWeight: '600', color: '#0F172A', marginTop: 4 },
  planPrice: { fontSize: 11, color: '#64748B', marginTop: 2 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionBtn: { width: '47%', backgroundColor: '#1E293B', borderRadius: 14, padding: 20, alignItems: 'center', gap: 8 },
  actionIcon: { fontSize: 28 },
  actionLabel: { fontSize: 13, fontWeight: '600', color: '#F8FAFC', textAlign: 'center' },
});
