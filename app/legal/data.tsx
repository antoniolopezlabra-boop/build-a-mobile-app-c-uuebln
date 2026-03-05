import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

export default function DataScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>← Volver</Text></TouchableOpacity>
        <Text style={styles.title}>Política de Datos</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.updated}>Última actualización: marzo de 2026</Text>

        <Text style={styles.section}>1. ALMACENAMIENTO DE DATOS</Text>
        <Text style={styles.body}>Los datos de VYLTA se almacenan en servidores seguros provistos por Supabase Inc., con infraestructura en la región us-east-1 (Estados Unidos). Todos los datos se cifran en tránsito mediante TLS 1.2 o superior y en reposo mediante AES-256.</Text>

        <Text style={styles.section}>2. DATOS QUE RECOPILAMOS AUTOMÁTICAMENTE</Text>
        <Text style={styles.body}>Al usar la aplicación, recopilamos automáticamente:{'\n\n'}
          • Fecha y hora de inicio de sesión.{'\n'}
          • Tipo de dispositivo y sistema operativo.{'\n'}
          • Versión de la aplicación instalada.{'\n'}
          • Registros de errores técnicos (crash reports).{'\n\n'}
          Esta información se usa exclusivamente para mejorar la estabilidad y rendimiento del servicio.
        </Text>

        <Text style={styles.section}>3. DATOS DE CLIENTES FINALES</Text>
        <Text style={styles.body}>Los datos de los clientes finales (pacientes, clientes del negocio) son responsabilidad del negocio registrado en VYLTA. El negocio actúa como responsable del tratamiento de dichos datos y VYLTA como encargado. El negocio debe contar con el consentimiento de sus clientes para el envío de mensajes vía WhatsApp.</Text>

        <Text style={styles.section}>4. RETENCIÓN DE DATOS</Text>
        <Text style={styles.body}>
          • Datos de cuenta activa: se conservan mientras la suscripción esté vigente.{'\n'}
          • Tras cancelación: los datos se conservan 30 días para posible reactivación.{'\n'}
          • Después de 30 días: eliminación permanente e irrecuperable.{'\n'}
          • Logs técnicos: se conservan máximo 90 días.
        </Text>

        <Text style={styles.section}>5. SEGURIDAD</Text>
        <Text style={styles.body}>VYLTA implementa las siguientes medidas de seguridad:{'\n\n'}
          • Autenticación segura mediante Supabase Auth con bcrypt.{'\n'}
          • Políticas de Row Level Security (RLS) que garantizan aislamiento total entre cuentas.{'\n'}
          • Acceso administrativo restringido y auditado.{'\n'}
          • Sin almacenamiento de contraseñas en texto plano.{'\n'}
          • Revisiones periódicas de seguridad.
        </Text>

        <Text style={styles.section}>6. NOTIFICACIÓN DE BRECHAS</Text>
        <Text style={styles.body}>En caso de una brecha de seguridad que comprometa datos personales, VYLTA notificará a los usuarios afectados dentro de las 72 horas siguientes a su detección, conforme a la normativa aplicable.</Text>

        <Text style={styles.section}>7. CONTACTO DPO</Text>
        <Text style={styles.body}>Para consultas sobre protección de datos:{'\n\n'}📧 privacidad@vylta.com{'\n'}🌐 www.vylta.com</Text>
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
