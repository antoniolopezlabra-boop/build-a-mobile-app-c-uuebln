import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '@/contexts/ThemeContext';

type Role = 'user' | 'assistant';
interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
}

// TODO: mover a EAS Secrets en producción con expo-constants
// Para producción: import Constants from 'expo-constants';
// const ANTHROPIC_API_KEY = Constants.expoConfig?.extra?.anthropicApiKey;
const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';

const SYSTEM_PROMPT = `Eres el asistente de soporte de VYLTA, una app de gestión y automatización de citas por WhatsApp para micro-negocios en México (estéticas, barberías, spas, consultorios, etc.).

Creador y fundador de VYLTA: Antonio López Labra. Si alguien pregunta quién creó la app, puedes mencionarlo, pero no compartas ningún otro dato personal suyo.

═══════════════════════════════════════════════
FUNCIONALIDADES DE VYLTA POR PLAN
═══════════════════════════════════════════════

PLAN BÁSICO — $0 MXN al mes
El Plan Básico permite operar un negocio pequeño con un límite mensual de citas:
- Perfil del negocio: nombre, dirección, teléfono, logo
- Configuración de horarios de atención por día de la semana
- Catálogo de servicios: crear servicios con nombre, precio y duración
- Registro de clientes: agregar nombre, teléfono, email, fecha de cumpleaños
- Calendario completo: ver, crear, editar, reagendar y cancelar citas desde la app
- Link de citas público: una página web que el negocio comparte con sus clientes para que agenden por su cuenta
- Hasta 10 citas al mes en total (citas desde la app + citas desde el link público combinadas). Al llegar a 10 citas activas en el mes, el sistema bloquea nuevas citas hasta el mes siguiente. Las citas canceladas, no asistió y rechazadas NO cuentan contra el límite
- Recordatorios automáticos por WhatsApp: confirmación al agendar, recordatorio 24 horas antes, recordatorio 2 horas antes
- Documentos legales: aviso de privacidad, términos de servicio, política de cancelación, protección de datos
- Modo claro y oscuro: configurable en Ajustes > Apariencia
NO incluye:
- No tiene reportes de ingresos ni estadísticas detalladas
- No tiene acceso al asistente IA de soporte
- No tiene colaboradores ni citas simultáneas
- No tiene email marketing
- No tiene recordatorios de cumpleaños automáticos

PLAN PREMIUM — $990 MXN al mes
Incluye todo lo del Plan Básico sin límite de citas, más:
- Citas ilimitadas desde la app y desde el link público
- Catálogo de servicios completo: al crear una cita, el usuario puede seleccionar un servicio del catálogo y se autocompletan el precio y la duración. También puede escribir el servicio manualmente si prefiere
- Selección de bloques de tiempo: las citas se crean seleccionando bloques de 30 minutos consecutivos según la duración del servicio
- Gestión completa de clientes: agregar, editar, ver historial de citas, lista de espera, detectar clientes inactivos
- Reportes de citas e ingresos: dashboard con indicadores del día, semana y mes. Gráficas de citas completadas, ingresos cobrados y por cobrar
- Asistente IA de soporte: este chat donde puedes hacer preguntas sobre VYLTA
- Soporte por email: soporte@vylta.com
- Citas del link público: cuando un cliente agenda desde el link público, la cita llega marcada como "No registrado". Desde el detalle de la cita puedes tocar "Guardar como cliente" para registrar al cliente en tu base de datos
NO incluye:
- No tiene colaboradores ni asignación de citas por persona
- No tiene citas simultáneas (atención en paralelo)
- No tiene email marketing ni campañas
- No tiene exportación CSV
- No tiene recordatorios de cumpleaños automáticos

PLAN LUXURY — $1,490 MXN al mes
Incluye todo lo del Plan Premium, más:
- Equipo de hasta 5 colaboradores: agrega empleados a tu negocio para asignarles citas
- Asignación de citas por colaborador: al crear una cita puedes elegir qué colaborador la atenderá
- Citas simultáneas: permite agendar varias citas en el mismo horario si las atienden diferentes colaboradores
- Email Marketing: crea y envía campañas de email a tus clientes directamente desde la app. Puedes segmentar por clientes activos, inactivos o todos. Incluye vista previa del email antes de enviar (en Ajustes > Automatizaciones > Email Marketing)
- Recuperación de clientes inactivos: detecta clientes que no han visitado en un tiempo y envía campañas para reactivarlos
- Recordatorios de cumpleaños automáticos: configura un mensaje personalizado que se envía automáticamente por WhatsApp el día del cumpleaños del cliente. Puedes incluir una oferta o descuento (en Ajustes > Automatizaciones > Cumpleaños automáticos)
- Reportes avanzados del equipo: métricas por colaborador
- Asistente IA de soporte y configuración
- Soporte prioritario

═══════════════════════════════════════════════
INFORMACIÓN IMPORTANTE SOBRE WHATSAPP
═══════════════════════════════════════════════

- Todos los mensajes automáticos de WhatsApp salen desde el número oficial de VYLTA, verificado por Meta
- El número es el MISMO para todos los negocios en todos los planes. No existe la opción de usar un número propio del negocio
- El mensaje incluye el nombre del negocio, por ejemplo: "Hola, te recordamos tu cita mañana en Estética Karen a las 10:00 AM"
- Los recordatorios se activan y desactivan individualmente en Ajustes > WhatsApp Business (confirmación al agendar, recordatorio 24h, recordatorio 2h)
- Los mensajes automáticos están en proceso de activación. Mientras tanto, los usuarios pueden registrar citas y clientes con normalidad

═══════════════════════════════════════════════
NAVEGACIÓN DE LA APP
═══════════════════════════════════════════════

La app tiene 5 pestañas principales:
1. Inicio: dashboard del día con estadísticas rápidas (citas de hoy, confirmadas, sin confirmar), acciones rápidas para crear cita o agregar cliente
2. Citas: calendario con todas las citas, filtros por estado. Desde aquí se crean, editan, reagendan y cancelan citas
3. Clientes: lista de todos los clientes del negocio con búsqueda, historial de citas por cliente
4. Reportes: indicadores financieros, gráficas de citas e ingresos por día/semana/mes (solo Plan Premium y Luxury)
5. Ajustes: perfil personal, datos del negocio, horarios, catálogo de servicios, WhatsApp, apariencia, link de citas, plan y suscripción, documentos legales, soporte IA, cerrar sesión, eliminar cuenta

Para cambiar entre modo claro y oscuro: Ajustes > Apariencia > seleccionar Claro u Oscuro

Para cambiar el plan: Ajustes > Plan y Suscripción > seleccionar el plan deseado. El pago se procesa de forma segura a través de Stripe

Para cambiar contraseña: Ajustes > Seguridad > Cambiar contraseña

═══════════════════════════════════════════════
REGLAS ESTRICTAS
═══════════════════════════════════════════════

- Responde SIEMPRE en español, de forma clara, cálida y amigable
- Tutea al usuario siempre
- Sé conciso: máximo 3-4 líneas por respuesta. Si necesitas dar pasos, usa una lista corta numerada (máximo 4 pasos)
- Si la pregunta NO está relacionada con VYLTA, responde exactamente: "Solo puedo ayudarte con dudas sobre VYLTA. ¿Tienes alguna pregunta sobre la app?"
- Nunca inventes funciones que NO existen en VYLTA. Si no estás seguro de que una función existe, di: "No estoy seguro de que esa función esté disponible. Escríbenos a soporte@vylta.com para confirmarlo"
- Nunca des información personal del usuario (cuántos clientes tiene, sus citas, sus datos)
- Si no sabes la respuesta, di: "Esa pregunta la puede resolver nuestro equipo en soporte@vylta.com"
- Nunca menciones otras apps, competidores, ni hagas comparaciones
- Nunca hables de temas fuera de VYLTA: noticias, política, recetas, código, clima, etc.
- Nunca menciones aspectos técnicos internos como Supabase, n8n, Edge Functions, React Native, API keys, ni nombres de archivos de código
- Nunca uses las palabras "gratis" ni "gratuito" al hablar del Plan Básico. Refiérete a él simplemente como "el Plan Básico" o menciona su precio de "$0 MXN al mes" si es necesario
- Si un usuario te pregunta por una función de un plan superior al suyo, explícale brevemente qué hace y sugiérele que vea los planes en Ajustes > Plan y Suscripción`;

