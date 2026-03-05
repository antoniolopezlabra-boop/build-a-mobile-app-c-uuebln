import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

export default function PrivacyScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>← Volver</Text></TouchableOpacity>
        <Text style={styles.title}>Aviso de Privacidad</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.updated}>Última actualización: marzo de 2026</Text>

        <Text style={styles.section}>1. IDENTIDAD Y DOMICILIO DEL RESPONSABLE</Text>
        <Text style={styles.body}>VYLTA, producto desarrollado por Antonio López Labra (en adelante "VYLTA" o "el Responsable"), con domicilio en Querétaro, Querétaro, México, es responsable del tratamiento de sus datos personales conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) y su Reglamento.</Text>

        <Text style={styles.section}>2. DATOS PERSONALES QUE RECABAMOS</Text>
        <Text style={styles.body}>Para la prestación de nuestros servicios, recabamos los siguientes datos personales:{'\n\n'}
          • Datos de identificación: nombre completo, correo electrónico y número de teléfono.{'\n'}
          • Datos del negocio: nombre del establecimiento, giro comercial, dirección y teléfono de contacto.{'\n'}
          • Datos de clientes finales: nombre, teléfono y fecha de nacimiento de los clientes del negocio registrado.{'\n'}
          • Datos de uso: historial de citas, servicios agendados y notas internas del negocio.{'\n'}
          • Datos de pago: procesados de manera segura a través de Stripe Inc. VYLTA no almacena datos de tarjetas de crédito o débito.
        </Text>

        <Text style={styles.section}>3. FINALIDADES DEL TRATAMIENTO</Text>
        <Text style={styles.body}>Sus datos personales serán utilizados para las siguientes finalidades primarias:{'\n\n'}
          • Crear y administrar su cuenta en la plataforma VYLTA.{'\n'}
          • Gestionar la agenda de citas y el envío de recordatorios automáticos vía WhatsApp.{'\n'}
          • Procesar pagos de suscripción mensual.{'\n'}
          • Brindar soporte técnico y atención al cliente.{'\n'}
          • Cumplir con obligaciones legales aplicables.{'\n\n'}
          Finalidades secundarias (puede oponerse):{'\n\n'}
          • Envío de comunicaciones sobre nuevas funciones, actualizaciones o promociones del servicio.
        </Text>

        <Text style={styles.section}>4. TRANSFERENCIA DE DATOS</Text>
        <Text style={styles.body}>VYLTA podrá compartir sus datos con los siguientes terceros exclusivamente para las finalidades descritas:{'\n\n'}
          • Supabase Inc. — almacenamiento seguro de datos en la nube.{'\n'}
          • Stripe Inc. — procesamiento de pagos.{'\n'}
          • Meta Platforms Inc. (WhatsApp Business API) — envío de notificaciones y recordatorios.{'\n'}
          • 360dialog GmbH — proveedor intermediario de WhatsApp Business API.{'\n\n'}
          No se realizarán transferencias a terceros distintos a los mencionados sin su consentimiento previo.
        </Text>

        <Text style={styles.section}>5. DERECHOS ARCO</Text>
        <Text style={styles.body}>Usted tiene derecho a Acceder, Rectificar, Cancelar u Oponerse (derechos ARCO) al tratamiento de sus datos personales. Para ejercerlos, envíe una solicitud a:{'\n\n'}
          📧 privacidad@vylta.com{'\n\n'}
          Su solicitud será atendida en un plazo máximo de 20 días hábiles conforme a la LFPDPPP.
        </Text>

        <Text style={styles.section}>6. SEGURIDAD DE LOS DATOS</Text>
        <Text style={styles.body}>VYLTA implementa medidas de seguridad administrativas, técnicas y físicas para proteger sus datos personales contra daño, pérdida, alteración, destrucción o uso no autorizado, incluyendo cifrado en tránsito (TLS) y en reposo, control de acceso por roles y auditorías periódicas.</Text>

        <Text style={styles.section}>7. CAMBIOS AL AVISO DE PRIVACIDAD</Text>
        <Text style={styles.body}>Cualquier modificación a este Aviso de Privacidad será notificada a través de la aplicación. El uso continuado del servicio después de dicha notificación constituirá su aceptación de los cambios.</Text>

        <Text style={styles.section}>8. CONTACTO</Text>
        <Text style={styles.body}>Para cualquier duda o comentario relacionado con este Aviso de Privacidad, contáctenos en:{'\n\n'}📧 privacidad@vylta.com{'\n'}🌐 www.vylta.com</Text>
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
