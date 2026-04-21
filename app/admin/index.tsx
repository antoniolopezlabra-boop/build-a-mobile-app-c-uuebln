import { getMonthStartString, getDateStringDaysFromNow } from '@/utils/dateUtils';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Dimensions, RefreshControl, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAdmin } from '@/contexts/AdminContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import Svg, { Path, Defs, LinearGradient, Stop, Text as SvgText, Line, Circle } from 'react-native-svg';

const W = Dimensions.get('window').width;
const CHART_W = W - 64;
const CHART_H = 110;

const C = {
  bg:      '#03080F',
  surface: '#070F1C',
  border:  '#0F2040',
  gold:    '#F59E0B',
  green:   '#10B981',
  blue:    '#3B82F6',
  purple:  '#818CF8',
  text:    '#E2E8F0',
  muted:   '#334155',
  soft:    '#64748B',
};

// ── Smooth bezier line chart con área degradada ──
function LineChart({
  data, color, gradientId, height = CHART_H,
}: {
  data: { label: string; value: number }[];
  color: string;
  gradientId: string;
  height?: number;
}) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  const w = CHART_W - 8;
  const h = height;
  const pad = 16;
  const step = (w - pad * 2) / Math.max(data.length - 1, 1);

  const pts = data.map((d, i) => ({
    x: pad + i * step,
    y: h - pad - (d.value / max) * (h - pad * 2),
    v: d.value,
    label: d.label,
  }));

  let linePath = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const cx = (pts[i].x + pts[i + 1].x) / 2;
    linePath += ` C ${cx} ${pts[i].y}, ${cx} ${pts[i + 1].y}, ${pts[i + 1].x} ${pts[i + 1].y}`;
  }

  const areaPath = linePath +
    ` L ${pts[pts.length - 1].x} ${h} L ${pts[0].x} ${h} Z`;

  const activePts = pts.filter(p => p.v > 0);
  const labelPts = pts.filter((_, i) => i % 2 === 0);

  return (
    <Svg width={CHART_W} height={h + 20}>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <Stop offset="70%" stopColor={color} stopOpacity={0.05} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={areaPath} fill={`url(#${gradientId})`} />
      <Line x1={pad} y1={h} x2={w} y2={h} stroke={C.muted} strokeWidth={0.5} />
      <Path d={linePath} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {activePts.map((p, i) => (
        <React.Fragment key={i}>
          <Circle cx={p.x} cy={p.y} r={4} fill={C.bg} stroke={color} strokeWidth={1.5} />
          <SvgText x={p.x} y={p.y - 10} fontSize={8} fill={color} textAnchor="middle" fontWeight="bold">{p.v}</SvgText>
        </React.Fragment>
      ))}
      {labelPts.map((p, i) => (
        <SvgText key={i} x={p.x} y={h + 14} fontSize={7} fill={C.soft} textAnchor="middle">{p.label}</SvgText>
      ))}
    </Svg>
  );
}

