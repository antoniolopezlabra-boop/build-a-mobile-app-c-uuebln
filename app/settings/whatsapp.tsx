
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Switch,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { apiGet, apiPut, apiPost } from '@/utils/api';
import { usePlan } from '@/contexts/PlanContext';

interface WhatsAppConfig {
  apiKey?: string;
  phoneNumber?: string;
  isConnected: boolean;
  reminder24h: boolean;
  reminder2h: boolean;
  confirmationOnBooking: boolean;
  waitlistNotification: boolean;
}

// ─── Burbuja de chat simulada ───────────────────────────────────────────────
function ChatBubble({ sender, message, time, isVylta }: {
  sender: string; message: string; time: string; isVylta?: boolean;
}) {
  return (
    <View style={bubble.row}>
      <View style={[bubble.avatar, isVylta ? bubble.avatarVylta : bubble.avatarOwn]}>
        <Text style={bubble.avatarText}>{isVylta ? 'V' : sender.charAt(0)}</Text>
      </View>
      <View style={bubble.content}>
        <Text style={[bubble.senderName, isVylta ? bubble.senderVylta : bubble.senderOwn]}>
          {sender}
        </Text>
        <View style={bubble.msgBox}>
          <Text style={bubble.msgText}>{message}</Text>
          <Text style={bubble.msgTime}>{time}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Tarjeta de flujo por plan ───────────────────────────────────────────────
function FlowCard({ plan, businessName }: { plan: 'basico' | 'premium'; businessName: string }) {
  const isBasico = plan === 'basico';

  const steps = isBasico
    ? [
        { icon: '🏢', label: businessName || 'Tu negocio', color: '#10B981' },
        { icon: '→', label: '', color: '#94A3B8' },
        { icon: '⚡', label: 'VYLTA', color: '#F59E0B' },
        { icon: '→', label: '', color: '#94A3B8' },
        { icon: '📱', label: 'Núm. VYLTA\ncompartido', color: '#64748B' },
        { icon: '→', label: '', color: '#94A3B8' },
        { icon: '👤', label: 'Tu cliente', color: '#3B82F6' },
      ]
    : [
        { icon: '🏢', label: businessName || 'Tu negocio', color: '#10B981' },
        { icon: '→', label: '', color: '#94A3B8' },
        { icon: '⚡', label: 'VYLTA', color: '#F59E0B' },
        { icon: '→', label: '', color: '#94A3B8' },
        { icon: '📲', label: 'TU número\npropio', color: '#6366F1' },
        { icon: '→', label: '', color: '#94A3B8' },
        { icon: '👤', label: 'Tu cliente', color: '#3B82F6' },
      ];

  return (
    <View style={[flow.card, isBasico ? flow.cardBasico : flow.cardPremium]}>
      {/* Header */}
      <View style={flow.header}>
        <View style={[flow.badge, isBasico ? flow.badgeBasico : flow.badgePremium]}>
          <Text style={flow.badgeText}>{isBasico ? 'BÁSICO' : 'PREMIUM'}</Text>
        </View>
        <Text style={flow.cardTitle}>
          {isBasico ? 'Número compartido VYLTA' : 'Tu número propio de WhatsApp'}
        </Text>
      </View>

      {/* Diagrama de flujo */}
      <View style={flow.diagram}>
        {steps.map((step, i) =>
          step.icon === '→' ? (
            <Text key={i} style={flow.arrow}>→</Text>
          ) : (
            <View key={i} style={flow.step}>
              <Text style={flow.stepIcon}>{step.icon}</Text>
              <Text style={[flow.stepLabel, { color: step.color }]}>{step.label}</Text>
            </View>
          )
        )}
      </View>

      {/* Descripción */}
      <Text style={flow.desc}>
        {isBasico
          ? 'Los mensajes se envían desde un número de WhatsApp administrado por VYLTA. Tus clientes verán el nombre de tu negocio en el mensaje, pero el número es compartido con otros negocios de la plataforma.'
          : 'Los mensajes se envían desde tu propio número de WhatsApp Business. Tus clientes ven exactamente tu número y nombre de negocio — máxima confianza y profesionalismo.'}
      </Text>

      {/* Ejemplo de mensaje simulado */}
      <Text style={flow.exampleLabel}>📨 Así lo ve tu cliente:</Text>
      <View style={flow.chatBox}>
        {isBasico ? (
          <ChatBubble
            sender="VYLTA • Notificaciones"
            message={`Hola 👋 Te recordamos tu cita en *${businessName || 'Tu negocio'}* mañana a las 10:00 AM.\n\n¿Confirmas?\n1️⃣ Sí, confirmo\n2️⃣ Reagendar\n3️⃣ Cancelar`}
            time="10:32 AM"
            isVylta
          />
        ) : (
          <ChatBubble
            sender={businessName || 'Tu negocio'}
            message={`Hola 👋 Te recordamos tu cita mañana a las 10:00 AM.\n\n¿Confirmas?\n1️⃣ Sí, confirmo\n2️⃣ Reagendar\n3️⃣ Cancelar`}
            time="10:32 AM"
            isVylta={false}
          />
        )}
      </View>

      {/* Nota aclaratoria */}
      <View style={[flow.note, isBasico ? flow.noteBasico : flow.notePremium]}>
        <Text style={flow.noteIcon}>{isBasico ? 'ℹ️' : '⭐'}</Text>
        <Text style={[flow.noteText, isBasico ? flow.noteTextBasico : flow.noteTextPremium]}>
          {isBasico
            ? 'El número de VYLTA es verificado por Meta y cumple con todas las políticas de WhatsApp Business.'
            : 'Tu número necesita verificación de Meta Business Suite (incluida en la configuración Premium).'}
        </Text>
      </View>
    </View>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function WhatsAppSettingsScreen() {
  const router = useRouter();
  const { isBasico, isPremium } = usePlan();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({ visible: false, message: '' });
  const [successModal, setSuccessModal] = useState<{ visible: boolean; message: string }>({ visible: false, message: '' });

  useEffect(() => { loadConfig(); }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await apiGet<WhatsAppConfig | null>('/api/whatsapp-config');
      if (data) {
        setConfig(data);
        setApiKey(data.apiKey || '');
        setPhoneNumber(data.phoneNumber || '');
      } else {
        setConfig({ isConnected: false, reminder24h: false, reminder2h: false, confirmationOnBooking: false, waitlistNotification: false });
      }
      // Intentar obtener nombre del negocio
      try {
        const profile = await apiGet<any>('/api/business-profile');
        if (profile?.businessName) setBusinessName(profile.businessName);
      } catch (_) {}
    } catch (error) {
      setConfig({ isConnected: false, reminder24h: false, reminder2h: false, confirmationOnBooking: false, waitlistNotification: false });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyConnection = async () => {
    if (!apiKey.trim() || !phoneNumber.trim()) {
      setErrorModal({ visible: true, message: 'Por favor ingresa tu API Key y número de WhatsApp' });
      return;
    }
    setVerifying(true);
    try {
      const result = await apiPost<{ success: boolean; message: string }>('/api/whatsapp-config/verify', { apiKey: apiKey.trim(), phoneNumber: phoneNumber.trim() });
      if (result.success) {
        await saveConfig(true);
        setSuccessModal({ visible: true, message: '¡Conexión exitosa! WhatsApp Business está configurado.' });
      } else {
        setErrorModal({ visible: true, message: result.message });
      }
    } catch (error: any) {
      setErrorModal({ visible: true, message: error?.message || 'Error al verificar la conexión' });
    } finally {
      setVerifying(false);
    }
  };

  const saveConfig = async (isConnected?: boolean) => {
    setSaving(true);
    try {
      const updatedConfig = await apiPut<WhatsAppConfig>('/api/whatsapp-config', {
        apiKey: apiKey.trim() || undefined,
        phoneNumber: phoneNumber.trim() || undefined,
        isConnected: isConnected !== undefined ? isConnected : config?.isConnected,
        reminder24h: config?.reminder24h,
        reminder2h: config?.reminder2h,
        confirmationOnBooking: config?.confirmationOnBooking,
        waitlistNotification: config?.waitlistNotification,
      });
      setConfig(updatedConfig);
    } catch (error: any) {
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const updateAutomation = async (field: keyof WhatsAppConfig, value: boolean) => {
    if (!config) return;
    const updatedConfig = { ...config, [field]: value };
    setConfig(updatedConfig);
    try {
      await apiPut('/api/whatsapp-config', { [field]: value });
    } catch (error) {
      setConfig(config);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const isConnected = config?.isConnected || false;
  const currentPlan: 'basico' | 'premium' = isPremium ? 'premium' : 'basico';

  return (
    <SafeAreaView style={styles.container}>
      <ConfirmModal
        visible={errorModal.visible}
        title="Error"
        message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'cancel' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })}
      />
      <ConfirmModal
        visible={successModal.visible}
        title="¡Éxito!"
        message={successModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setSuccessModal({ visible: false, message: '' }), style: 'default' }]}
        onDismiss={() => setSuccessModal({ visible: false, message: '' })}
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>WhatsApp Business</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* ── SECCIÓN: CÓMO FUNCIONA ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>💬 CÓMO LLEGAN LOS MENSAJES</Text>
          <Text style={styles.sectionSubtitle}>
            El número que ve tu cliente depende de tu plan
          </Text>
        </View>

        {/* Tarjeta del plan actual */}
        <FlowCard plan={currentPlan} businessName={businessName} />

        {/* Si es Básico, mostrar preview de Premium como upgrade */}
        {isBasico && (
          <View style={styles.upgradeWrapper}>
            <View style={styles.upgradeHint}>
              <Text style={styles.upgradeHintText}>✨ Con Plan Premium tus clientes reciben esto:</Text>
            </View>
            <FlowCard plan="premium" businessName={businessName} />
            <TouchableOpacity style={styles.upgradeBtn} onPress={() => router.push('/settings/subscription')}>
              <Text style={styles.upgradeBtnText}>Mejorar a Premium →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── COMPARATIVA RÁPIDA ── */}
        <View style={styles.compareCard}>
          <Text style={styles.compareTitle}>📊 Comparativa rápida</Text>
          <View style={styles.compareRow}>
            <Text style={styles.compareFeature} />
            <Text style={[styles.compareCol, { color: '#10B981' }]}>Básico</Text>
            <Text style={[styles.compareCol, { color: '#6366F1' }]}>Premium</Text>
          </View>
          {[
            { feature: 'Confirmación al agendar', basico: '✅', premium: '✅' },
            { feature: 'Recordatorio 24h', basico: '✅', premium: '✅' },
            { feature: 'Recordatorio 2h', basico: '✅', premium: '✅' },
            { feature: 'Reagendamiento automático', basico: '✅', premium: '✅' },
            { feature: 'Número propio del negocio', basico: '❌', premium: '✅' },
            { feature: 'Mayor confianza del cliente', basico: '—', premium: '✅' },
          ].map((row, i) => (
            <View key={i} style={[styles.compareRow, i % 2 === 0 && styles.compareRowAlt]}>
              <Text style={styles.compareFeature}>{row.feature}</Text>
              <Text style={styles.compareCol}>{row.basico}</Text>
              <Text style={styles.compareCol}>{row.premium}</Text>
            </View>
          ))}
        </View>

        {/* ── CONFIGURACIÓN TÉCNICA ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>⚙️ CONFIGURACIÓN</Text>
          <Text style={styles.sectionSubtitle}>
            {isPremium
              ? 'Conecta tu número propio de WhatsApp Business vía 360dialog'
              : 'El número de VYLTA se activa automáticamente al completar la configuración'}
          </Text>
        </View>

        {/* Step 1 */}
        <View style={styles.stepCard}>
          <View style={styles.stepHeader}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
            <Text style={styles.stepTitle}>Crea tu cuenta en 360dialog</Text>
          </View>
          <Text style={styles.stepDescription}>
            360dialog es el proveedor oficial de WhatsApp Business API. Necesitas crear una cuenta para poder enviar mensajes automatizados.
          </Text>
          <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL('https://www.360dialog.com')}>
            <Text style={styles.linkButtonText}>Ir a 360dialog</Text>
            <IconSymbol android_material_icon_name="open-in-new" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Step 2 */}
        <View style={styles.stepCard}>
          <View style={styles.stepHeader}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
            <Text style={styles.stepTitle}>Registra tu número</Text>
          </View>
          <Text style={styles.stepDescription}>
            Sigue las instrucciones de 360dialog para registrar tu número de WhatsApp Business. Este proceso incluye verificación de tu número.
          </Text>
          <View style={styles.iconRow}>
            <IconSymbol android_material_icon_name="phone" size={32} color={colors.primary} />
            <IconSymbol android_material_icon_name="arrow-forward" size={24} color={colors.textSecondary} />
            <IconSymbol android_material_icon_name="verified" size={32} color={colors.primary} />
          </View>
        </View>

        {/* Step 3 */}
        <View style={styles.stepCard}>
          <View style={styles.stepHeader}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
            <Text style={styles.stepTitle}>Obtén tu API Key</Text>
          </View>
          <Text style={styles.stepDescription}>
            Una vez registrado, 360dialog te proporcionará una API Key. Ingrésala aquí junto con tu número de WhatsApp.
          </Text>
          <Text style={styles.fieldLabel}>API Key</Text>
          <TextInput
            style={styles.input}
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="Ingresa tu API Key de 360dialog"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            secureTextEntry
          />
          <Text style={styles.fieldLabel}>Número de WhatsApp</Text>
          <TextInput
            style={styles.input}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="+52 55 1234 5678"
            placeholderTextColor={colors.textSecondary}
            keyboardType="phone-pad"
          />
        </View>

        {/* Step 4 */}
        <View style={styles.stepCard}>
          <View style={styles.stepHeader}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>4</Text></View>
            <Text style={styles.stepTitle}>¡Listo!</Text>
          </View>
          <Text style={styles.stepDescription}>
            Verifica tu conexión para comenzar a enviar mensajes automatizados a tus clientes.
          </Text>
          {isConnected ? (
            <View style={styles.connectedCard}>
              <IconSymbol android_material_icon_name="check-circle" size={48} color={colors.primary} />
              <Text style={styles.connectedText}>Conexión exitosa</Text>
              <Text style={styles.connectedSubtext}>WhatsApp Business está configurado</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.verifyButton, verifying && styles.verifyButtonDisabled]}
              onPress={handleVerifyConnection}
              disabled={verifying}
            >
              {verifying ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <IconSymbol android_material_icon_name="check" size={20} color="#FFFFFF" />
                  <Text style={styles.verifyButtonText}>Verificar conexión</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Automation settings */}
        {isConnected && (
          <View style={styles.automationSection}>
            <Text style={styles.sectionTitle}>AUTOMATIZACIÓN DE MENSAJES</Text>
            {[
              { field: 'reminder24h' as const, icon: 'schedule', title: 'Recordatorio 24 horas', sub: 'Enviar recordatorio 1 día antes de la cita' },
              { field: 'reminder2h' as const, icon: 'schedule', title: 'Recordatorio 2 horas', sub: 'Enviar recordatorio 2 horas antes de la cita' },
              { field: 'confirmationOnBooking' as const, icon: 'check-circle', title: 'Confirmación de cita', sub: 'Enviar confirmación al agendar una cita' },
              { field: 'waitlistNotification' as const, icon: 'notifications', title: 'Notificación de lista de espera', sub: 'Avisar cuando se libere un espacio' },
            ].map(item => (
              <View key={item.field} style={styles.automationItem}>
                <View style={styles.automationLeft}>
                  <IconSymbol android_material_icon_name={item.icon as any} size={24} color={colors.text} />
                  <View style={styles.automationText}>
                    <Text style={styles.automationTitle}>{item.title}</Text>
                    <Text style={styles.automationSubtitle}>{item.sub}</Text>
                  </View>
                </View>
                <Switch
                  value={config?.[item.field] || false}
                  onValueChange={(value) => updateAutomation(item.field, value)}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Estilos burbuja ─────────────────────────────────────────────────────────
const bubble = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  avatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  avatarVylta: { backgroundColor: '#F59E0B' },
  avatarOwn: { backgroundColor: '#6366F1' },
  avatarText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  content: { flex: 1 },
  senderName: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  senderVylta: { color: '#F59E0B' },
  senderOwn: { color: '#6366F1' },
  msgBox: { backgroundColor: '#fff', borderRadius: 12, borderTopLeftRadius: 2, padding: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  msgText: { fontSize: 13, color: '#0F172A', lineHeight: 18 },
  msgTime: { fontSize: 10, color: '#94A3B8', marginTop: 6, textAlign: 'right' },
});

// ─── Estilos tarjeta de flujo ─────────────────────────────────────────────────
const flow = StyleSheet.create({
  card: { borderRadius: 18, padding: 18, marginBottom: 12, borderWidth: 1.5 },
  cardBasico: { backgroundColor: '#F0FDF4', borderColor: '#10B981' },
  cardPremium: { backgroundColor: '#F5F3FF', borderColor: '#6366F1' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeBasico: { backgroundColor: '#D1FAE5' },
  badgePremium: { backgroundColor: '#EDE9FE' },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#0F172A' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', flex: 1 },
  diagram: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'nowrap', marginBottom: 14, gap: 2 },
  step: { alignItems: 'center', minWidth: 44 },
  stepIcon: { fontSize: 22 },
  stepLabel: { fontSize: 9, fontWeight: '700', textAlign: 'center', marginTop: 2, lineHeight: 12 },
  arrow: { fontSize: 14, color: '#94A3B8', marginBottom: 14 },
  desc: { fontSize: 12, color: '#475569', lineHeight: 18, marginBottom: 14 },
  exampleLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 10 },
  chatBox: { backgroundColor: '#F1F5F9', borderRadius: 12, padding: 12, marginBottom: 12 },
  note: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: 10 },
  noteBasico: { backgroundColor: '#DBEAFE' },
  notePremium: { backgroundColor: '#EDE9FE' },
  noteIcon: { fontSize: 14 },
  noteText: { flex: 1, fontSize: 11, lineHeight: 16 },
  noteTextBasico: { color: '#1E40AF' },
  noteTextPremium: { color: '#5B21B6' },
});

// ─── Estilos principales ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: 48, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { padding: 4 },
  title: { fontSize: 20, fontWeight: 'bold', color: colors.text },
  placeholder: { width: 32 },
  scrollContent: { padding: 20, paddingBottom: 60 },
  sectionHeader: { marginBottom: 14, marginTop: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#64748B', letterSpacing: 1, marginBottom: 4 },
  sectionSubtitle: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  upgradeWrapper: { marginBottom: 4 },
  upgradeHint: { backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10, marginBottom: 8 },
  upgradeHintText: { fontSize: 12, fontWeight: '700', color: '#92400E' },
  upgradeBtn: { backgroundColor: '#6366F1', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8, marginBottom: 16 },
  upgradeBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  compareCard: { backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 24, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  compareTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  compareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  compareRowAlt: { backgroundColor: '#F8FAFC', borderRadius: 8 },
  compareFeature: { flex: 1, fontSize: 12, color: '#475569', paddingHorizontal: 4 },
  compareCol: { width: 60, textAlign: 'center', fontSize: 13, fontWeight: '600', color: '#0F172A' },
  stepCard: { backgroundColor: colors.card, borderRadius: 16, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  stepNumber: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  stepNumberText: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' },
  stepTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text, flex: 1 },
  stepDescription: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 16 },
  linkButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkButtonText: { fontSize: 15, color: colors.primary, fontWeight: '600' },
  iconRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 12 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8, marginTop: 8 },
  input: { backgroundColor: colors.background, borderRadius: 12, padding: 14, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border },
  connectedCard: { alignItems: 'center', paddingVertical: 20 },
  connectedText: { fontSize: 18, fontWeight: 'bold', color: colors.primary, marginTop: 12 },
  connectedSubtext: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  verifyButton: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  verifyButtonDisabled: { opacity: 0.6 },
  verifyButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  automationSection: { marginTop: 24 },
  automationItem: { backgroundColor: colors.card, borderRadius: 12, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  automationLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  automationText: { marginLeft: 12, flex: 1 },
  automationTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  automationSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
});
