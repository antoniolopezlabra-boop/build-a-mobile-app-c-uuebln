import { getMonthStartString, getDateStringDaysFromNow } from '@/utils/dateUtils';
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

export default function StatsCitasScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [totalMonth, setTotalMonth] = useState(0);
  const [totalAll, setTotalAll] = useState(0);
  const [dailyData, setDailyData] = useState<{label: string, value: number}[]>([]);
  const [monthlyData, setMonthlyData] = useState<{label: string, value: number}[]>([]);

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    try {
      // Primer día del mes actual en timezone local
      const monthStartStr = getMonthStartString();
      // Hace 60 días en timezone local (cubre 6 meses gráfica + buffer)
      const sixtyDaysAgoStr = getDateStringDaysFromNow(-60);

      const [{ count: total }, { count: month }, { data: apts }] = await Promise.all([
        supabase.from('appointments').select('*', { count: 'exact', head: true }),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).gte('date', monthStartStr),
        supabase.from('appointments').select('date').gte('date', sixtyDaysAgoStr).order('date'),
      ]);

      setTotalAll(total || 0);
      setTotalMonth(month || 0);

      // Últimos 14 días
      const days: Record<string, number> = {};
      for (let i = 13; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        days[`${d.getDate()}/${d.getMonth()+1}`] = 0;
      }
      apts?.forEach((a: any) => {
        const d = new Date(a.date + 'T12:00:00');
        const key = `${d.getDate()}/${d.getMonth()+1}`;
        if (days[key] !== undefined) days[key]++;
      });
      setDailyData(Object.entries(days).map(([label, value]) => ({ label, value })));

      // Últimos 6 meses
      const months: Record<string, number> = {};
      const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        months[monthNames[d.getMonth()]] = 0;
      }
      apts?.forEach((a: any) => {
        const d = new Date(a.date + 'T12:00:00');
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
        <Text style={styles.title}>📅 Citas este mes</Text>
        <View style={{width: 60}} />
      </View>
      {loading ? <ActivityIndicator size="large" color="#6366F1" style={{flex:1}} /> : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.heroRow}>
            <View style={[styles.heroCard, {borderLeftColor: '#6366F1'}]}>
              <Text style={styles.heroValue}>{totalMonth}</Text>
              <Text style={styles.heroLabel}>Este mes</Text>
            </View>
            <View style={[styles.heroCard, {borderLeftColor: '#94A3B8'}]}>
              <Text style={styles.heroValue}>{totalAll}</Text>
              <Text style={styles.heroLabel}>Total histórico</Text>
            </View>
          </View>
          <Text style={styles.sectionTitle}>📈 Últimos 14 días</Text>
          <View style={styles.chartCard}>
            <BarChart data={dailyData} color="#6366F1" />
          </View>
          <Text style={styles.sectionTitle}>📅 Últimos 6 meses</Text>
          <View style={styles.chartCard}>
            <BarChart data={monthlyData} color="#818CF8" />
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
  heroRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  heroCard: { flex: 1, backgroundColor: '#1E293B', borderRadius: 16, padding: 20, borderLeftWidth: 3 },
  heroValue: { fontSize: 48, fontWeight: '800', color: '#F8FAFC' },
  heroLabel: { fontSize: 13, color: '#64748B', marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#94A3B8', marginBottom: 12 },
  chartCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 24, alignItems: 'center' },
});
