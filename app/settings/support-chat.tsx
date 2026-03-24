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

// ─── Tipos ───────────────────────────────────────────────────────────────────
type Role = 'user' | 'assistant';
interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
}

// ─── API Key — carga desde variables de entorno ───────────────────────────────
// Agrega EXPO_PUBLIC_ANTHROPIC_API_KEY en tu .env o en EAS Secrets
const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres el asistente de soporte de VYLTA, una app de automatización de citas por WhatsApp para micro-negocios en México.

Creador y fundador de VYLTA: Antonio López Labra. Si alguien pregunta quién creó la app, puedes decir que fue Antonio López Labra, pero no compartas ningún otro dato personal suyo.

Tu rol es ayudar a los usuarios ÚNICAMENTE con temas relacionados a VYLTA:
- Configuración inicial del negocio en VYLTA (nombre, horarios, servicios, logo)
- Gestión de citas: cómo crear, editar, cancelar, reagendar y ver el historial
- Gestión de clientes: agregar, editar, lista de espera, clientes inactivos
- Configuración de servicios y horarios de atención
- Cómo funcionan los recordatorios automáticos por WhatsApp (confirmación al agendar, recordatorio 24h antes, recordatorio 2h antes)
- El link de citas público: qué es, cómo activarlo, cómo compartirlo con clientes
- Colaboradores / equipo: agregar colaboradores, asignar citas por colaborador (Plan Premium)
- Reportes y métricas: cómo interpretar los indicadores del Dashboard
- Email marketing: cómo crear y enviar campañas a clientes (Plan Premium)
- Recuperar clientes inactivos: cómo detectarlos y reactivarlos (Plan Premium)
- Recordatorios de cumpleaños automáticos por WhatsApp (Plan Premium)
- Diferencias entre los planes:
  * Gratuito ($0): solo para explorar, sin citas reales, sin recordatorios
  * Básico ($990 MXN/mes): citas ilimitadas, recordatorios WhatsApp número VYLTA, link de citas público, lista de espera
  * Premium ($1,490 MXN/mes): todo lo de Básico + equipo de hasta 5 colaboradores, asignación de citas por colaborador, email marketing, clientes inactivos, cumpleaños automáticos, reportes avanzados
- Cambio de plan: cómo actualizar o cancelar suscripción
- Cambio de contraseña y datos de perfil
- Dudas generales de uso de la app

