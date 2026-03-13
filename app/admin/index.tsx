import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAdmin } from '@/contexts/AdminContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import Svg, { Rect, Text as SvgText, Line } from 'react-native-svg';

const SCREEN_W = Dimensions.get('window').width - 72;

function BarChart({ data, color, height = 110 }: { data: { label: string; value: number }[], color: string, height?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  const barW = Math.max(Math.floor((SCREEN_W - 20) / data.length) - 4, 4);
  return (
    <Svg width={SCREEN_W} height={height + 28}>
      {data.map((d, i) => {
        const barH = Math.max((d.value / max) * height, 2);
        const x = i * (barW + 4) + 2;
        const y = height - barH;
        return (
          <React.Fragment key={i}>
            <Rect x={x} y={y} width={barW} height={barH} fill={color} rx={3} opacity={0.85} />
            <SvgText x={x + barW / 2} y={height + 16} fontSize={8} fill="#64748B" textAnchor="middle">{d.label}</SvgText>
            {d.value > 0 && <SvgText x={x + barW / 2} y={y - 4} fontSize={8} fill={color} textAnchor="middle">{d.value}</SvgText>}
          </React.Fragment>
        );
      })}
      <Line x1={0} y1={height} x2={SCREEN_W} y2={height} stroke="#334155" strokeWidth={1} />
    </Svg>
  );
}

interface DashboardData {
  totalTenants: number;
  activeTenants: number;
  totalAppointments: number;
  monthAppointments: number;
  retentionRate: number;
  basicCount: number;
  premiumCount: number;
  gratuitoCount: number;
  mrr: number;
  dailyCitas: { label: string; value: number }[];
  weeklyNegocios: { label: string; value: number }[];
}

export default function AdminDashboard() {
  const router = useRouter();
  const { adminUser, isSuperAdmin, loading: adminLoading } = useAdmin();
  const { signOut } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    if (adminUser) loadData();
  }, [adminUser]));

  const loadData = async () => {
    setLoading(true);
    try {
      const monthStart = new Date(); monthStart.setDate(1);
      const monthStartStr = monthStart.toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

      const [
        { count: totalTenants },
        { count: totalAppointments },
        { count: monthAppointments },
        { data: sessions },
        { data: dailyApts },
        { data: weeklyRegs },
        { data: plans },
      ] = await Promise.all([
        supabase.from('business_profiles').select('*', { count: 'exact', head: true }),
        supabase.from('appointments').select('*', { count: 'exact', head: true }),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).gte('date', monthStartStr),
        supabase.from('user_sessions').select('user_id').gte('last_seen_at', thirtyDaysAgo.toISOString()),
        supabase.from('appointments')
          .select('date')
          .gte('date', new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0])
          .order('date'),
        supabase.from('business_profiles')
          .select('created_at')
          .gte('created_at', new Date(Date.now() - 56 * 86400000).toISOString())
          .order('created_at'),
        // Sin filtro de status — contar todos los planes sin importar cómo fueron asignados
        supabase.from('subscription_plans').select('plan_type, status'),
      ]);

      console.log('[Admin] Plans raw:', plans);

      // Contar planes reales desde BD — tolerante a acento y mayúsculas
      const basicCount = plans?.filter((p: any) => {
        const t = (p.plan_type || '').toLowerCase().trim();
        return t === 'basico' || t === 'básico';
      }).length || 0;
      const premiumCount = plans?.filter((p: any) =>
        (p.plan_type || '').toLowerCase().trim() === 'premium'
      ).length || 0;
      const gratuitoCount = plans?.filter((p: any) =>
        (p.plan_type || '').toLowerCase().trim() === 'gratuito'
      ).length || 0;
      const mrr = basicCount * 990 + premiumCount * 1490;

      console.log('[Admin] Counts — basic:', basicCount, 'premium:', premiumCount, 'gratuito:', gratuitoCount);

      const activeTenants = sessions?.length || 0;
      const retentionRate = totalTenants ? Math.round((activeTenants / (totalTenants || 1)) * 100) : 0;

      // Agrupar citas por día (14 días)
      const days: Record<string, number> = {};
      for (let i = 13; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        days[`${d.getDate()}/${d.getMonth() + 1}`] = 0;
      }
      dailyApts?.forEach((a: any) => {
        const d = new Date(a.date + 'T12:00:00');
        const key = `${d.getDate()}/${d.getMonth() + 1}`;
        if (days[key] !== undefined) days[key]++;
      });

      // Agrupar negocios por semana (8 semanas)
      const weeks: Record<string, number> = {};
      for (let i = 7; i >= 0; i--) weeks[`S${8 - i}`] = 0;
      weeklyRegs?.forEach((p: any) => {
        const weeksAgo = Math.floor((Date.now() - new Date(p.created_at).getTime()) / (7 * 86400000));
        const key = `S${8 - weeksAgo}`;
        if (weeks[key] !== undefined) weeks[key]++;
      });

      setData({
        totalTenants: totalTenants || 0,
        activeTenants,
        monthAppointments: monthAppointments || 0,
        totalAppointments: totalAppointments || 0,
        retentionRate,
        basicCount,
        premiumCount,
        gratuitoCount,
        mrr,
        dailyCitas: Object.entries(days).map(([label, value]) => ({ label, value })),
        weeklyNegocios: Object.entries(weeks).map(([label, value]) => ({ label, value })),
      });
    } catch (error) {
      console.error('[Admin] Failed to load:', error);
    } finally {
      setLoading(false);
    }
  };

  if (adminLoading || loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#F59E0B" style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={async () => { await signOut(); router.replace('/auth/onboarding'); }}>
          <Text style={styles.backBtn}>⏻ Salir</Text>
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.title}>VYLTA Admin</Text>
          <Text style={styles.subtitle}>{adminUser?.name} · {isSuperAdmin ? 'SuperAdmin' : 'Admin'}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{isSuperAdmin ? '⚡' : '👁'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <Text style={styles.sectionTitle}>📊 Resumen Global</Text>
        <View style={styles.kpiGrid}>
          <TouchableOpacity style={[styles.kpiCard, { borderLeftColor: '#10B981' }]} onPress={() => router.push('/admin/tenants')}>
            <Text style={styles.kpiValue}>{data?.totalTenants}</Text>
            <Text style={styles.kpiLabel}>Negocios totales</Text>
            <Text style={styles.kpiHint}>Ver lista →</Text>
          </TouchableOpacity>
          <View style={[styles.kpiCard, { borderLeftColor: '#3B82F6' }]}>
            <Text style={styles.kpiValue}>{data?.activeTenants}</Text>
            <Text style={styles.kpiLabel}>Activos (30 días)</Text>
            <Text style={styles.kpiHint}>Con sesión reciente</Text>
          </View>
          <View style={[styles.kpiCard, { borderLeftColor: '#F59E0B' }]}>
            <Text style={styles.kpiValue}>{data?.retentionRate}%</Text>
            <Text style={styles.kpiLabel}>Retención</Text>
            <Text style={styles.kpiHint}>Activos / Total</Text>
          </View>
          <View style={[styles.kpiCard, { borderLeftColor: '#6366F1' }]}>
            <Text style={styles.kpiValue}>{data?.monthAppointments}</Text>
            <Text style={styles.kpiLabel}>Citas este mes</Text>
            <Text style={styles.kpiHint}>Total histórico: {data?.totalAppointments}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>💳 Suscripciones</Text>
        <View style={styles.mrrCard}>
          <Text style={styles.mrrLabel}>MRR estimado</Text>
          <Text style={styles.mrrValue}>${(data?.mrr || 0).toLocaleString('es-MX')} MXN</Text>
          <Text style={styles.mrrSub}>Ingresos mensuales recurrentes</Text>
        </View>
        <View style={styles.plansRow}>
          <View style={[styles.planCard, { backgroundColor: '#0F2E1F', borderColor: '#10B981' }]}>
            <Text style={styles.planValue}>{data?.basicCount}</Text>
            <Text style={styles.planLabel}>Básico</Text>
            <Text style={styles.planPrice}>$990/mes</Text>
          </View>
          <View style={[styles.planCard, { backgroundColor: '#1A1040', borderColor: '#6366F1' }]}>
            <Text style={styles.planValue}>{data?.premiumCount}</Text>
            <Text style={styles.planLabel}>Premium</Text>
            <Text style={styles.planPrice}>$1,490/mes</Text>
          </View>
          <View style={[styles.planCard, { backgroundColor: '#1E293B', borderColor: '#334155' }]}>
            <Text style={styles.planValue}>{data?.gratuitoCount}</Text>
            <Text style={styles.planLabel}>Gratuito</Text>
            <Text style={styles.planPrice}>$0/mes</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>📅 Citas — últimos 14 días</Text>
        <View style={styles.chartCard}>
          <BarChart data={data?.dailyCitas || []} color="#6366F1" />
        </View>

        <Text style={styles.sectionTitle}>🏢 Nuevos negocios — últimas 8 semanas</Text>
        <View style={styles.chartCard}>
          <BarChart data={data?.weeklyNegocios || []} color="#10B981" />
        </View>

        {isSuperAdmin && (
          <>
            <Text style={styles.sectionTitle}>⚡ Acciones</Text>
            <View style={styles.actionsGrid}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/admin/tenants')}>
                <Text style={styles.actionIcon}>🏢</Text>
                <Text style={styles.actionLabel}>Negocios y usuarios</Text>
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
  backBtn: { color: '#94A3B8', fontSize: 14 },
  title: { fontSize: 18, fontWeight: '800', color: '#F59E0B' },
  subtitle: { fontSize: 11, color: '#475569', marginTop: 2 },
  badge: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center' },
  badgeText: { fontSize: 18 },
  scroll: { padding: 20, paddingBottom: 120 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#64748B', marginBottom: 10, marginTop: 8, letterSpacing: 0.5 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  kpiCard: { width: '47%', backgroundColor: '#1E293B', borderRadius: 14, padding: 16, borderLeftWidth: 3 },
  kpiValue: { fontSize: 30, fontWeight: '800', color: '#F8FAFC' },
  kpiLabel: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  kpiHint: { fontSize: 10, color: '#475569', marginTop: 6 },
  mrrCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 20, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: '#F59E0B33' },
  mrrLabel: { fontSize: 12, color: '#64748B', marginBottom: 4 },
  mrrValue: { fontSize: 36, fontWeight: '800', color: '#F59E0B' },
  mrrSub: { fontSize: 11, color: '#475569', marginTop: 4 },
  plansRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  planCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1 },
  planValue: { fontSize: 32, fontWeight: '800', color: '#F8FAFC' },
  planLabel: { fontSize: 12, fontWeight: '600', color: '#94A3B8', marginTop: 4 },
  planPrice: { fontSize: 10, color: '#475569', marginTop: 2 },
  chartCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 24, alignItems: 'center' },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionBtn: { flex: 1, minWidth: '30%', backgroundColor: '#1E293B', borderRadius: 14, padding: 18, alignItems: 'center', gap: 8 },
  actionIcon: { fontSize: 26 },
  actionLabel: { fontSize: 12, fontWeight: '600', color: '#F8FAFC', textAlign: 'center' },
});
