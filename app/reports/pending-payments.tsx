import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface PendingPayment {
  id: string;
  service_name: string;
  date: string;
  service_cost: number;
  client: { name: string; phone: string };
}

export default function PendingPaymentsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => { loadPending(); }, []);

  const loadPending = async () => {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, service_name, date, service_cost, client:clients(name, phone)')
        .eq('user_id', user?.id)
        .eq('status', 'Completada')
        .order('date', { ascending: false });

      if (error) throw error;
      setPayments(data || []);
      const sum = (data || []).reduce((acc, p) => acc + (p.service_cost || 0), 0);
      setTotal(sum);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>⏳ Por cobrar</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#F59E0B" style={{ flex: 1 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Total */}
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total pendiente de cobro</Text>
            <Text style={styles.totalValue}>
              ${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </Text>
            <Text style={styles.totalSub}>{payments.length} servicio{payments.length !== 1 ? 's' : ''} completado{payments.length !== 1 ? 's' : ''} sin pagar</Text>
          </View>

          {payments.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🎉</Text>
              <Text style={styles.emptyTitle}>¡Todo cobrado!</Text>
              <Text style={styles.emptySubtitle}>No tienes servicios pendientes de pago</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Detalle de adeudos</Text>
              {payments.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.card}
                  onPress={() => router.push(`/appointments/${p.id}`)}
                >
                  <View style={styles.cardLeft}>
                    <View style={styles.avatarCircle}>
                      <Text style={styles.avatarText}>
                        {(p.client?.name || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.clientName}>{p.client?.name || 'Cliente'}</Text>
                    <Text style={styles.serviceName}>Por {p.service_name}</Text>
                    <Text style={styles.serviceDate}>el {formatDate(p.date)}</Text>
                  </View>
                  <View style={styles.cardRight}>
                    <Text style={styles.amount}>
                      ${(p.service_cost || 0).toLocaleString('es-MX', { minimumFractionDigits: 0 })}
                    </Text>
                    <Text style={styles.tapHint}>Ver cita →</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#fff'
  },
  back: { color: '#F59E0B', fontSize: 15, width: 60 },
  title: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  scroll: { padding: 20, paddingBottom: 60 },
  totalCard: {
    backgroundColor: '#FFFBEB', borderRadius: 20, padding: 24,
    alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: '#FDE68A'
  },
  totalLabel: { fontSize: 13, color: '#92400E', marginBottom: 8 },
  totalValue: { fontSize: 52, fontWeight: '800', color: '#F59E0B' },
  totalSub: { fontSize: 12, color: '#92400E', marginTop: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#64748B', marginBottom: 12, letterSpacing: 1 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
    borderLeftWidth: 3, borderLeftColor: '#F59E0B'
  },
  cardLeft: { alignItems: 'center' },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center'
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#F59E0B' },
  cardInfo: { flex: 1 },
  clientName: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  serviceName: { fontSize: 13, color: '#475569', marginTop: 2 },
  serviceDate: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  amount: { fontSize: 18, fontWeight: '800', color: '#F59E0B' },
  tapHint: { fontSize: 11, color: '#CBD5E1', marginTop: 4 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#64748B' },
});
