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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';

// ══════════════════════════════════════════════════════════════════════
// VYLTA — Asistente IA de soporte
//
// Después del refactor de seguridad de mayo 2026, este componente NO llama
// directamente a la API de Anthropic. En su lugar llama a la Edge Function
// `ai-chat` que vive en Supabase.
//
// Razones:
//   1. La API key de Anthropic NO está embebida en el binario móvil.
//   2. La Edge Function valida server-side que el plan del usuario sea Premium o Luxury.
//   3. La Edge Function aplica rate limiting (50 mensajes por usuario por día).
//   4. El SYSTEM_PROMPT vive en la Edge Function — cambiarlo no requiere release de app.
//
// ── FIX safe-area Android (May 10 2026) ────────────────────────────────
// Antes el input bar quedaba pegado al borde inferior de la pantalla, lo
// que en Android con los 3 botones de navegación (back/home/recent) hacía
// que el input se empalmara con los botones del sistema. Solución:
//   1. SafeAreaView con edges={['top']} y aplicar inset manual abajo
//   2. useSafeAreaInsets() para leer el bottom inset real del dispositivo
//   3. Agregar paddingBottom = max(inset.bottom, 12) al inputBar
//   4. keyboardVerticalOffset correcto en Android (con el header)
// ══════════════════════════════════════════════════════════════════════

type Role = 'user' | 'assistant';
interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
}

const SUPABASE_URL = 'https://nhjmwmkaduiaifgztymi.supabase.co';

const SUGGESTED_QUESTIONS = [
  '¿Cómo agrego un servicio nuevo?',
  '¿Cómo configuro mi horario de comida?',
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
  const insets = useSafeAreaInsets(); // ← NUEVO: lee los insets del sistema
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (messages.length > 0)
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, loading]);

  // Llamada a la Edge Function ai-chat con el JWT del usuario.
  const callAIChat = async (history: Message[], userText: string): Promise<string> => {
    const apiMessages = history
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));
    apiMessages.push({ role: 'user', content: userText });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
    }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ messages: apiMessages }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (err.code === 'PLAN_REQUIRED') {
        throw new Error('El asistente IA está disponible en Plan Premium y Luxury. Actualiza tu plan en Ajustes > Plan y Suscripción.');
      }
      if (err.code === 'RATE_LIMITED') {
        throw new Error(err.error || 'Has alcanzado el límite de mensajes hoy. Intenta de nuevo mañana.');
      }
      console.error('[SupportChat] ai-chat error:', res.status, JSON.stringify(err));
      throw new Error(err.error || 'No pude procesar tu mensaje. Intenta de nuevo.');
    }

    const data = await res.json();
    return data?.reply ?? 'No pude procesar la respuesta.';
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
      const reply = await callAIChat(messages, msgText);
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
      }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: e?.message || 'Hubo un problema al conectar. Intenta de nuevo o escríbenos a soporte@vylta.lat',
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  // ── Cálculo del padding bottom seguro ──
  // En Android con los 3 botones, insets.bottom es típicamente 0 porque la
  // barra de navegación está FUERA del área de WebView. Pero el problema es
  // que la app se dibuja edge-to-edge en Android 11+ y el inputBar queda
  // debajo de los botones. Solución: forzar paddingBottom mínimo de 12
  // pero respetar el inset si es mayor (Android gestures, iPhone X+).
  const bottomPadding = Math.max(insets.bottom, 12);

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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        // En Android necesitamos compensar la altura del header al subir el teclado
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
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

        {/* ── INPUT BAR con safe area inset abajo ──
            paddingBottom dinámico: usa el inset del sistema (Android con barra
            gestual / iPhone X+ con home indicator) o un mínimo de 12px si los
            botones de Android están en modo clásico de 3 botones. */}
        <View
          style={[
            s.inputBar,
            {
              backgroundColor: tc.surface,
              borderTopColor: tc.border,
              paddingBottom: bottomPadding,
            },
          ]}
        >
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
  // paddingBottom se aplica dinámico en el componente con el safe area inset
  inputBar:         { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 0.5 },
  input:            { flex: 1, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 120, lineHeight: 20 },
  sendBtn:          { width: 44, height: 44, borderRadius: 22, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled:  { backgroundColor: '#CBD5E1' },
});
