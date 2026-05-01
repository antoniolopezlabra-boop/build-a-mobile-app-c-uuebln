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
        <Text style={styles.title}>Cancelación y Reembolsos</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.updated}>Última actualización: abril de 2026</Text>

        <Text style={styles.section}>1. CANCELACIÓN DE LA SUSCRIPCIÓN</Text>
        <Text style={styles.body}>Puede cancelar su suscripción en cualquier momento desde la aplicación, sin necesidad de explicación ni autorización adicional.{'\n\n'}
          Pasos:{'\n\n'}
          1. Abra la aplicación VYLTA.{'\n'}
          2. Vaya a Ajustes → Plan y Suscripción.{'\n'}
          3. Pulse "Gestionar suscripción". Será redirigido al portal seguro de Stripe.{'\n'}
          4. Seleccione "Cancelar suscripción" y confirme.{'\n\n'}
          La cancelación queda registrada al instante. Recibirá un correo de confirmación de Stripe.
        </Text>

        <Text style={styles.section}>2. EFECTOS DE LA CANCELACIÓN</Text>
        <Text style={styles.body}>• Mantendrá acceso completo a todas las funciones de su plan pagado hasta el final del período de cobro vigente.{'\n'}
          • Al finalizar el período, su cuenta será degradada automáticamente al Plan Básico (gratuito), con el límite de 10 citas mensuales.{'\n'}
          • Sus datos NO se eliminan al cancelar la suscripción. Permanecen disponibles en su cuenta para que pueda seguir consultándolos o reactivar su plan posteriormente.{'\n'}
          • Si tenía colaboradores configurados (Plan Luxury), las citas asignadas a ellos se conservan pero ya no podrán iniciar sesión hasta que vuelva a activar el Plan Luxury.{'\n'}
          • Los recordatorios automáticos por WhatsApp dejarán de enviarse al concluir el período pagado.
        </Text>

        <Text style={styles.section}>3. REACTIVACIÓN</Text>
        <Text style={styles.body}>Puede reactivar su suscripción en cualquier momento desde la aplicación, sin perder ningún dato. Toda su configuración (negocio, servicios, clientes, citas, bloqueos de tiempo, colaboradores) se restablece automáticamente al activar nuevamente el plan.</Text>

        <Text style={styles.section}>4. POLÍTICA DE REEMBOLSOS</Text>
        <Text style={styles.body}>Como regla general, los pagos de suscripción mensual NO son reembolsables, ya que el servicio se presta de manera inmediata desde el momento de la activación.{'\n\n'}
          Excepciones donde sí procede reembolso:{'\n\n'}
          • Cobro duplicado por error técnico: reembolso íntegro del cobro duplicado.{'\n'}
          • Falla mayor del servicio (más de 72 horas continuas de inactividad): reembolso prorrateado del período afectado.{'\n'}
          • Cobros realizados después de una cancelación efectiva: reembolso íntegro.{'\n'}
          • Cualquier otro caso previsto por la Ley Federal de Protección al Consumidor.{'\n\n'}
          Las solicitudes de reembolso deben enviarse a soporte@vylta.lat con la descripción del caso, fecha del cobro y comprobante. Atenderemos su petición en un plazo máximo de 10 días hábiles.
        </Text>

        <Text style={styles.section}>5. CAMBIO DE PLAN (DOWNGRADE / UPGRADE)</Text>
        <Text style={styles.body}>• Upgrade (de Premium a Luxury, por ejemplo): el cobro adicional se prorratea desde el momento del cambio hasta el siguiente ciclo de cobro.{'\n'}
          • Downgrade (de Luxury a Premium o de pago a Básico): el plan superior se mantiene activo hasta el final del período pagado, después se aplica el plan inferior.{'\n'}
          • Si baja de Plan Luxury a Premium, los colaboradores configurados se desactivarán pero sus datos se conservan.
        </Text>

        <Text style={styles.section}>6. ELIMINACIÓN DE LA CUENTA</Text>
        <Text style={styles.body}>Si además de cancelar la suscripción desea eliminar permanentemente su cuenta y todos sus datos:{'\n\n'}
          1. Vaya a Ajustes → Cuenta → "Eliminar mi cuenta".{'\n'}
          2. Confirme la acción (es permanente y no tiene vuelta atrás).{'\n\n'}
          Sus datos personales y los de sus clientes finales se eliminan en un plazo máximo de 7 días, salvo aquellos que debamos conservar por obligación legal o fiscal.{'\n\n'}
          Antes de eliminar su cuenta, le recomendamos exportar sus datos desde Ajustes → Cuenta → "Exportar mis datos".
        </Text>

        <Text style={styles.section}>7. CANCELACIÓN POR PARTE DE VYLTA</Text>
        <Text style={styles.body}>VYLTA podrá cancelar su cuenta unilateralmente en caso de:{'\n\n'}
          • Violación a los Términos y Condiciones.{'\n'}
          • Falta de pago por más de 30 días naturales después del período de gracia.{'\n'}
          • Uso fraudulento, abusivo o que represente un riesgo para la plataforma o terceros.{'\n'}
          • Requerimiento de autoridad competente.{'\n\n'}
          En estos casos le notificaremos por correo electrónico y le daremos al menos 7 días para exportar sus datos antes de la eliminación, salvo cuando exista orden judicial en contrario o cuando la conducta requiera suspensión inmediata.
        </Text>

        <Text style={styles.section}>8. CONTACTO</Text>
        <Text style={styles.body}>Para asistencia con la cancelación o reembolsos:{'\n\n'}
          📧 soporte@vylta.lat{'\n'}
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
