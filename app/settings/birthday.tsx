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

const DEFAULT_MESSAGE =
  '¡Hola {{nombre}}! 🎂 Todo el equipo de {{negocio}} te desea un feliz cumpleaños. ' +
  '¡Que sea un día especial! Nos alegra mucho tenerte como cliente.';

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
        .select('birthday_reminders_enabled, birthday_message, birthday_discount_text')
        .eq('user_id', user?.id)
        .single();
      if (data) {
        setEnabled(data.birthday_reminders_enabled || false);
        setMessage(data.birthday_message || DEFAULT_MESSAGE);
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
    setSaving(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      await supabase.from('business_profiles').update({
        birthday_reminders_enabled: enabled,
        birthday_message: message.trim(),
        birthday_discount_text: includeDiscount ? discountText.trim() : null,
        updated_at: new Date().toISOString(),
      }).eq('user_id', user?.id);
      setSuccessModal(true);
    } catch (e: any) {
      setErrorModal({ visible: true, message: e?.message || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  // Preview del mensaje con datos reales del negocio
  const previewMessage = (() => {
    const name = businessProfile?.businessName || 'Tu Negocio';
    let msg = message
      .replace(/{{nombre}}/g, 'María')
      .replace(/{{negocio}}/g, name);
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
          <Text style={s.subtitle}>Mensaje automático</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Banner explicativo */}
        <View style={s.banner}>
          <View style={s.bannerIcon}>
            <MaterialIcons name="cake" size={28} color="#EC4899" />
          </View>
          <View style={s.bannerText}>
            <Text style={s.bannerTitle}>Mensajes de cumpleaños</Text>
            <Text style={s.bannerDesc}>
              VYLTA envía automáticamente un WhatsApp a tus clientes el día de su cumpleaños.
              Solo necesitas tener su fecha registrada en el perfil.
            </Text>
          </View>
        </View>

        {/* Toggle principal */}
        <View style={s.card}>
          <View style={s.toggleRow}>
            <View style={s.toggleInfo}>
              <Text style={s.toggleLabel}>Activar recordatorios</Text>
              <Text style={s.toggleSub}>
                {enabled ? 'Tus clientes recibirán un mensaje en su cumpleaños' : 'Desactivado'}
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
            {/* Mensaje */}
            <Text style={s.sectionLabel}>MENSAJE</Text>
            <View style={s.card}>
              <Text style={s.fieldLabel}>Texto del mensaje</Text>
              <TextInput
                style={s.textarea}
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={5}
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

              <TouchableOpacity style={s.resetBtn} onPress={() => setMessage(DEFAULT_MESSAGE)}>
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
                  <Text style={s.toggleSub}>Se agrega al final del mensaje</Text>
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

            {/* Preview del mensaje */}
            <Text style={s.sectionLabel}>VISTA PREVIA</Text>
            <View style={s.previewContainer}>
              <View style={s.previewBubbleWrap}>
                <View style={s.previewHeader}>
                  <View style={s.previewAvatar}>
                    <MaterialIcons name="storefront" size={16} color="#fff" />
                  </View>
                  <Text style={s.previewSender}>
                    {businessProfile?.businessName || 'Tu Negocio'}
                  </Text>
                </View>
                <View style={s.previewBubble}>
                  <Text style={s.previewText}>{previewMessage}</Text>
                  <Text style={s.previewTime}>9:00 AM ✓✓</Text>
                </View>
              </View>
              <Text style={s.previewNote}>
                Así verá el mensaje tu cliente. El nombre "María" es solo un ejemplo.
              </Text>
            </View>

            {/* Info sobre fechas */}
            <View style={s.infoBox}>
              <MaterialIcons name="info-outline" size={16} color="#3B82F6" />
              <Text style={s.infoText}>
                Solo los clientes con fecha de cumpleaños registrada recibirán el mensaje.
                Puedes agregar o editar la fecha en el perfil de cada cliente.
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
  textarea: {
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14,
    fontSize: 14, color: '#0F172A', minHeight: 120,
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

  // Preview WhatsApp
  previewContainer: { marginBottom: 10 },
  previewBubbleWrap: {
    backgroundColor: '#E5EFDB', borderRadius: 16, padding: 14,
  },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  previewAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EC4899', justifyContent: 'center', alignItems: 'center' },
  previewSender: { fontSize: 13, fontWeight: '700', color: '#1B1B1B' },
  previewBubble: { backgroundColor: '#fff', borderRadius: 12, padding: 12 },
  previewText: { fontSize: 14, color: '#111', lineHeight: 20 },
  previewTime: { fontSize: 10, color: '#94A3B8', textAlign: 'right', marginTop: 6 },
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
