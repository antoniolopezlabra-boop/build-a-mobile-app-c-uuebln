import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Switch, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { ConfirmModal } from '@/components/button';
import { useAuth } from '@/contexts/AuthContext';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

// ══════════════════════════════════════════════════════════════════════
// Recordatorios de cumpleaños — POR EMAIL (no WhatsApp)
//
// Decisión May 2026: los recordatorios de cumpleaños se envían por email
// (no por WhatsApp) para cumplir con políticas de Meta. Meta considera
// los mensajes de felicitación como Marketing (no Utility), y enviar
// Marketing sin opt-in explícito pone en riesgo el WABA del negocio.
//
// Email es libre de esas restricciones — Resend ya está configurado en
// noreply@vylta.lat para emails transaccionales y promocionales.
//
// Mantenemos los nombres de columna `birthday_reminders_enabled` y
// `birthday_message` por compatibilidad con datos existentes; el
// contenido ahora se interpreta como cuerpo de email plano.
// ══════════════════════════════════════════════════════════════════════

const DEFAULT_MESSAGE =
  '¡Hola {{nombre}}! 🎂\n\n' +
  'Todo el equipo de {{negocio}} te desea un feliz cumpleaños. ' +
  '¡Que sea un día especial!\n\n' +
  'Nos alegra mucho tenerte como cliente y esperamos verte pronto.';

const DEFAULT_SUBJECT = '🎂 ¡Feliz cumpleaños, {{nombre}}!';

const VARIABLES = [
  { key: '{{nombre}}', label: 'Nombre del cliente' },
  { key: '{{negocio}}', label: 'Nombre de tu negocio' },
];

