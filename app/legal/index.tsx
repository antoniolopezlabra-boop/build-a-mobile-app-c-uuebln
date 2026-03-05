import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

export default function LegalScreen() {
  const router = useRouter();

  const items = [
    { icon: '🔒', title: 'Aviso de Privacidad', subtitle: 'Cómo recopilamos y usamos tus datos', route: '/legal/privacy' },
    { icon: '📋', title: 'Términos y Condiciones', subtitle: 'Reglas de uso del servicio VYLTA', route: '/legal/terms' },
    { icon: '💳', title: 'Política de Cancelación', subtitle: 'Cómo cancelar tu suscripción', route: '/legal/cancellation' },
    { icon: '🍪', title: 'Política de Datos', subtitle: 'Almacenamiento y protección de datos', route: '/legal/data' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Legal</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>Documentos legales de VYLTA. Última actualización: marzo 2026.</Text>
        {items.map((item, i) => (
          <TouchableOpacity key={i} style={styles.card} onPress={() => router.push(item.route as any)}>
            <Text style={styles.cardIcon}>{item.icon}</Text>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.footer}>VYLTA es un producto de Antonio López Labra. Para dudas legales escríbenos a legal@vylta.com</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#fff' },
  back: { color: '#10B981', fontSize: 15, width: 60 },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  scroll: { padding: 20, paddingBottom: 60 },
  intro: { fontSize: 13, color: '#64748B', marginBottom: 20, lineHeight: 20 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  cardIcon: { fontSize: 28 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  cardSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  arrow: { fontSize: 22, color: '#CBD5E1' },
  footer: { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 24, lineHeight: 18 },
});
