import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

export default function CancellationScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>← Volver</Text></TouchableOpacity>
        <Text style={styles.title}>Política de Cancelación</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.updated}>Última actualización: marzo de 2026</Text>

        <Text style={styles.section}>1. CANCELACIÓN POR PARTE DEL USUARIO</Text>
        <Text style={styles.body}>El usuario puede cancelar su suscripción a VYLTA en cualquier momento desde la sección "Ajustes → Suscripción" dentro de la aplicación, o enviando un correo a soporte@vylta.com.{'\n\n'}La cancelación tendrá efecto al término del período de facturación en curso. No se realizarán reembolsos por períodos parciales utilizados.</Text>

        <Text style={styles.section}>2. PERÍODO DE GRACIA</Text>
        <Text style={styles.body}>VYLTA otorga un período de prueba gratuito de 14 días naturales a partir del registro. Durante este período, el usuario puede cancelar sin cargo alguno.</Text>

        <Text style={styles.section}>3. CANCELACIÓN POR INCUMPLIMIENTO</Text>
        <Text style={styles.body}>VYLTA se reserva el derecho de cancelar la suscripción de forma inmediata en caso de:{'\n\n'}
          • Incumplimiento de los Términos y Condiciones.{'\n'}
          • Uso fraudulento de la plataforma.{'\n'}
          • Falta de pago después de 5 días naturales de vencimiento.{'\n\n'}
          En estos casos no procederá reembolso alguno.
        </Text>

        <Text style={styles.section}>4. REEMBOLSOS</Text>
        <Text style={styles.body}>VYLTA evaluará solicitudes de reembolso únicamente en los siguientes casos:{'\n\n'}
          • Cobro duplicado por error del sistema.{'\n'}
          • Falla técnica grave que haya impedido el uso del servicio por más de 72 horas continuas.{'\n\n'}
          Las solicitudes deben presentarse dentro de los 5 días naturales siguientes al cargo en disputa a través de soporte@vylta.com.</Text>

        <Text style={styles.section}>5. PORTABILIDAD DE DATOS</Text>
        <Text style={styles.body}>Al cancelar su suscripción, el usuario puede solicitar la exportación de sus datos (clientes y citas) en formato CSV dentro de los 30 días naturales posteriores a la cancelación. Transcurrido dicho plazo, los datos serán eliminados de manera permanente.</Text>

        <Text style={styles.section}>6. REACTIVACIÓN</Text>
        <Text style={styles.body}>Una cuenta cancelada puede reactivarse en cualquier momento contratando nuevamente el servicio. Los datos previamente exportados pueden ser importados mediante solicitud a soporte@vylta.com.</Text>

        <Text style={styles.section}>7. CONTACTO</Text>
        <Text style={styles.body}>📧 soporte@vylta.com{'\n'}🌐 www.vylta.com</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#fff' },
  back: { color: '#10B981', fontSize: 15, width: 60 },
  title: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  scroll: { padding: 20, paddingBottom: 60 },
  updated: { fontSize: 12, color: '#94A3B8', marginBottom: 20 },
  section: { fontSize: 14, fontWeight: '800', color: '#0F172A', marginTop: 20, marginBottom: 8 },
  body: { fontSize: 13, color: '#475569', lineHeight: 22 },
});