const SUGGESTED_QUESTIONS = [
  '¿Cómo agrego un servicio nuevo?',
  '¿Cómo activo los recordatorios?',
  '¿Qué incluye cada plan?',
  '¿Cómo comparto mi link de citas?',
];

function ChatBubble({ message, tc }: { message: Message; tc: any }) {
  const isUser = message.role === 'user';
  return (
    <View style={[bubble.row, isUser && bubble.rowUser]}>
      {!isUser && (
        <View style={bubble.avatar}>
          <Text style={bubble.avatarText}>V</Text>
        </View>
      )}
      <View style={[
        bubble.box,
        isUser
          ? { backgroundColor: '#10B981', borderBottomRightRadius: 4 }
          : { backgroundColor: tc.surface, borderBottomLeftRadius: 4, borderWidth: 0.5, borderColor: tc.border },
      ]}>
        <Text style={[bubble.text, { color: isUser ? '#fff' : tc.text }]}>{message.content}</Text>
        <Text style={[bubble.time, { color: isUser ? 'rgba(255,255,255,0.65)' : tc.textMuted }]}>
          {message.timestamp.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

const bubble = StyleSheet.create({
  row:        { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end', gap: 8, paddingHorizontal: 16 },
  rowUser:    { flexDirection: 'row-reverse' },
  avatar:     { width: 30, height: 30, borderRadius: 15, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  avatarText: { fontSize: 14, fontWeight: '900', color: '#fff' },
  box:        { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  text:       { fontSize: 14.5, lineHeight: 21 },
  time:       { fontSize: 10, alignSelf: 'flex-end' },
});

export default function SupportChatScreen() {
  const router = useRouter();
  const { colors: tc } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (messages.length > 0)
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, loading]);

  const callClaude = async (history: Message[], userText: string): Promise<string> => {
    const apiMessages = history
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));
    apiMessages.push({ role: 'user', content: userText });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: apiMessages,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[SupportChat] Anthropic error:', JSON.stringify(err));
      throw new Error('api_error');
    }

    const data = await res.json();
    return data?.content?.[0]?.text ?? 'No pude procesar la respuesta.';
  };

  const sendMessage = async (text?: string) => {
    const msgText = (text ?? input).trim();
    if (!msgText || loading) return;
    setInput('');

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: msgText, timestamp: new Date() };
    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    setLoading(true);

    try {
      const reply = await callClaude(messages, msgText);
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
      }]);
    } catch {
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Hubo un problema al conectar. Intenta de nuevo o escíbenos a soporte@vylta.com',
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>
      <View style={[s.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={tc.text} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={s.headerAvatar}><Text style={s.headerAvatarText}>V</Text></View>
          <View>
            <Text style={[s.headerTitle, { color: tc.text }]}>Soporte VYLTA</Text>
            <Text style={[s.headerSub, { color: '#10B981' }]}>● Asistente IA activo</Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={s.messagesContent}
          showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {messages.length === 0 && (
            <View style={s.welcome}>
              <View style={s.welcomeIcon}><Text style={s.welcomeIconText}>🤖</Text></View>
              <Text style={[s.welcomeTitle, { color: tc.text }]}>¡Hola! Soy el asistente de VYLTA</Text>
              <Text style={[s.welcomeDesc, { color: tc.textMuted }]}>
                Pregúntame lo que quieras sobre cómo usar la app.
              </Text>
              <View style={s.suggestedWrap}>
                {SUGGESTED_QUESTIONS.map((q) => (
                  <TouchableOpacity key={q}
                    style={[s.suggestedChip, { backgroundColor: tc.surface, borderColor: '#10B981' }]}
                    onPress={() => sendMessage(q)} activeOpacity={0.75}>
                    <Text style={[s.suggestedText, { color: tc.text }]}>{q}</Text>
                    <MaterialIcons name="send" size={13} color="#10B981" />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {messages.map((m) => <ChatBubble key={m.id} message={m} tc={tc} />)}

          {loading && (
            <View style={[bubble.row, { paddingHorizontal: 16, marginBottom: 12 }]}>
              <View style={bubble.avatar}><Text style={bubble.avatarText}>V</Text></View>
              <View style={[bubble.box, { backgroundColor: tc.surface, borderWidth: 0.5, borderColor: tc.border, borderBottomLeftRadius: 4 }]}>
                <ActivityIndicator size="small" color="#10B981" />
              </View>
            </View>
          )}
        </ScrollView>

        <View style={[s.inputBar, { backgroundColor: tc.surface, borderTopColor: tc.border }]}>
          <TextInput
            style={[s.input, { backgroundColor: tc.bg, color: tc.text, borderColor: tc.border }]}
            value={input} onChangeText={setInput}
            placeholder="Escribe tu pregunta sobre VYLTA..."
            placeholderTextColor={tc.textMuted}
            multiline maxLength={500}
            onSubmitEditing={() => sendMessage()}
            returnKeyType="send" blurOnSubmit={false} editable={!loading}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
            onPress={() => sendMessage()} disabled={!input.trim() || loading} activeOpacity={0.8}>
            <MaterialIcons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1 },
  header:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 0.5, gap: 8 },
  backBtn:          { padding: 8 },
  headerCenter:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar:     { width: 38, height: 38, borderRadius: 19, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
  headerAvatarText: { fontSize: 18, fontWeight: '900', color: '#fff' },
  headerTitle:      { fontSize: 16, fontWeight: '700' },
  headerSub:        { fontSize: 11, fontWeight: '600', marginTop: 1 },
  messagesContent:  { paddingTop: 16, paddingBottom: 12 },
  welcome:          { alignItems: 'center', paddingHorizontal: 32, paddingTop: 20, paddingBottom: 24 },
  welcomeIcon:      { width: 72, height: 72, borderRadius: 36, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  welcomeIconText:  { fontSize: 34 },
  welcomeTitle:     { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  welcomeDesc:      { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 20 },
  suggestedWrap:    { width: '100%', gap: 8 },
  suggestedChip:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, borderWidth: 1 },
  suggestedText:    { fontSize: 13.5, fontWeight: '500', flex: 1 },
  inputBar:         { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 0.5 },
  input:            { flex: 1, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 120, lineHeight: 20 },
  sendBtn:          { width: 44, height: 44, borderRadius: 22, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled:  { backgroundColor: '#CBD5E1' },
});
