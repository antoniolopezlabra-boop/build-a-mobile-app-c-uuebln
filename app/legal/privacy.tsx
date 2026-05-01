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
        <Text style={styles.updated}>Última actualización: abril de 2026</Text>

        <Text style={styles.section}>1. IDENTIDAD Y DOMICILIO DEL RESPONSABLE</Text>
        <Text style={styles.body}>VYLTA, producto desarrollado por Antonio López Labra (en adelante "VYLTA" o "el Responsable"), con domicilio en Querétaro, Querétaro, México, es responsable del tratamiento de sus datos personales conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) y su Reglamento.</Text>

        <Text style={styles.section}>2. DATOS PERSONALES QUE RECABAMOS</Text>
        <Text style={styles.body}>Para la prestación de nuestros servicios, recabamos los siguientes datos personales:{'\n\n'}
          • Datos de identificación del titular de la cuenta: nombre completo, correo electrónico y contraseña (almacenada de forma cifrada).{'\n'}
          • Datos del negocio: nombre del establecimiento, giro comercial, dirección, teléfono de contacto, logotipo, horarios de atención, bloqueos de tiempo (horarios de comida y descansos) y catálogo de servicios con precios.{'\n'}
          • Datos de colaboradores (Plan Luxury): nombre, rol, color de identificación y horarios laborales individuales por colaborador.{'\n'}
          • Datos de clientes finales del negocio: nombre, teléfono, correo electrónico (opcional), fecha de nacimiento (opcional), historial de visitas y notas internas que el dueño del negocio registre.{'\n'}
          • Datos de citas: fecha, hora de inicio y fin, servicio agendado, costo, estado (pendiente, confirmada, cancelada, etc.), colaborador asignado y notas.{'\n'}
          • Datos de uso de la plataforma: fecha y hora de inicio de sesión, dispositivo utilizado, dirección IP y registros de actividad.{'\n'}
          • Datos de pago: procesados directamente por Stripe Inc. y/o sus subprocesadores autorizados. VYLTA NO almacena ni accede a datos de tarjetas de crédito, débito, números CLABE o credenciales bancarias. Solamente conservamos un identificador anónimo de cliente y suscripción de Stripe.
        </Text>

        <Text style={styles.section}>3. ORIGEN DE LOS DATOS</Text>
        <Text style={styles.body}>Los datos son obtenidos directamente del titular cuando:{'\n\n'}
          • Crea su cuenta y completa el wizard de configuración inicial.{'\n'}
          • Registra clientes manualmente desde la app.{'\n'}
          • Sus clientes agendan citas a través del link público (book.vylta.lat/su-negocio).{'\n'}
          • Realiza pagos de suscripción.{'\n'}
          • Interactúa con el soporte técnico (incluido el asistente de IA disponible en planes Premium y Luxury).
        </Text>

        <Text style={styles.section}>4. FINALIDADES DEL TRATAMIENTO</Text>
        <Text style={styles.body}>Sus datos personales serán utilizados para las siguientes finalidades primarias necesarias para la prestación del servicio:{'\n\n'}
          • Crear, autenticar y administrar su cuenta en la plataforma.{'\n'}
          • Gestionar la agenda de citas, incluyendo validación de horarios disponibles, bloqueos de tiempo (comidas/descansos) y prevención de doble agendamiento.{'\n'}
          • Permitir la creación y configuración de un link público de citas.{'\n'}
          • Enviar recordatorios y confirmaciones automatizadas a clientes finales vía WhatsApp Business.{'\n'}
          • Procesar pagos de suscripción mensual a través de Stripe.{'\n'}
          • Generar reportes operativos del negocio (citas completadas, ingresos, asistencia, servicios más solicitados).{'\n'}
          • Habilitar la exportación de datos en formato CSV (citas y clientes).{'\n'}
          • Brindar soporte técnico humano y, para usuarios Premium y Luxury, soporte mediante asistente de inteligencia artificial.{'\n'}
          • Cumplir con obligaciones legales, contables y fiscales aplicables.{'\n'}
          • Detectar, prevenir y mitigar fraudes, abusos o usos no autorizados.{'\n\n'}
          Finalidades secundarias (puede oponerse en cualquier momento):{'\n\n'}
          • Envío de comunicaciones sobre nuevas funciones, actualizaciones o mejoras del producto.{'\n'}
          • Encuestas de satisfacción y mejora del servicio.{'\n'}
          • Análisis estadístico anonimizado para optimización de la plataforma.
        </Text>

        <Text style={styles.section}>5. RESPONSABILIDAD SOBRE DATOS DE CLIENTES FINALES</Text>
        <Text style={styles.body}>El usuario titular de la cuenta (dueño del negocio) actúa como Responsable de los datos personales de sus propios clientes finales que registre en la plataforma. VYLTA actúa como Encargado del tratamiento conforme al artículo 50 del Reglamento de la LFPDPPP, limitándose a almacenar y procesar dichos datos según las instrucciones del titular de la cuenta. El usuario se compromete a:{'\n\n'}
          • Contar con el consentimiento informado de sus clientes finales para registrar sus datos.{'\n'}
          • Tener su propio Aviso de Privacidad disponible para sus clientes.{'\n'}
          • Atender directamente cualquier solicitud ARCO que reciba de sus clientes finales.
        </Text>

        <Text style={styles.section}>6. TRANSFERENCIA DE DATOS A TERCEROS</Text>
        <Text style={styles.body}>VYLTA comparte sus datos exclusivamente con los siguientes proveedores tecnológicos, quienes están sujetos a contratos de confidencialidad y procesamiento de datos:{'\n\n'}
          • Supabase Inc. (Estados Unidos / Brasil — región São Paulo): almacenamiento seguro en la nube, autenticación y base de datos.{'\n'}
          • Stripe Inc. (Estados Unidos): procesamiento de pagos de suscripción y gestión del portal de cliente para cancelaciones y facturación.{'\n'}
          • 360dialog GmbH (Alemania): proveedor oficial (BSP) de WhatsApp Business API certificado por Meta para el envío de mensajes automatizados.{'\n'}
          • Meta Platforms Inc. (Estados Unidos): infraestructura subyacente de WhatsApp Business para entrega de mensajes a clientes finales.{'\n'}
          • Resend Inc. (Estados Unidos): envío de correos electrónicos transaccionales y campañas de email marketing (planes Premium y Luxury).{'\n'}
          • n8n GmbH (Alemania): orquestación de flujos automáticos de notificaciones.{'\n'}
          • Anthropic PBC (Estados Unidos): proveedor del modelo de lenguaje (Claude Haiku) que opera el asistente de IA de soporte. Las conversaciones con el asistente se procesan exclusivamente para responder consultas y no se utilizan para entrenar modelos.{'\n\n'}
          No se realizarán transferencias adicionales a terceros distintos a los mencionados sin su consentimiento expreso, salvo cuando sean requeridas por autoridad competente o resulten necesarias para mantener la relación jurídica entre las partes.
        </Text>

        <Text style={styles.section}>7. PLAZO DE CONSERVACIÓN</Text>
        <Text style={styles.body}>Sus datos serán conservados mientras mantenga su cuenta activa. Una vez solicitada la eliminación de su cuenta, los datos serán borrados de forma permanente en un plazo máximo de 30 días, salvo aquellos que debamos conservar por obligación legal, fiscal o contable (típicamente 5 años para registros de facturación según el Código Fiscal de la Federación).</Text>

        <Text style={styles.section}>8. DERECHOS ARCO Y REVOCACIÓN DEL CONSENTIMIENTO</Text>
        <Text style={styles.body}>Usted tiene derecho a Acceder, Rectificar, Cancelar u Oponerse (derechos ARCO) al tratamiento de sus datos personales, así como a revocar el consentimiento otorgado.{'\n\n'}
          Puede ejercerlos directamente desde la aplicación:{'\n\n'}
          • Acceso y exportación: Ajustes → Cuenta → "Exportar mis datos" (descarga en CSV).{'\n'}
          • Rectificación: edite directamente su perfil de negocio, servicios, clientes y citas en la app.{'\n'}
          • Cancelación: Ajustes → Cuenta → "Eliminar mi cuenta" (acción permanente).{'\n'}
          • Oposición a finalidades secundarias: envíe una solicitud al correo abajo indicado.{'\n\n'}
          También puede dirigir solicitudes ARCO formales al correo:{'\n\n'}
          📧 privacidad@vylta.lat{'\n\n'}
          La solicitud deberá incluir su nombre, copia de identificación oficial, descripción clara del derecho que desea ejercer y, en su caso, los datos sobre los cuales recae la solicitud. Atenderemos su petición en un plazo máximo de 20 días hábiles conforme al artículo 32 de la LFPDPPP.
        </Text>

        <Text style={styles.section}>9. SEGURIDAD DE LOS DATOS</Text>
        <Text style={styles.body}>VYLTA implementa medidas de seguridad administrativas, técnicas y físicas razonables para proteger sus datos personales contra daño, pérdida, alteración, destrucción o uso no autorizado, incluyendo:{'\n\n'}
          • Cifrado en tránsito mediante TLS 1.3.{'\n'}
          • Cifrado en reposo de la base de datos.{'\n'}
          • Políticas de Row-Level Security (RLS) que aíslan los datos de cada usuario.{'\n'}
          • Validaciones server-side para prevenir manipulación de citas, suplantación de privilegios entre planes de suscripción y conflictos de horario.{'\n'}
          • Autenticación segura mediante tokens JWT con expiración.{'\n'}
          • Auditorías periódicas de seguridad y revisiones de acceso.{'\n'}
          • Aislamiento de credenciales sensibles (claves API) mediante variables de entorno.{'\n\n'}
          A pesar de lo anterior, ningún sistema es completamente invulnerable. Le recomendamos utilizar contraseñas fuertes, no compartir sus credenciales y reportar de inmediato cualquier actividad sospechosa.
        </Text>

        <Text style={styles.section}>10. USO DE COOKIES Y TECNOLOGÍAS SIMILARES</Text>
        <Text style={styles.body}>La aplicación móvil utiliza almacenamiento local (AsyncStorage) para conservar su sesión, preferencias de tema (claro/oscuro) y el estado del wizard de configuración inicial. El link público de citas (book.vylta.lat) puede utilizar cookies estrictamente necesarias para el funcionamiento del servicio.</Text>

        <Text style={styles.section}>11. MENORES DE EDAD</Text>
        <Text style={styles.body}>VYLTA está dirigido a personas mayores de 18 años. No recabamos intencionalmente datos de menores. Si detectamos el registro de un menor sin autorización de sus tutores, procederemos a eliminar la cuenta.</Text>

        <Text style={styles.section}>12. CAMBIOS AL AVISO DE PRIVACIDAD</Text>
        <Text style={styles.body}>VYLTA podrá modificar este Aviso de Privacidad para mantenerlo actualizado conforme a cambios legales, nuevas funcionalidades del servicio o políticas internas. Las modificaciones serán notificadas a través de la aplicación o por correo electrónico al menos con 7 días de anticipación. El uso continuado del servicio después de dicha notificación constituirá su aceptación de los cambios.</Text>

        <Text style={styles.section}>13. AUTORIDAD DE PROTECCIÓN DE DATOS</Text>
        <Text style={styles.body}>Si considera que su derecho a la protección de datos personales ha sido vulnerado, puede acudir al Instituto Nacional de Transparencia, Acceso a la Información y Protección de Datos Personales (INAI) en www.inai.org.mx</Text>

        <Text style={styles.section}>14. CONTACTO</Text>
        <Text style={styles.body}>Para cualquier duda, comentario o solicitud relacionada con este Aviso de Privacidad:{'\n\n'}
          📧 privacidad@vylta.lat{'\n'}
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
