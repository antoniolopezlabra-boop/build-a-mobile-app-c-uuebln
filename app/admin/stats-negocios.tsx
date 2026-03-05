import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import Svg, { Rect, Text as SvgText, Line } from 'react-native-svg';

const SCREEN_W = Dimensions.get('window').width - 64;

function BarChart({ data, color, height = 140 }: { data: { label: string; value: number }[], color: string, height?: number }) {
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
            <SvgText x={x + barW/2} y={height+16} fontSize={9} fill="#64748B" textAnchor="middle">{d.label}</SvgText>
            {d.value > 0 && <SvgText x={x + barW/2} y={y-4} fontSize={9} fill={color} textAnchor="middle">{d.value}</SvgText>}
          </React.Fragment>
        );
      })}
      <Line x1={0} y1={height} x2={SCREEN_W} y2={height} stroke="#1E293B" strokeWidth={1} />
    </Svg>
  );
}

export default function StatsNegociosScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [weeklyData, setWeeklyData] = useState<{label: string, value: number}[]>([]);
  const [monthlyData, setMonthlyData] = useState<{label: string, value: number}[]>([]);

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    try {
      const { count } = await supabase.from('business_profiles').select('*', { count: 'exact', head: true });
      setTotal(count || 0);

      const { data: profiles } = await supabase
        .from('business_profiles')
        .select('created_at')
        .order('created_at');

      // Últimas 8 semanas
      const weeks: Record<string, number> = {};
      for (let i = 7; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i * 7);
        weeks[`S${8-i}`] = 0;
      }
      profiles?.forEach((p: any) => {
        const weeksAgo = Math.floor((Date.now() - new Date(p.created_at).getTime()) / (7 * 86400000));
        const key = `S${8 - weeksAgo}`;
        if (weeks[key] !== undefined) weeks[key]++;
      });
      setWeeklyData(Object.entries(weeks).map(([label, value]) => ({ label, value })));

      // Últimos 6 meses
      const months: Record<string, number> = {};
      const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        months[monthNames[d.getMonth()]] = 0;
      }
      profiles?.forEach((p: any) => {
        const d = new Date(p.created_at);
        const key = monthNames[d.getMonth()];
        if (months[key] !== undefined) months[key]++;
      });
      setMonthlyData(Object.entries(months).map(([label, value]) => ({ label, value })));
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🏢 Negocios registrados</Text>
        <View style={{width: 60}} />
      </View>
      {loading ? <ActivityIndicator size="large" color="#10B981" style={{flex:1}} /> : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.heroCard}>
            <Text style={styles.heroValue}>{total}</Text>
            <Text style={styles.heroLabel}>Negocios registrados en total</Text>
          </View>
          <Text style={styles.sectionTitle}>📈 Últimas 8 semanas</Text>
          <View style={styles.chartCard}>
            <BarChart data={weeklyData} color="#10B981" />
          </View>
          <Text style={styles.sectionTitle}>📅 Últimos 6 meses</Text>
          <View style={styles.chartCard}>
            <BarChart data={monthlyData} color="#34D399" />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  back: { color: '#94A3B8', fontSize: 15, width: 60 },
  title: { fontSize: 16, fontWeight: '700', color: '#F8FAFC' },
  scroll: { padding: 20, paddingBottom: 100 },
  heroCard: { backgroundColor: '#1E293B', borderRadius: 20, padding: 32, alignItems: 'center', marginBottom: 24 },
  heroValue: { fontSize: 72, fontWeight: '800', color: '#10B981' },
  heroLabel: { fontSize: 14, color: '#64748B', marginTop: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#94A3B8', marginBottom: 12 },
  chartCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 24, alignItems: 'center' },
});
