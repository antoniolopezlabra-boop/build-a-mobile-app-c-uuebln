import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

export default function TermsScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>← Volver</Text></TouchableOpacity>
        <Text style={styles.title}>Términos y Condiciones</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.updated}>Última actualización: abril de 2026</Text>

        <Text style={styles.section}>1. ACEPTACIÓN DE LOS TÉRMINOS</Text>
        <Text style={styles.body}>Al registrarse y utilizar VYLTA, usted acepta los presentes Términos y Condiciones de Uso. Si no está de acuerdo con alguna de las condiciones aquí establecidas, le rogamos no utilizar el servicio.</Text>

        <Text style={styles.section}>2. DESCRIPCIÓN DEL SERVICIO</Text>
        <Text style={styles.body}>VYLTA es una plataforma SaaS (Software as a Service) de gestión de citas y automatización de comunicación vía WhatsApp, diseñada para micro y pequeñas empresas. El servicio incluye:{'\n\n'}
          • Agenda digital de citas.{'\n'}
          • Envío automático de recordatorios y confirmaciones por WhatsApp.{'\n'}
          • Gestión de clientes y reagendamiento.{'\n'}
          • Dashboard de reportes y métricas.{'\n'}
          • Módulo de lista de espera y clientes inactivos.
        </Text>

        <Text style={styles.section}>3. REGISTRO Y CUENTA DE USUARIO</Text>
        <Text style={styles.body}>Para utilizar VYLTA es necesario crear una cuenta con información verídica y actualizada. Usted es responsable de mantener la confidencialidad de sus credenciales de acceso. VYLTA no será responsable de los daños derivados del uso no autorizado de su cuenta por terceros.</Text>

        <Text style={styles.section}>4. PLANES Y PAGOS</Text>
        <Text style={styles.body}>VYLTA ofrece los siguientes planes de suscripción mensual:{'\n\n'}
          • Plan Básico: $0 MXN/mes (hasta 10 citas al mes).{'\n'}
          • Plan Premium: $399 MXN/mes.{'\n'}
          • Plan Luxury: $799 MXN/mes.{'\n\n'}
          Los pagos se procesan a través de Stripe Inc. de forma segura. Las tarifas son en pesos mexicanos e incluyen IVA cuando aplique. VYLTA se reserva el derecho de modificar los precios con un aviso previo de 30 días naturales.
        </Text>

        <Text style={styles.section}>5. PROPIEDAD INTELECTUAL</Text>
        <Text style={styles.body}>Todo el contenido de VYLTA, incluyendo pero no limitado a código fuente, diseño, logotipos, textos e interfaces, es propiedad exclusiva de Antonio López Labra y está protegido por las leyes mexicanas e internacionales de propiedad intelectual. Queda prohibida su reproducción sin autorización expresa.</Text>

        <Text style={styles.section}>6. LIMITACIÓN DE RESPONSABILIDAD</Text>
        <Text style={styles.body}>VYLTA no garantiza la disponibilidad ininterrumpida del servicio. En ningún caso Antonio López Labra será responsable por daños indirectos, incidentales o consecuentes derivados del uso o imposibilidad de uso del servicio, incluyendo pérdida de datos o ingresos. La responsabilidad máxima de VYLTA se limita al monto pagado en el mes inmediato anterior al evento que originó el daño.</Text>

        <Text style={styles.section}>7. CONDUCTA PROHIBIDA</Text>
        <Text style={styles.body}>El usuario se compromete a no:{'\n\n'}
          • Usar el servicio para actividades ilegales.{'\n'}
          • Intentar acceder a cuentas de otros usuarios.{'\n'}
          • Distribuir spam o contenido malicioso a través de la plataforma.{'\n'}
          • Realizar ingeniería inversa del software.{'\n'}
          • Revender o sublicenciar el acceso a VYLTA sin autorización.
        </Text>

        <Text style={styles.section}>8. SUSPENSIÓN Y TERMINACIÓN</Text>
        <Text style={styles.body}>VYLTA se reserva el derecho de suspender o cancelar cuentas que incumplan estos Términos, sin previo aviso y sin responsabilidad alguna. El usuario podrá cancelar su suscripción en cualquier momento conforme a la Política de Cancelación.</Text>

        <Text style={styles.section}>9. LEY APLICABLE Y JURISDICCIÓN</Text>
        <Text style={styles.body}>Estos Términos se rigen por las leyes de los Estados Unidos Mexicanos. Para cualquier controversia derivada de su interpretación o cumplimiento, las partes se someten a la jurisdicción de los tribunales competentes de la Ciudad de México, renunciando a cualquier otro fuero que pudiera corresponderles.</Text>

        <Text style={styles.section}>10. CONTACTO</Text>
        <Text style={styles.body}>📧 legal@vylta.com{'\n'}🌐 www.vylta.com</Text>
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
