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
        <Text style={styles.body}>Al crear una cuenta y utilizar la aplicación VYLTA (en adelante "el Servicio"), usted acepta quedar legalmente vinculado por estos Términos y Condiciones, así como por nuestro Aviso de Privacidad. Si no está de acuerdo con alguno de los puntos aquí descritos, deberá abstenerse de utilizar el Servicio.</Text>

        <Text style={styles.section}>2. DESCRIPCIÓN DEL SERVICIO</Text>
        <Text style={styles.body}>VYLTA es una plataforma SaaS móvil que permite a micro y pequeños negocios de servicios (salones de belleza, barberías, spas, clínicas estéticas, consultorios y similares) gestionar:{'\n\n'}
          • Agenda de citas y calendario digital.{'\n'}
          • Catálogo de servicios con precios y duración.{'\n'}
          • Base de datos de clientes finales del negocio.{'\n'}
          • Horarios de atención y bloqueos de tiempo (comidas, descansos).{'\n'}
          • Equipo de colaboradores (Plan Luxury), con horarios y bloqueos individuales.{'\n'}
          • Recordatorios automáticos y confirmaciones vía WhatsApp Business.{'\n'}
          • Link público personalizado para que los clientes finales agenden en línea (book.vylta.lat/su-negocio).{'\n'}
          • Reportes operativos y exportación de datos en CSV.{'\n'}
          • Asistente de inteligencia artificial para soporte (planes Premium y Luxury).
        </Text>

        <Text style={styles.section}>3. PLANES Y PRECIOS</Text>
        <Text style={styles.body}>VYLTA ofrece tres planes de suscripción:{'\n\n'}
          • Plan Básico — $0 MXN al mes. Incluye configuración del negocio, horarios, link público de citas, gestión básica de clientes y hasta 10 citas mensuales (incluyendo las generadas desde la app y desde el link público combinadas). No incluye recordatorios automáticos por WhatsApp ni reportes detallados.{'\n\n'}
          • Plan Premium — $399 MXN al mes. Incluye todo lo del Plan Básico más citas ilimitadas, recordatorios WhatsApp automáticos (confirmación al agendar, 24 horas y 2 horas antes), reportes detallados, lista de espera, gestión avanzada de clientes y asistente de IA para soporte.{'\n\n'}
          • Plan Luxury — $799 MXN al mes. Incluye todo lo del Plan Premium más equipo de hasta 5 colaboradores con asignación individual de citas, citas simultáneas (atención en paralelo cuando aplica), bloqueos de tiempo individuales por colaborador, email marketing, recuperación de clientes inactivos, recordatorios de cumpleaños y soporte prioritario.{'\n\n'}
          Los precios incluyen IVA. VYLTA podrá modificar los precios con notificación previa de al menos 30 días naturales. Las modificaciones aplicarán al siguiente ciclo de cobro.
        </Text>

        <Text style={styles.section}>4. CICLO DE COBRO Y PAGOS</Text>
        <Text style={styles.body}>La suscripción se cobra de forma mensual recurrente a través de Stripe. El primer cobro se realiza al activar el plan. Los cobros subsecuentes se realizan automáticamente cada 30 días.{'\n\n'}
          • VYLTA no almacena información de tarjetas. Toda la información de pago es procesada y almacenada por Stripe Inc.{'\n'}
          • Si un pago falla, su cuenta entrará en estado "Pago pendiente". Tendrá un período de gracia de 7 días para regularizar el pago antes de que el plan se degrade automáticamente al Plan Básico.{'\n'}
          • Los pagos realizados no son reembolsables, salvo en los casos previstos en la Ley Federal de Protección al Consumidor.
        </Text>

        <Text style={styles.section}>5. CANCELACIÓN DE SUSCRIPCIÓN</Text>
        <Text style={styles.body}>Puede cancelar su suscripción en cualquier momento desde la aplicación, en Ajustes → Plan y Suscripción → Gestionar suscripción → Cancelar (gestionado a través del portal de cliente de Stripe).{'\n\n'}
          • La cancelación toma efecto al final del período de cobro vigente. Mantendrá acceso al plan pagado hasta esa fecha.{'\n'}
          • Una vez finalizado el período, su cuenta será degradada automáticamente al Plan Básico. No se eliminarán sus datos.{'\n'}
          • Para eliminar su cuenta de forma permanente, utilice la opción "Eliminar mi cuenta" en Ajustes → Cuenta.
        </Text>

        <Text style={styles.section}>6. USO ACEPTABLE</Text>
        <Text style={styles.body}>El usuario se compromete a utilizar el Servicio de manera lícita, ética y conforme a los presentes términos. Queda prohibido:{'\n\n'}
          • Utilizar el Servicio para enviar spam, contenido no solicitado o mensajes que violen las políticas de WhatsApp Business o Meta.{'\n'}
          • Suplantar la identidad de terceros o registrar negocios ficticios.{'\n'}
          • Intentar acceder, modificar, manipular o sortear las validaciones de seguridad del sistema (incluyendo, pero no limitado a, validaciones de plan, conflictos de horario, citas simultáneas o bloqueos de tiempo).{'\n'}
          • Realizar ingeniería inversa, descompilar o intentar extraer el código fuente.{'\n'}
          • Utilizar el Servicio para actividades ilegales, fraudulentas o que violen derechos de terceros.{'\n'}
          • Compartir credenciales de acceso o permitir el uso de su cuenta a terceros no autorizados.{'\n'}
          • Recolectar datos de otros usuarios o de clientes finales de forma masiva o automatizada.{'\n\n'}
          La violación a cualquiera de estas disposiciones podrá resultar en la suspensión inmediata o terminación de la cuenta sin previo aviso.
        </Text>

        <Text style={styles.section}>7. PROPIEDAD INTELECTUAL</Text>
        <Text style={styles.body}>El nombre VYLTA, su logotipo, lema ("Cada cliente regresa"), diseño, código fuente, interfaces y demás elementos son propiedad exclusiva de Antonio López Labra. El uso del Servicio no le otorga ningún derecho sobre estos elementos.{'\n\n'}
          Los datos que usted introduzca al sistema (nombre del negocio, servicios, clientes, citas, logotipo, etc.) seguirán siendo de su propiedad. Usted otorga a VYLTA una licencia limitada y revocable para almacenar, procesar y mostrar dichos datos exclusivamente para la prestación del Servicio.
        </Text>

        <Text style={styles.section}>8. WHATSAPP BUSINESS Y NÚMERO COMPARTIDO</Text>
        <Text style={styles.body}>Los recordatorios automáticos por WhatsApp (planes Premium y Luxury) se envían desde un número de WhatsApp Business propiedad de VYLTA, certificado a través de 360dialog (proveedor BSP oficial de Meta). El usuario reconoce que:{'\n\n'}
          • Los mensajes se envían dentro de plantillas previamente aprobadas por Meta para asegurar el cumplimiento de sus políticas.{'\n'}
          • VYLTA no garantiza la entrega del 100% de los mensajes en caso de fallas en la red de WhatsApp/Meta.{'\n'}
          • El usuario debe contar con el consentimiento previo de sus clientes finales para enviarles mensajes (esto se cumple cuando el cliente proporciona su número al agendar una cita).{'\n'}
          • Meta podrá modificar las políticas de WhatsApp Business sin aviso previo. VYLTA hará sus mejores esfuerzos por adaptar el servicio a dichos cambios.
        </Text>

        <Text style={styles.section}>9. ASISTENTE DE INTELIGENCIA ARTIFICIAL</Text>
        <Text style={styles.body}>El asistente de IA disponible en planes Premium y Luxury utiliza modelos de lenguaje proporcionados por Anthropic PBC. El usuario reconoce y acepta que:{'\n\n'}
          • El asistente puede generar respuestas incorrectas, incompletas o desactualizadas. Las recomendaciones del asistente NO constituyen asesoría profesional, legal, fiscal ni médica.{'\n'}
          • Las conversaciones se procesan únicamente para responder consultas y no se utilizan para entrenar modelos.{'\n'}
          • No comparta información sensible (datos bancarios, contraseñas, datos médicos confidenciales) en el chat con la IA.{'\n'}
          • VYLTA no se hace responsable por decisiones de negocio tomadas con base en respuestas del asistente.
        </Text>

        <Text style={styles.section}>10. DISPONIBILIDAD DEL SERVICIO</Text>
        <Text style={styles.body}>VYLTA se esfuerza por mantener una disponibilidad de 99.5% mensual, sin embargo no garantiza un servicio ininterrumpido. Podrán existir interrupciones por:{'\n\n'}
          • Mantenimiento programado (notificado con anticipación cuando sea posible).{'\n'}
          • Fallas de proveedores de infraestructura (Supabase, Stripe, WhatsApp/Meta, etc.).{'\n'}
          • Eventos de fuerza mayor o caso fortuito.{'\n\n'}
          VYLTA no será responsable por daños indirectos derivados de interrupciones del servicio. La aplicación incluye un detector de conexión que notifica al usuario cuando hay problemas de red.
        </Text>

        <Text style={styles.section}>11. LIMITACIÓN DE RESPONSABILIDAD</Text>
        <Text style={styles.body}>En la máxima medida permitida por la ley aplicable:{'\n\n'}
          • VYLTA es una herramienta de gestión. La responsabilidad por la atención al cliente final, la prestación correcta de los servicios y el cumplimiento de las citas agendadas recae exclusivamente sobre el negocio titular de la cuenta.{'\n'}
          • VYLTA no será responsable por pérdida de ingresos, lucro cesante, daños indirectos, incidentales o consecuenciales.{'\n'}
          • La responsabilidad total acumulada de VYLTA frente al usuario no podrá exceder el monto pagado por el usuario en los 12 meses previos al evento que da lugar a la reclamación.
        </Text>

        <Text style={styles.section}>12. MODIFICACIONES A LOS TÉRMINOS</Text>
        <Text style={styles.body}>VYLTA podrá modificar estos Términos para reflejar cambios legales, nuevas funcionalidades o ajustes operativos. Las modificaciones serán notificadas a través de la aplicación o por correo electrónico con al menos 15 días naturales de anticipación. El uso continuado del Servicio después de dicha notificación constituye su aceptación de los nuevos términos.</Text>

        <Text style={styles.section}>13. TERMINACIÓN</Text>
        <Text style={styles.body}>VYLTA podrá suspender o cancelar su cuenta en caso de:{'\n\n'}
          • Violación a estos Términos.{'\n'}
          • Falta de pago por más de 30 días naturales después del período de gracia.{'\n'}
          • Uso fraudulento, abusivo o que represente riesgo para la plataforma o terceros.{'\n'}
          • Requerimiento de autoridad competente.{'\n\n'}
          En caso de terminación por nuestra parte, le daremos la oportunidad de exportar sus datos antes de eliminarlos, salvo cuando exista una orden judicial en contrario.
        </Text>

        <Text style={styles.section}>14. LEY APLICABLE Y JURISDICCIÓN</Text>
        <Text style={styles.body}>Estos Términos se rigen por las leyes de los Estados Unidos Mexicanos. Para la interpretación, ejecución y cumplimiento, las partes se someten expresamente a los tribunales competentes de la ciudad de Querétaro, Querétaro, renunciando a cualquier otro fuero que pudiera corresponderles por razón de domicilio presente o futuro.</Text>

        <Text style={styles.section}>15. CONTACTO</Text>
        <Text style={styles.body}>Para preguntas sobre estos Términos:{'\n\n'}
          📧 legal@vylta.lat{'\n'}
          🌐 www.vylta.lat{'\n'}
          📍 Querétaro, México
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