export default function BirthdayScreen() {
  const router = useRouter();
  const { user, businessProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [includeDiscount, setIncludeDiscount] = useState(false);
  const [discountText, setDiscountText] = useState('10% de descuento en tu próxima visita');
  const [successModal, setSuccessModal] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });

  useEffect(() => { loadConfig(); }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data } = await supabase
        .from('business_profiles')
        .select('birthday_reminders_enabled, birthday_message, birthday_email_subject, birthday_discount_text')
        .eq('user_id', user?.id)
        .single();
      if (data) {
        setEnabled(data.birthday_reminders_enabled || false);
        setMessage(data.birthday_message || DEFAULT_MESSAGE);
        if ((data as any).birthday_email_subject) {
          setSubject((data as any).birthday_email_subject);
        }
        if (data.birthday_discount_text) {
          setIncludeDiscount(true);
          setDiscountText(data.birthday_discount_text);
        }
      }
    } catch (e) {
      // Columnas nuevas pueden no existir aún — usar defaults
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    if (enabled && !message.trim()) {
      setErrorModal({ visible: true, message: 'El mensaje no puede estar vacío' });
      return;
    }
    if (enabled && !subject.trim()) {
      setErrorModal({ visible: true, message: 'El asunto del email no puede estar vacío' });
      return;
    }
    setSaving(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const updates: any = {
        birthday_reminders_enabled: enabled,
        birthday_message: message.trim(),
        birthday_discount_text: includeDiscount ? discountText.trim() : null,
        updated_at: new Date().toISOString(),
      };
      // Intentamos guardar el asunto del email; si la columna no existe
      // (migración pendiente), Supabase rechaza la columna pero el resto
      // de campos sí se guardan vía retry.
      try {
        await supabase
          .from('business_profiles')
          .update({ ...updates, birthday_email_subject: subject.trim() })
          .eq('user_id', user?.id);
      } catch {
        await supabase
          .from('business_profiles')
          .update(updates)
          .eq('user_id', user?.id);
      }
      setSuccessModal(true);
    } catch (e: any) {
      setErrorModal({ visible: true, message: e?.message || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  // Preview del email con datos reales del negocio
  const businessName = businessProfile?.businessName || 'Tu Negocio';
  const previewSubject = subject
    .replace(/{{nombre}}/g, 'María')
    .replace(/{{negocio}}/g, businessName);
  const previewMessage = (() => {
    let msg = message
      .replace(/{{nombre}}/g, 'María')
      .replace(/{{negocio}}/g, businessName);
    if (includeDiscount && discountText.trim()) {
      msg += `\n\n🎁 ${discountText.trim()}`;
    }
    return msg;
  })();

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ConfirmModal
        visible={successModal}
        title="¡Guardado!"
        message="La configuración de cumpleaños se guardó correctamente."
        buttons={[{ text: 'Listo', onPress: () => { setSuccessModal(false); router.back(); }, style: 'default' }]}
        onDismiss={() => { setSuccessModal(false); router.back(); }}
      />
      <ConfirmModal
        visible={errorModal.visible}
        title="Error"
        message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'default' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })}
      />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <MaterialIcons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={s.headerMid}>
          <Text style={s.title}>Cumpleaños</Text>
          <Text style={s.subtitle}>Email automático</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Banner explicativo */}
        <View style={s.banner}>
          <View style={s.bannerIcon}>
            <MaterialIcons name="mail" size={28} color="#EC4899" />
          </View>
          <View style={s.bannerText}>
            <Text style={s.bannerTitle}>Felicitaciones por email</Text>
            <Text style={s.bannerDesc}>
              VYLTA envía automáticamente un email a tus clientes el día de su cumpleaños.
              Solo necesitas tener su email registrado en el perfil.
            </Text>
          </View>
        </View>

        {/* Toggle principal */}
        <View style={s.card}>
          <View style={s.toggleRow}>
            <View style={s.toggleInfo}>
              <Text style={s.toggleLabel}>Activar recordatorios</Text>
              <Text style={s.toggleSub}>
                {enabled ? 'Tus clientes recibirán un email en su cumpleaños' : 'Desactivado'}
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              trackColor={{ false: '#E2E8F0', true: '#EC4899' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Config (solo si está habilitado) */}
        {enabled && (
          <>
            {/* Asunto del email */}
            <Text style={s.sectionLabel}>ASUNTO DEL EMAIL</Text>
            <View style={s.card}>
              <Text style={s.fieldLabel}>Subject line</Text>
              <TextInput
                style={s.input}
                value={subject}
                onChangeText={setSubject}
                placeholder="Asunto del email..."
                placeholderTextColor="#CBD5E1"
                returnKeyType="done"
              />
              <Text style={s.helpText}>
                Lo que verá tu cliente en su bandeja antes de abrir el email.
              </Text>
            </View>

            {/* Mensaje */}
            <Text style={s.sectionLabel}>MENSAJE</Text>
            <View style={s.card}>
              <Text style={s.fieldLabel}>Cuerpo del email</Text>
              <TextInput
                style={s.textarea}
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                placeholder="Escribe el mensaje de cumpleaños..."
                placeholderTextColor="#CBD5E1"
              />

              {/* Variables disponibles */}
              <Text style={s.varsLabel}>Variables disponibles:</Text>
              <View style={s.varsRow}>
                {VARIABLES.map(v => (
                  <TouchableOpacity
                    key={v.key}
                    style={s.varChip}
                    onPress={() => setMessage(prev => prev + ` ${v.key}`)}
                  >
                    <Text style={s.varChipText}>{v.key}</Text>
                    <Text style={s.varChipSub}>{v.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={s.resetBtn} onPress={() => { setMessage(DEFAULT_MESSAGE); setSubject(DEFAULT_SUBJECT); }}>
                <MaterialIcons name="refresh" size={14} color="#94A3B8" />
                <Text style={s.resetText}>Restaurar mensaje predeterminado</Text>
              </TouchableOpacity>
            </View>

            {/* Descuento o promoción */}
            <Text style={s.sectionLabel}>DESCUENTO (OPCIONAL)</Text>
            <View style={s.card}>
              <View style={s.toggleRow}>
                <View style={s.toggleInfo}>
                  <Text style={s.toggleLabel}>Incluir descuento o promoción</Text>
                  <Text style={s.toggleSub}>Se agrega al final del email</Text>
                </View>
                <Switch
                  value={includeDiscount}
                  onValueChange={setIncludeDiscount}
                  trackColor={{ false: '#E2E8F0', true: '#10B981' }}
                  thumbColor="#fff"
                />
              </View>
              {includeDiscount && (
                <TextInput
                  style={[s.input, { marginTop: 12 }]}
                  value={discountText}
                  onChangeText={setDiscountText}
                  placeholder="Ej: 20% de descuento en tu próxima visita"
                  placeholderTextColor="#CBD5E1"
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
              )}
            </View>

            {/* Preview del email */}
            <Text style={s.sectionLabel}>VISTA PREVIA</Text>
            <View style={s.previewContainer}>
              <View style={s.emailCard}>
                {/* Email header */}
                <View style={s.emailHeader}>
                  <View style={s.emailAvatar}>
                    <MaterialIcons name="cake" size={18} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.emailFrom}>{businessName}</Text>
                    <Text style={s.emailFromMail}>noreply@vylta.lat</Text>
                  </View>
                  <Text style={s.emailTime}>9:00 AM</Text>
                </View>
                {/* Asunto */}
                <Text style={s.emailSubject}>{previewSubject}</Text>
                {/* Cuerpo */}
                <Text style={s.emailBody}>{previewMessage}</Text>
                {/* Footer del email */}
                <View style={s.emailFooter}>
                  <Text style={s.emailFooterText}>Enviado con cariño desde {businessName}</Text>
                </View>
              </View>
              <Text style={s.previewNote}>
                Así se verá el email en la bandeja de tu cliente. El nombre "María" es solo un ejemplo.
              </Text>
            </View>

            {/* Info sobre emails */}
            <View style={s.infoBox}>
              <MaterialIcons name="info-outline" size={16} color="#3B82F6" />
              <Text style={s.infoText}>
                Solo los clientes con fecha de cumpleaños Y email registrados recibirán la felicitación.
                Puedes agregar o editar estos datos en el perfil de cada cliente.
              </Text>
            </View>
          </>
        )}

        {/* Botón guardar */}
        <TouchableOpacity
          style={[s.saveBtn, saving && s.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.saveBtnText}>Guardar configuración</Text>
          }
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0',
  },
  back: { padding: 4 },
  headerMid: { flex: 1, paddingHorizontal: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 12, color: '#94A3B8', marginTop: 1 },
  scroll: { padding: 16 },

  // Banner
  banner: {
    flexDirection: 'row', gap: 14, backgroundColor: '#FDF2F8',
    borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 0.5, borderColor: '#FBCFE8',
  },
  bannerIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#FCE7F3', justifyContent: 'center', alignItems: 'center' },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: '#831843', marginBottom: 4 },
  bannerDesc: { fontSize: 12, color: '#9D174D', lineHeight: 18 },

  // Card
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: '#94A3B8',
    letterSpacing: 1.2, marginBottom: 8, marginTop: 12, paddingHorizontal: 2,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  toggleInfo: { flex: 1 },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  toggleSub: { fontSize: 12, color: '#94A3B8', marginTop: 2 },

  // Mensaje
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#64748B', marginBottom: 8 },
  helpText: { fontSize: 11, color: '#94A3B8', marginTop: 6, fontStyle: 'italic' },
  textarea: {
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14,
    fontSize: 14, color: '#0F172A', minHeight: 140,
    borderWidth: 0.5, borderColor: '#E2E8F0', lineHeight: 20,
  },
  varsLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginTop: 12, marginBottom: 8 },
  varsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  varChip: {
    backgroundColor: '#F0FDF4', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 0.5, borderColor: '#BBF7D0',
  },
  varChipText: { fontSize: 12, fontWeight: '700', color: '#065F46' },
  varChipSub: { fontSize: 10, color: '#10B981', marginTop: 1 },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  resetText: { fontSize: 12, color: '#94A3B8' },
  input: {
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14,
    fontSize: 14, color: '#0F172A', borderWidth: 0.5, borderColor: '#E2E8F0',
  },

  // Preview Email (en lugar de burbuja WhatsApp)
  previewContainer: { marginBottom: 10 },
  emailCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    borderWidth: 0.5, borderColor: '#E2E8F0',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  emailHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  emailAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EC4899', justifyContent: 'center', alignItems: 'center' },
  emailFrom: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  emailFromMail: { fontSize: 11, color: '#94A3B8' },
  emailTime: { fontSize: 11, color: '#94A3B8' },
  emailSubject: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 10, lineHeight: 22 },
  emailBody: { fontSize: 13, color: '#475569', lineHeight: 20 },
  emailFooter: { marginTop: 12, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: '#F1F5F9' },
  emailFooterText: { fontSize: 10, color: '#94A3B8', textAlign: 'center', fontStyle: 'italic' },
  previewNote: { fontSize: 11, color: '#94A3B8', marginTop: 8, textAlign: 'center', fontStyle: 'italic' },

  // Info
  infoBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12,
    borderWidth: 0.5, borderColor: '#BFDBFE', marginBottom: 10,
  },
  infoText: { flex: 1, fontSize: 12, color: '#1E40AF', lineHeight: 18 },

  // Guardar
  saveBtn: { backgroundColor: '#EC4899', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 16 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