// ── Punto pulsante ──
function PulseDot({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1.9, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <View style={{ width: 14, height: 14, justifyContent: 'center', alignItems: 'center' }}>
      <Animated.View style={{
        position: 'absolute', width: 10, height: 10, borderRadius: 5,
        backgroundColor: color, opacity: 0.25, transform: [{ scale: anim }],
      }} />
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

interface DashboardData {
  totalTenants: number; activeTenants: number;
  totalAppointments: number; monthAppointments: number;
  retentionRate: number; basicCount: number;
  premiumCount: number; gratuitoCount: number; mrr: number;
  dailyCitas: { label: string; value: number }[];
  weeklyNegocios: { label: string; value: number }[];
}

export default function AdminDashboard() {
  const router = useRouter();
  const { adminUser, isSuperAdmin, loading: adminLoading } = useAdmin();
  const { signOut } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => {
    if (adminUser) loadData();
  }, [adminUser]));

  const loadData = async (isPullRefresh = false) => {
    if (isPullRefresh) setRefreshing(true); else setLoading(true);
    try {
      // Primer día del mes actual en timezone local
      const monthStartStr = getMonthStartString();
      // Hace 14 días en timezone local
      const fourteenDaysAgoStr = getDateStringDaysFromNow(-14);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
      const [
        { count: totalTenants },
        { count: totalAppointments },
        { count: monthAppointments },
        { data: sessions },
        { data: dailyApts },
        { data: weeklyRegs },
        { data: plans, error: plansError },
      ] = await Promise.all([
        supabase.from('business_profiles').select('*', { count: 'exact', head: true }),
        supabase.from('appointments').select('*', { count: 'exact', head: true }),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).gte('date', monthStartStr),
        supabase.from('user_sessions').select('user_id').gte('last_seen_at', thirtyDaysAgo.toISOString()),
        supabase.from('appointments').select('date').gte('date', fourteenDaysAgoStr).order('date'),
        supabase.from('business_profiles').select('created_at').gte('created_at', new Date(Date.now() - 56 * 86400000).toISOString()).order('created_at'),
        supabase.rpc('get_all_subscription_plans'),
      ]);
      if (plansError) console.error('[Admin] Plans RPC error:', plansError);
      const basicCount    = plans?.filter((p: any) => ['basico','básico'].includes((p.plan_type||'').toLowerCase().trim())).length || 0;
      const premiumCount  = plans?.filter((p: any) => (p.plan_type||'').toLowerCase().trim() === 'premium').length || 0;
      const gratuitoCount = plans?.filter((p: any) => (p.plan_type||'').toLowerCase().trim() === 'gratuito').length || 0;
      // MRR actualizado Abr 2026: Basico=$399 (Premium visible), Premium=$799 (Luxury visible)
      const mrr = basicCount * 399 + premiumCount * 799;
      const activeTenants = sessions?.length || 0;
      const retentionRate = totalTenants ? Math.round((activeTenants / (totalTenants||1)) * 100) : 0;

      const days: Record<string, number> = {};
      for (let i = 13; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        days[`${d.getDate()}/${d.getMonth()+1}`] = 0;
      }
      dailyApts?.forEach((a: any) => {
        const d = new Date(a.date + 'T12:00:00');
        const key = `${d.getDate()}/${d.getMonth()+1}`;
        if (days[key] !== undefined) days[key]++;
      });

      const weeks: Record<string, number> = {};
      for (let i = 7; i >= 0; i--) weeks[`S${8-i}`] = 0;
      weeklyRegs?.forEach((p: any) => {
        const weeksAgo = Math.floor((Date.now() - new Date(p.created_at).getTime()) / (7*86400000));
        const key = `S${8-weeksAgo}`;
        if (weeks[key] !== undefined) weeks[key]++;
      });

      setData({
        totalTenants: totalTenants||0, activeTenants,
        monthAppointments: monthAppointments||0, totalAppointments: totalAppointments||0,
        retentionRate, basicCount, premiumCount, gratuitoCount, mrr,
        dailyCitas: Object.entries(days).map(([label, value]) => ({ label, value })),
        weeklyNegocios: Object.entries(weeks).map(([label, value]) => ({ label, value })),
      });
    } catch (e) { console.error('[Admin]', e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  if (adminLoading || loading) {
    return (
      <View style={s.container}>
        <ActivityIndicator size="large" color={C.gold} style={{ flex: 1 }} />
      </View>
    );
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <View style={s.container}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={async () => { await signOut(); router.replace('/auth/onboarding'); }} style={s.exitBtn}>
            <Text style={s.exitText}>EXIT</Text>
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>VYLTA</Text>
            <Text style={s.headerSub}>CONTROL CENTER</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerTime}>{timeStr}</Text>
            <View style={[s.roleBadge, { borderColor: isSuperAdmin ? C.gold : C.blue }]}>
              <Text style={[s.roleText, { color: isSuperAdmin ? C.gold : C.blue }]}>
                {isSuperAdmin ? 'SUPER' : 'ADMIN'}
              </Text>
            </View>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)}
              tintColor={C.gold} colors={[C.gold]} progressBackgroundColor={C.surface} />
          }
        >
          {/* MRR HERO */}
          <View style={s.mrrHero}>
            <View style={s.mrrTopRow}>
              <View style={s.mrrBadge}>
                <PulseDot color={C.gold} />
                <Text style={s.mrrBadgeText}>MRR EN VIVO</Text>
              </View>
              <Text style={s.mrrDate}>{dateStr}</Text>
            </View>
            <Text style={s.mrrAmount}>${(data?.mrr||0).toLocaleString('es-MX')}</Text>
            <Text style={s.mrrCurrency}>MXN / mes</Text>
            <View style={s.mrrSubRow}>
              <View style={s.mrrSubItem}>
                <Text style={[s.mrrSubVal, { color: C.green }]}>{data?.basicCount}</Text>
                <Text style={s.mrrSubLabel}>PREMIUM</Text>
              </View>
              <View style={s.mrrDivider} />
              <View style={s.mrrSubItem}>
                <Text style={[s.mrrSubVal, { color: C.purple }]}>{data?.premiumCount}</Text>
                <Text style={s.mrrSubLabel}>LUXURY</Text>
              </View>
              <View style={s.mrrDivider} />
              <View style={s.mrrSubItem}>
                <Text style={[s.mrrSubVal, { color: C.soft }]}>{data?.gratuitoCount}</Text>
                <Text style={s.mrrSubLabel}>BÁSICO</Text>
              </View>
            </View>
          </View>

          {/* KPI GRID */}
          <Text style={s.sectionLabel}>INDICADORES</Text>
          <View style={s.kpiGrid}>
            <TouchableOpacity style={[s.kpiCard, { borderTopColor: C.green }]} onPress={() => router.push('/admin/tenants')} activeOpacity={0.75}>
              <Text style={[s.kpiNum, { color: C.green }]}>{data?.totalTenants}</Text>
              <Text style={s.kpiLabel}>Negocios</Text>
              <Text style={s.kpiHint}>Ver lista →</Text>
            </TouchableOpacity>
            <View style={[s.kpiCard, { borderTopColor: C.blue }]}>
              <View style={s.kpiActiveRow}>
                <Text style={[s.kpiNum, { color: C.blue }]}>{data?.activeTenants}</Text>
                <PulseDot color={C.blue} />
              </View>
              <Text style={s.kpiLabel}>Activos 30d</Text>
              <Text style={s.kpiHint}>Con sesión</Text>
            </View>
            <View style={[s.kpiCard, { borderTopColor: C.gold }]}>
              <Text style={[s.kpiNum, { color: C.gold }]}>{data?.retentionRate}%</Text>
              <Text style={s.kpiLabel}>Retención</Text>
              <Text style={s.kpiHint}>Activos / Total</Text>
            </View>
            <View style={[s.kpiCard, { borderTopColor: C.purple }]}>
              <Text style={[s.kpiNum, { color: C.purple }]}>{data?.monthAppointments}</Text>
              <Text style={s.kpiLabel}>Citas mes</Text>
              <Text style={s.kpiHint}>Histórico: {data?.totalAppointments}</Text>
            </View>
          </View>

          {/* LINE CHART — Citas (púrpura) */}
          <View style={s.chartHeader}>
            <View style={s.chartTitleRow}>
              <View style={[s.chartAccent, { backgroundColor: C.purple }]} />
              <Text style={s.sectionLabel}>ACTIVIDAD — 14 días</Text>
            </View>
            <Text style={s.chartSubtitle}>{data?.totalAppointments} citas totales</Text>
          </View>
          <View style={s.chartCard}>
            <LineChart data={data?.dailyCitas||[]} color={C.purple} gradientId="citasGrad" />
          </View>

          {/* LINE CHART — Negocios (verde) */}
          <View style={s.chartHeader}>
            <View style={s.chartTitleRow}>
              <View style={[s.chartAccent, { backgroundColor: C.green }]} />
              <Text style={s.sectionLabel}>NUEVOS NEGOCIOS — 8 semanas</Text>
            </View>
            <Text style={s.chartSubtitle}>{data?.totalTenants} total</Text>
          </View>
          <View style={s.chartCard}>
            <LineChart data={data?.weeklyNegocios||[]} color={C.green} gradientId="negociosGrad" />
          </View>

          {/* ACCIONES */}
          {isSuperAdmin && (
            <>
              <Text style={s.sectionLabel}>ACCIONES</Text>
              <View style={s.actionsRow}>
                <TouchableOpacity style={s.actionCard} onPress={() => router.push('/admin/tenants')} activeOpacity={0.75}>
                  <Text style={s.actionIcon}>🏢</Text>
                  <Text style={s.actionLabel}>Negocios</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.actionCard} onPress={() => router.push('/admin/promo-codes')} activeOpacity={0.75}>
                  <Text style={s.actionIcon}>🎟️</Text>
                  <Text style={s.actionLabel}>Promos</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.actionCard} onPress={() => router.push('/admin/admins')} activeOpacity={0.75}>
                  <Text style={s.actionIcon}>🛡️</Text>
                  <Text style={s.actionLabel}>Admins</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <Text style={s.footer}>VYLTA · {adminUser?.name} · {isSuperAdmin ? 'SuperAdmin' : 'Admin'}</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: C.bg },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                   paddingHorizontal: 20, paddingVertical: 14,
                   borderBottomWidth: 1, borderBottomColor: C.border },
  exitBtn:       { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: C.muted },
  exitText:      { fontSize: 11, fontWeight: '800', color: C.soft, letterSpacing: 1.5 },
  headerCenter:  { alignItems: 'center' },
  headerTitle:   { fontSize: 17, fontWeight: '900', color: C.gold, letterSpacing: 3 },
  headerSub:     { fontSize: 8, color: C.muted, letterSpacing: 2, marginTop: 1 },
  headerRight:   { alignItems: 'flex-end', gap: 4 },
  headerTime:    { fontSize: 13, fontWeight: '700', color: C.text },
  roleBadge:     { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  roleText:      { fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  scroll:        { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 100 },
  mrrHero:       { backgroundColor: C.surface, borderRadius: 22, padding: 24, marginBottom: 24,
                   borderWidth: 1, borderColor: C.gold + '33' },
  mrrTopRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  mrrBadge:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mrrBadgeText:  { fontSize: 10, fontWeight: '800', color: C.gold, letterSpacing: 2 },
  mrrDate:       { fontSize: 10, color: C.muted },
  mrrAmount:     { fontSize: 52, fontWeight: '900', color: C.gold, letterSpacing: -2, lineHeight: 56 },
  mrrCurrency:   { fontSize: 13, color: C.soft, fontWeight: '600', marginTop: 2, marginBottom: 20 },
  mrrSubRow:     { flexDirection: 'row', alignItems: 'center', paddingTop: 16, borderTopWidth: 1, borderTopColor: C.border },
  mrrSubItem:    { flex: 1, alignItems: 'center' },
  mrrSubVal:     { fontSize: 26, fontWeight: '900', letterSpacing: -1 },
  mrrSubLabel:   { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginTop: 2 },
  mrrDivider:    { width: 1, height: 36, backgroundColor: C.border },
  sectionLabel:  { fontSize: 10, fontWeight: '800', color: C.muted, letterSpacing: 2, marginBottom: 12 },
  kpiGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  kpiCard:       { width: '47%', backgroundColor: C.surface, borderRadius: 16, padding: 16,
                   borderTopWidth: 2, borderWidth: 1, borderColor: C.border },
  kpiActiveRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kpiNum:        { fontSize: 34, fontWeight: '900', letterSpacing: -1, lineHeight: 38 },
  kpiLabel:      { fontSize: 12, color: C.soft, marginTop: 6, fontWeight: '500' },
  kpiHint:       { fontSize: 10, color: C.muted, marginTop: 4 },
  chartHeader:   { marginBottom: 10 },
  chartTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chartAccent:   { width: 3, height: 12, borderRadius: 2 },
  chartSubtitle: { fontSize: 10, color: C.muted, marginTop: 3, marginLeft: 11 },
  chartCard:     { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 24,
                   alignItems: 'center', borderWidth: 1, borderColor: C.border },
  actionsRow:    { flexDirection: 'row', gap: 10, marginBottom: 24 },
  actionCard:    { flex: 1, backgroundColor: C.surface, borderRadius: 16, padding: 18,
                   alignItems: 'center', gap: 8, borderWidth: 1, borderColor: C.border },
  actionIcon:    { fontSize: 26 },
  actionLabel:   { fontSize: 11, fontWeight: '700', color: C.text, letterSpacing: 0.5 },
  footer:        { textAlign: 'center', fontSize: 10, color: C.muted, letterSpacing: 1, marginTop: 8 },
});
