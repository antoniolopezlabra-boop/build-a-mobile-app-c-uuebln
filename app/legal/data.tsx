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
        <Text style={styles.updated}>Última actualización: abril de 2026</Text>

        <Text style={styles.section}>1. PROPIEDAD DE LOS DATOS</Text>
        <Text style={styles.body}>Todos los datos que usted introduce en VYLTA (nombre del negocio, servicios, clientes, citas, horarios, bloqueos de tiempo, colaboradores, logotipo, etc.) son y seguirán siendo de su propiedad. VYLTA actúa exclusivamente como custodio y procesador de los mismos para brindar el servicio contratado.</Text>

        <Text style={styles.section}>2. DÓNDE SE ALMACENAN SUS DATOS</Text>
        <Text style={styles.body}>Sus datos se almacenan de forma segura en servidores administrados por Supabase Inc., con infraestructura subyacente provista por Amazon Web Services. La región principal de almacenamiento es São Paulo, Brasil, lo que garantiza baja latencia para usuarios en México y Latinoamérica.{'\n\n'}
          • La base de datos utiliza PostgreSQL con cifrado en reposo (AES-256).{'\n'}
          • Los archivos (logos, exportaciones CSV) se almacenan en Supabase Storage con políticas de acceso restringido.{'\n'}
          • La autenticación se maneja con JWT y bcrypt para el hash de contraseñas.
        </Text>

        <Text style={styles.section}>3. ACCESO Y CONTROL</Text>
        <Text style={styles.body}>Cada cuenta de VYLTA tiene políticas de Row-Level Security (RLS) habilitadas en la base de datos. Esto significa que, a nivel de infraestructura, cada usuario solo puede acceder a sus propios datos. Ningún otro usuario, ni siquiera con privilegios de administrador, puede consultar la información de su negocio sin un proceso de auditoría documentado.{'\n\n'}
          • Los colaboradores (Plan Luxury) tienen acceso limitado y restringido únicamente a las citas y horarios que el dueño de la cuenta les asigne.{'\n'}
          • Las Edge Functions (validación server-side de citas, procesamiento de Stripe, etc.) operan con la clave de servicio pero están auditadas para no exponer datos cruzados entre usuarios.
        </Text>

        <Text style={styles.section}>4. EXPORTACIÓN DE DATOS</Text>
        <Text style={styles.body}>Usted puede exportar todos sus datos en cualquier momento desde la aplicación:{'\n\n'}
          Ajustes → Cuenta → "Exportar mis datos"{'\n\n'}
          • La exportación incluye sus citas y clientes en formato CSV (compatible con Excel y Google Sheets).{'\n'}
          • Puede seleccionar el rango de fechas que desea exportar.{'\n'}
          • La exportación está limitada a una vez por mes para prevenir abuso del sistema.{'\n'}
          • Los archivos se descargan directamente a su dispositivo, sin almacenamiento intermedio.
        </Text>

        <Text style={styles.section}>5. RESPALDOS</Text>
        <Text style={styles.body}>VYLTA realiza respaldos automáticos diarios de la base de datos con retención de 7 días. Estos respaldos están exclusivamente destinados a la recuperación ante desastres y no son accesibles directamente al usuario. Si requiere restaurar datos eliminados accidentalmente, contáctenos dentro de las primeras 72 horas posteriores al evento.</Text>

        <Text style={styles.section}>6. ELIMINACIÓN DE DATOS</Text>
        <Text style={styles.body}>Cuando elimina su cuenta:{'\n\n'}
          • Todos sus datos personales y los de sus clientes finales son marcados para eliminación inmediatamente.{'\n'}
          • Los datos se eliminan de la base de datos primaria en un plazo máximo de 7 días.{'\n'}
          • Los respaldos que contengan dichos datos se sobrescriben automáticamente en un plazo máximo de 30 días.{'\n'}
          • Algunos datos podrán conservarse por más tiempo cuando exista una obligación legal (típicamente 5 años para registros fiscales según el Código Fiscal de la Federación).{'\n\n'}
          También puede eliminar individualmente:{'\n\n'}
          • Clientes específicos: desde el detalle del cliente, botón "Eliminar cliente" (con doble confirmación). Las citas existentes se conservan pero se desvinculan del cliente.{'\n'}
          • Citas individuales: desde el detalle de la cita, opción "Cancelar" o "Eliminar".{'\n'}
          • Servicios: desde el catálogo, opción "Desactivar" o "Eliminar".
        </Text>

        <Text style={styles.section}>7. PORTABILIDAD</Text>
        <Text style={styles.body}>Si decide migrar a otro proveedor, puede:{'\n\n'}
          • Exportar sus datos en CSV directamente desde la aplicación.{'\n'}
          • Solicitar un respaldo completo en formato JSON enviando un correo a privacidad@vylta.lat (atendido en hasta 10 días hábiles).{'\n\n'}
          VYLTA no impone barreras técnicas para la portabilidad de sus datos.
        </Text>

        <Text style={styles.section}>8. DATOS DE CLIENTES FINALES</Text>
        <Text style={styles.body}>Los datos de los clientes finales de su negocio (nombre, teléfono, historial de citas, etc.) le pertenecen como Responsable del tratamiento. VYLTA actúa como Encargado conforme al artículo 50 del Reglamento de la LFPDPPP.{'\n\n'}
          • Cuando un cliente final agenda una cita a través de su link público (book.vylta.lat/su-negocio), sus datos se almacenan de forma temporal en la cita hasta que usted decida convertirlo en cliente registrado.{'\n'}
          • Si un cliente final solicita el ejercicio de derechos ARCO sobre sus datos, debe atender la solicitud directamente como Responsable. VYLTA puede colaborar técnicamente pero no actuar en su lugar.{'\n'}
          • Si el cliente final solicita la eliminación de sus datos, puede hacerlo desde la app eliminando al cliente y desvinculando sus citas históricas.
        </Text>

        <Text style={styles.section}>9. CONTACTO</Text>
        <Text style={styles.body}>Para preguntas sobre el manejo de sus datos:{'\n\n'}
          📧 privacidad@vylta.lat{'\n'}
          🌐 www.vylta.lat
        </Text>
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