Reglas estrictas:
- Responde SIEMPRE en español, de forma clara, cálida y amigable
- Tutea al usuario siempre
- Sé conciso: máximo 3-4 líneas por respuesta. Si necesitas dar pasos, usa una lista corta numerada
- Si la pregunta NO está relacionada con VYLTA, responde exactamente: "Solo puedo ayudarte con dudas sobre VYLTA. ¿Tienes alguna pregunta sobre la app?"
- Nunca inventes funciones que no existen en VYLTA
- Nunca des información personal del usuario (cuántos clientes tiene, sus citas, sus datos) — eso está en la app, no aquí
- Si no sabes la respuesta, di: "Esa pregunta la puede resolver nuestro equipo en soporte@vylta.com"
- Nunca menciones otras apps o competidores
- Nunca hables de temas fuera de VYLTA: noticias, política, recetas, código, etc.`;

// ─── Mensajes de bienvenida sugeridos ─────────────────────────────────────────
const SUGGESTED_QUESTIONS = [
  '¿Cómo agrego un servicio?',
  '¿Cómo activo los recordatorios?',
  '¿Qué incluye el Plan Básico?',
  '¿Cómo comparto mi link de citas?',
];

// ─── Componente burbuja ───────────────────────────────────────────────────────
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
        <Text style={[bubble.text, { color: isUser ? '#fff' : tc.text }]}>
          {message.content}
        </Text>
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

// ─── Pantalla principal ───────────────────────────────────────────────────────
export default function SupportChatScreen() {
  const router = useRouter();
  const { colors: tc } = useTheme();

  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [apiError, setApiError]   = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Scroll al fondo cuando llegan mensajes
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, loading]);

  // ── Llamada a Claude Haiku ──────────────────────────────────────────────────
  const callClaude = async (history: Message[], userText: string): Promise<string> => {
    if (!ANTHROPIC_API_KEY) {
      return 'El asistente no está configurado aún. Contacta a soporte@vylta.com';
    }

    // Construir historial en formato Anthropic (solo los últimos 10 turnos para no gastar tokens)
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
        model: 'claude-haiku-4-5',
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: apiMessages,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[SupportChat] Anthropic error:', err);
      throw new Error('api_error');
    }

    const data = await res.json();
    return data?.content?.[0]?.text ?? 'No pude procesar la respuesta.';
  };

  // ── Enviar mensaje ──────────────────────────────────────────────────────────
  const sendMessage = async (text?: string) => {
    const msgText = (text ?? input).trim();
    if (!msgText || loading) return;
    setInput('');
    setApiError(false);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: msgText,
      timestamp: new Date(),
    };

    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    setLoading(true);

    try {
      const reply = await callClaude(messages, msgText);
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setApiError(true);
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Hubo un problema al conectar con el asistente. Intenta de nuevo o escríbenos a soporte@vylta.com',
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>

      {/* Header */}
      <View style={[s.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={tc.text} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={s.headerAvatar}>
            <Text style={s.headerAvatarText}>V</Text>
          </View>
          <View>
            <Text style={[s.headerTitle, { color: tc.text }]}>Soporte VYLTA</Text>
            <Text style={[s.headerSub, { color: '#10B981' }]}>● Asistente IA activo</Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={s.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Estado vacío — bienvenida */}
          {messages.length === 0 && (
            <View style={s.welcome}>
              <View style={s.welcomeIcon}>
                <Text style={s.welcomeIconText}>🤖</Text>
              </View>
              <Text style={[s.welcomeTitle, { color: tc.text }]}>¡Hola! Soy el asistente de VYLTA</Text>
              <Text style={[s.welcomeDesc, { color: tc.textMuted }]}>
                Pregúntame lo que quieras sobre cómo usar la app. Estoy aquí para ayudarte.
              </Text>
              <View style={s.suggestedWrap}>
                {SUGGESTED_QUESTIONS.map((q) => (
                  <TouchableOpacity
                    key={q}
                    style={[s.suggestedChip, { backgroundColor: tc.surface, borderColor: '#10B981' }]}
                    onPress={() => sendMessage(q)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.suggestedText, { color: tc.text }]}>{q}</Text>
                    <MaterialIcons name="send" size={13} color="#10B981" />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Mensajes */}
          {messages.map((m) => (
            <ChatBubble key={m.id} message={m} tc={tc} />
          ))}

          {/* Typing indicator */}
          {loading && (
            <View style={[bubble.row, { paddingHorizontal: 16, marginBottom: 12 }]}>
              <View style={bubble.avatar}>
                <Text style={bubble.avatarText}>V</Text>
              </View>
              <View style={[bubble.box, { backgroundColor: tc.surface, borderWidth: 0.5, borderColor: tc.border, borderBottomLeftRadius: 4 }]}>
                <ActivityIndicator size="small" color="#10B981" />
              </View>
            </View>
          )}
        </ScrollView>

        {/* Input bar */}
        <View style={[s.inputBar, { backgroundColor: tc.surface, borderTopColor: tc.border }]}>
          <TextInput
            style={[s.input, { backgroundColor: tc.bg, color: tc.text, borderColor: tc.border }]}
            value={input}
            onChangeText={setInput}
            placeholder="Escribe tu pregunta sobre VYLTA..."
            placeholderTextColor={tc.textMuted}
            multiline
            maxLength={500}
            onSubmitEditing={() => sendMessage()}
            returnKeyType="send"
            blurOnSubmit={false}
            editable={!loading}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
            onPress={() => sendMessage()}
            disabled={!input.trim() || loading}
            activeOpacity={0.8}
          >
            <MaterialIcons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:          { flex: 1 },
  header:             { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 0.5, gap: 8 },
  backBtn:            { padding: 8 },
  headerCenter:       { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar:       { width: 38, height: 38, borderRadius: 19, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
  headerAvatarText:   { fontSize: 18, fontWeight: '900', color: '#fff' },
  headerTitle:        { fontSize: 16, fontWeight: '700' },
  headerSub:          { fontSize: 11, fontWeight: '600', marginTop: 1 },
  messagesContent:    { paddingTop: 16, paddingBottom: 12 },
  welcome:            { alignItems: 'center', paddingHorizontal: 32, paddingTop: 20, paddingBottom: 24 },
  welcomeIcon:        { width: 72, height: 72, borderRadius: 36, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  welcomeIconText:    { fontSize: 34 },
  welcomeTitle:       { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  welcomeDesc:        { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 20 },
  suggestedWrap:      { width: '100%', gap: 8 },
  suggestedChip:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, borderWidth: 1 },
  suggestedText:      { fontSize: 13.5, fontWeight: '500', flex: 1 },
  inputBar:           { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 0.5 },
  input:              { flex: 1, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 120, lineHeight: 20 },
  sendBtn:            { width: 44, height: 44, borderRadius: 22, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled:    { backgroundColor: '#CBD5E1' },
});
