
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { ConfirmModal } from '@/components/button';
import { apiGet, apiPut } from '@/utils/api';
import { usePlan } from '@/contexts/PlanContext';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface WhatsAppConfig {
  isConnected: boolean;
  reminder24h: boolean;
  reminder2h: boolean;
  confirmationOnBooking: boolean;
  waitlistNotification: boolean;
}

// ─── Componente de paso numerado ─────────────────────────────────────────────
function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <View style={st.wrap}>
      <View style={st.left}>
        <View style={st.numCircle}>
          <Text style={st.num}>{number}</Text>
        </View>
        {/* línea vertical conectora */}
        <View style={st.line} />
      </View>
      <View style={st.right}>
        <Text style={st.title}>{title}</Text>
        {children}
        <View style={{ height: 20 }} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 14 },
  left: { alignItems: 'center', width: 32 },
  numCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  num: { color: '#fff', fontSize: 15, fontWeight: '800' },
  line: { flex: 1, width: 2, backgroundColor: '#E2E8F0', marginTop: 4 },
  right: { flex: 1, paddingTop: 4 },
  title: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
});

// ─── Burbuja de WhatsApp simulada ─────────────────────────────────────────────
function WaBubble({ from, text }: { from: string; text: string }) {
  return (
    <View style={wb.container}>
      <View style={wb.header}>
        <View style={wb.avatar}><MaterialIcons name="storefront" size={14} color="#fff" /></View>
        <Text style={wb.from}>{from}</Text>
      </View>
      <View style={wb.bubble}>
        <Text style={wb.text}>{text}</Text>
        <Text style={wb.time}>10:32 AM ✓✓</Text>
      </View>
    </View>
  );
}

const wb = StyleSheet.create({
  container: { backgroundColor: '#E5EFDB', borderRadius: 16, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#075E54', padding: 12 },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#128C7E', justifyContent: 'center', alignItems: 'center' },
  from: { fontSize: 13, fontWeight: '700', color: '#fff' },
  bubble: { backgroundColor: '#fff', margin: 12, borderRadius: 12, borderTopLeftRadius: 2, padding: 12 },
  text: { fontSize: 13, color: '#0F172A', lineHeight: 20 },
  time: { fontSize: 10, color: '#94A3B8', textAlign: 'right', marginTop: 6 },
});

// ─── Pantalla Gratuito: upgrade CTA ──────────────────────────────────────────
function GratuitoScreen() {
  const router = useRouter();
  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      {/* Hero */}
      <View style={s.heroCard}>
        <Text style={s.heroEmoji}>💬</Text>
        <Text style={s.heroTitle}>Automatiza tus recordatorios</Text>
        <Text style={s.heroDesc}>
          Con VYLTA tus clientes reciben mensajes de WhatsApp automáticos para confirmar, reagendar o cancelar su cita. Tú no tienes que hacer nada.
        </Text>
      </View>

      {/* Lo que obtienes */}
      <Text style={s.sectionLabel}>LO QUE INCLUYE</Text>
      {[
        { icon: 'check-circle', color: '#10B981', bg: '#ECFDF5', title: 'Confirmación al agendar', desc: 'Tu cliente recibe un WhatsApp en cuanto registras su cita.' },
        { icon: 'schedule', color: '#3B82F6', bg: '#EFF6FF', title: 'Recordatorio 24 horas antes', desc: 'Un mensaje el día anterior con opción de confirmar, reagendar o cancelar.' },
        { icon: 'alarm', color: '#F59E0B', bg: '#FFFBEB', title: 'Recordatorio 2 horas antes', desc: 'Un segundo aviso si el cliente aún no ha confirmado.' },
        { icon: 'sync-alt', color: '#8B5CF6', bg: '#F5F3FF', title: 'Reagendamiento automático', desc: 'Si el cliente responde que quiere otro horario, VYLTA lo gestiona.' },
      ].map((item, i) => (
        <View key={i} style={s.featureRow}>
          <View style={[s.featureIcon, { backgroundColor: item.bg }]}>
            <MaterialIcons name={item.icon as any} size={20} color={item.color} />
          </View>
          <View style={s.featureText}>
            <Text style={s.featureTitle}>{item.title}</Text>
            <Text style={s.featureDesc}>{item.desc}</Text>
          </View>
        </View>
      ))}

      {/* CTA upgrade */}
      <View style={s.upgradeCta}>
        <Text style={s.upgradeCtaLabel}>DISPONIBLE DESDE</Text>
        <Text style={s.upgradeCtaPrice}>Plan Básico — $990 MXN/mes</Text>
        <Text style={s.upgradeCtaDesc}>
          Activa el Plan Básico y VYLTA enviará todos estos mensajes por ti desde un número verificado por Meta.
        </Text>
        <TouchableOpacity style={s.upgradeCtaBtn} onPress={() => router.push('/settings/subscription')}>
          <Text style={s.upgradeCtaBtnText}>Ver planes y activar →</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Pantalla Básico: explicación + toggles ───────────────────────────────────
function BasicoScreen({ config, onToggle }: { config: WhatsAppConfig; onToggle: (field: keyof WhatsAppConfig, value: boolean) => void }) {
  const router = useRouter();
  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

      {/* Banner principal */}
      <View style={s.basicoBanner}>
        <View style={s.basicoBannerTop}>
          <View style={s.basicoBannerIcon}>
            <MaterialIcons name="check-circle" size={28} color="#10B981" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.basicoBannerTitle}>WhatsApp incluido en tu plan</Text>
            <Text style={s.basicoBannerSub}>VYLTA envía los mensajes por ti</Text>
          </View>
        </View>
        <Text style={s.basicoBannerDesc}>
          No necesitas hacer nada técnico. Nosotros nos encargamos de enviar los mensajes a tus clientes desde un número verificado por WhatsApp.
        </Text>
      </View>

      {/* Cómo funciona paso a paso */}
      <Text style={s.sectionLabel}>CÓMO FUNCIONA</Text>
      <View style={s.stepsCard}>
        <Step number={1} title="Tú registras la cita en VYLTA">
          <Text style={s.stepDesc}>
            En cuanto guardas una cita, VYLTA detecta el número de teléfono de tu cliente y prepara el mensaje automáticamente.
          </Text>
        </Step>
        <Step number={2} title="Tu cliente recibe el WhatsApp">
          <Text style={s.stepDesc}>
            El mensaje llega desde el número oficial de VYLTA, verificado por Meta (WhatsApp). Tu cliente verá el nombre de tu negocio en el mensaje.
          </Text>
          <View style={{ marginTop: 10, marginBottom: 4 }}>
            <WaBubble
              from="VYLTA • Tu Negocio"
              text={'Hola 👋 Te recordamos tu cita en *Tu Negocio* mañana a las 10:00 AM.\n\n¿Confirmas tu asistencia?\n\n1️⃣ Sí, confirmo\n2️⃣ Reagendar\n3️⃣ Cancelar'}
            />
          </View>
        </Step>
        <Step number={3} title="Tu cliente responde y VYLTA actualiza la cita">
          <Text style={s.stepDesc}>
            Si confirma → la cita se marca como Confirmada en tu app.{'\n'}
            Si quiere reagendar → se abre un flujo de conversación para elegir nuevo horario.{'\n'}
            Si cancela → la cita se cancela automáticamente.
          </Text>
        </Step>
        <Step number={4} title="Tú ves todo en tiempo real">
          <Text style={s.stepDesc}>
            Desde tu app VYLTA puedes ver el estado de cada cita en todo momento. Sin llamadas, sin mensajes manuales.
          </Text>
        </Step>
      </View>

      {/* Ventanas de tiempo */}
      <Text style={s.sectionLabel}>CUÁNDO SE ENVÍAN LOS MENSAJES</Text>
      <View style={s.timelineCard}>
        {[
          { icon: '📋', time: 'Al agendar', title: 'Confirmación inmediata', desc: 'Tu cliente recibe el detalle de su cita en segundos.', color: '#10B981' },
          { icon: '🌙', time: '24h antes', title: 'Recordatorio del día anterior', desc: 'Permite al cliente confirmar o hacer cambios con tiempo.', color: '#3B82F6' },
          { icon: '⏰', time: '2h antes', title: 'Recordatorio final', desc: 'Solo se envía si el cliente NO confirmó en el recordatorio de 24h.', color: '#F59E0B' },
        ].map((item, i) => (
          <View key={i} style={[s.timelineRow, i < 2 && s.timelineRowBorder]}>
            <Text style={s.timelineEmoji}>{item.icon}</Text>
            <View style={s.timelineInfo}>
              <View style={[s.timeBadge, { backgroundColor: item.color + '20' }]}>
                <Text style={[s.timeBadgeText, { color: item.color }]}>{item.time}</Text>
              </View>
              <Text style={s.timelineTitle}>{item.title}</Text>
              <Text style={s.timelineDesc}>{item.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Nota importante */}
      <View style={s.noteBox}>
        <MaterialIcons name="info-outline" size={18} color="#3B82F6" />
        <Text style={s.noteText}>
          El número que ve tu cliente es el número oficial de VYLTA, compartido entre los negocios de la plataforma. Si quieres que tus clientes vean <Text style={{ fontWeight: '700' }}>tu propio número</Text>, puedes activar el Plan Premium.
        </Text>
      </View>

      {/* Toggles */}
      <Text style={s.sectionLabel}>ACTIVAR / DESACTIVAR MENSAJES</Text>
      <View style={s.togglesCard}>
        {[
          { field: 'confirmationOnBooking' as const, icon: 'check-circle', color: '#10B981', bg: '#ECFDF5', title: 'Confirmación al agendar', desc: 'Mensaje inmediato cuando registras una cita' },
          { field: 'reminder24h' as const, icon: 'schedule', color: '#3B82F6', bg: '#EFF6FF', title: 'Recordatorio 24h antes', desc: 'Un día antes con botones de respuesta' },
          { field: 'reminder2h' as const, icon: 'alarm', color: '#F59E0B', bg: '#FFFBEB', title: 'Recordatorio 2h antes', desc: 'Solo si el cliente no confirmó antes' },
        ].map((item, i, arr) => (
          <View key={item.field}>
            <View style={s.toggleRow}>
              <View style={[s.toggleIcon, { backgroundColor: item.bg }]}>
                <MaterialIcons name={item.icon as any} size={20} color={item.color} />
              </View>
              <View style={s.toggleInfo}>
                <Text style={s.toggleTitle}>{item.title}</Text>
                <Text style={s.toggleDesc}>{item.desc}</Text>
              </View>
              <Switch
                value={config[item.field] as boolean}
                onValueChange={v => onToggle(item.field, v)}
                trackColor={{ false: '#E2E8F0', true: item.color }}
                thumbColor="#fff"
              />
            </View>
            {i < arr.length - 1 && <View style={s.toggleDivider} />}
          </View>
        ))}
      </View>

      {/* Estado de activación */}
      <View style={s.pendingBox}>
        <Text style={s.pendingTitle}>⏳ En proceso de activación</Text>
        <Text style={s.pendingDesc}>
          Los mensajes automáticos se activarán en cuanto VYLTA complete el registro del número con WhatsApp (Meta). Este proceso ya está en marcha — te avisaremos por email cuando esté listo.
        </Text>
        <Text style={s.pendingNote}>
          Mientras tanto puedes seguir registrando clientes y citas con total normalidad.
        </Text>
      </View>

      {/* Upgrade a Premium */}
      <TouchableOpacity style={s.premiumTeaser} onPress={() => router.push('/settings/subscription')} activeOpacity={0.85}>
        <View style={s.premiumTeaserLeft}>
          <Text style={s.premiumTeaserEmoji}>⭐</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.premiumTeaserTitle}>Plan Premium — Tu número propio</Text>
            <Text style={s.premiumTeaserDesc}>Tus clientes ven tu número real. Mayor confianza, más reconocimiento.</Text>
          </View>
        </View>
        <MaterialIcons name="arrow-forward-ios" size={16} color="#6366F1" />
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Pantalla Premium: registro guiado ────────────────────────────────────────
function PremiumScreen({ config, onToggle }: { config: WhatsAppConfig; onToggle: (field: keyof WhatsAppConfig, value: boolean) => void }) {
  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

      {/* Banner Premium */}
      <View style={s.premiumBanner}>
        <View style={s.premiumBannerRow}>
          <View style={s.premiumBannerIcon}>
            <MaterialIcons name="verified" size={26} color="#6366F1" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.premiumBannerTitle}>Tu número propio de WhatsApp</Text>
            <Text style={s.premiumBannerSub}>Plan Premium activo</Text>
          </View>
        </View>
        <Text style={s.premiumBannerDesc}>
          Con tu plan Premium tus clientes recibirán los mensajes directamente desde el número de tu negocio — no desde un número genérico. Más confianza, más profesionalismo.
        </Text>
      </View>

      {/* Qué número usar */}
      <Text style={s.sectionLabel}>ANTES DE EMPEZAR — EL NÚMERO CORRECTO</Text>
      <View style={s.importantBox}>
        <Text style={s.importantTitle}>📱 ¿Qué número debo usar?</Text>
        <View style={s.importantRow}>
          <Text style={s.importantCheck}>✅</Text>
          <Text style={s.importantText}>Un número de teléfono dedicado <Text style={{ fontWeight: '700' }}>exclusivamente a tu negocio</Text></Text>
        </View>
        <View style={s.importantRow}>
          <Text style={s.importantCheck}>✅</Text>
          <Text style={s.importantText}>Puede ser fijo o celular, de cualquier operadora</Text>
        </View>
        <View style={s.importantRow}>
          <Text style={s.importantCheck}>✅</Text>
          <Text style={s.importantText}>Que pueda recibir llamadas o SMS para verificación</Text>
        </View>
        <View style={[s.importantRow, { marginTop: 10, backgroundColor: '#FEF2F2', borderRadius: 8, padding: 8 }]}>
          <Text style={s.importantCheck}>❌</Text>
          <Text style={[s.importantText, { color: '#991B1B' }]}>
            <Text style={{ fontWeight: '700' }}>No uses tu número personal.</Text> Una vez registrado en WhatsApp Business no podrás usarlo para WhatsApp personal.
          </Text>
        </View>
      </View>

      {/* Tiempo estimado */}
      <View style={s.timeBox}>
        <MaterialIcons name="access-time" size={20} color="#6366F1" />
        <View style={{ flex: 1 }}>
          <Text style={s.timeTitle}>¿Cuánto tarda en estar listo?</Text>
          <Text style={s.timeDesc}>
            El proceso completo toma entre <Text style={{ fontWeight: '700' }}>3 y 7 días hábiles</Text>. Mientras tanto puedes seguir usando VYLTA con normalidad — registrando clientes, agendando citas y explorando la app.
          </Text>
        </View>
      </View>

      {/* Pasos */}
      <Text style={s.sectionLabel}>PROCESO DE ACTIVACIÓN</Text>
      <View style={s.stepsCard}>
        <Step number={1} title="Contáctanos con tu número">
          <Text style={s.stepDesc}>
            Escríbenos al soporte de VYLTA con el número que quieres usar para tu negocio. Nosotros iniciamos el proceso de registro con WhatsApp.
          </Text>
          <View style={s.stepNote}>
            <MaterialIcons name="info-outline" size={14} color="#6366F1" />
            <Text style={s.stepNoteText}>Nuestro equipo te guía en cada paso — no necesitas experiencia técnica.</Text>
          </View>
        </Step>
        <Step number={2} title="Verificación de Meta Business">
          <Text style={s.stepDesc}>
            WhatsApp (Meta) verificará que el número pertenece a un negocio real. Te pediremos algunos datos básicos de tu empresa (nombre, dirección, giro).
          </Text>
          <View style={s.stepNote}>
            <MaterialIcons name="schedule" size={14} color="#F59E0B" />
            <Text style={s.stepNoteText}>Duración aproximada: 1 a 3 días hábiles.</Text>
          </View>
        </Step>
        <Step number={3} title="Activación en VYLTA">
          <Text style={s.stepDesc}>
            Una vez aprobado, conectamos tu número a VYLTA. A partir de ese momento todos los recordatorios saldrán desde tu número propio.
          </Text>
          <View style={s.stepNote}>
            <MaterialIcons name="check-circle" size={14} color="#10B981" />
            <Text style={s.stepNoteText}>Te avisamos por email y notificación cuando esté activo.</Text>
          </View>
        </Step>
        <Step number={4} title="¡Listo! Tus clientes te reconocen">
          <Text style={s.stepDesc}>
            Tus clientes verán exactamente el nombre y número de tu negocio al recibir los mensajes. Igual que si les escribieras tú personalmente.
          </Text>
          <View style={{ marginTop: 10 }}>
            <WaBubble
              from="Spa Valentina • +52 55 1234 5678"
              text={'Hola 👋 Te recordamos tu cita en *Spa Valentina* mañana a las 10:00 AM.\n\n¿Confirmas?\n\n1️⃣ Sí, confirmo\n2️⃣ Reagendar\n3️⃣ Cancelar'}
            />
          </View>
        </Step>
      </View>

      {/* Estado y mensajes mientras espera */}
      <View style={s.pendingBox}>
        <Text style={s.pendingTitle}>⏳ Tu activación está en progreso</Text>
        <Text style={s.pendingDesc}>
          Mientras completamos el proceso, tus clientes seguirán recibiendo mensajes desde el número compartido de VYLTA. Ninguna cita quedará sin recordatorio.
        </Text>
        <Text style={s.pendingNote}>
          ¿Tienes dudas? Escríbenos desde el soporte de la app y te respondemos en menos de 24 horas.
        </Text>
      </View>

      {/* Toggles de automatización */}
      <Text style={s.sectionLabel}>MENSAJES AUTOMÁTICOS</Text>
      <View style={s.togglesCard}>
        {[
          { field: 'confirmationOnBooking' as const, icon: 'check-circle', color: '#10B981', bg: '#ECFDF5', title: 'Confirmación al agendar', desc: 'Mensaje inmediato cuando registras una cita' },
          { field: 'reminder24h' as const, icon: 'schedule', color: '#3B82F6', bg: '#EFF6FF', title: 'Recordatorio 24h antes', desc: 'Un día antes con botones de respuesta' },
          { field: 'reminder2h' as const, icon: 'alarm', color: '#F59E0B', bg: '#FFFBEB', title: 'Recordatorio 2h antes', desc: 'Solo si el cliente no confirmó antes' },
        ].map((item, i, arr) => (
          <View key={item.field}>
            <View style={s.toggleRow}>
              <View style={[s.toggleIcon, { backgroundColor: item.bg }]}>
                <MaterialIcons name={item.icon as any} size={20} color={item.color} />
              </View>
              <View style={s.toggleInfo}>
                <Text style={s.toggleTitle}>{item.title}</Text>
                <Text style={s.toggleDesc}>{item.desc}</Text>
              </View>
              <Switch
                value={config[item.field] as boolean}
                onValueChange={v => onToggle(item.field, v)}
                trackColor={{ false: '#E2E8F0', true: item.color }}
                thumbColor="#fff"
              />
            </View>
            {i < arr.length - 1 && <View style={s.toggleDivider} />}
          </View>
        ))}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function WhatsAppSettingsScreen() {
  const router = useRouter();
  const { isGratuito, isBasico, isPremium } = usePlan();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<WhatsAppConfig>({
    isConnected: false, reminder24h: true, reminder2h: true,
    confirmationOnBooking: true, waitlistNotification: false,
  });
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });

  useEffect(() => { loadConfig(); }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await apiGet<WhatsAppConfig | null>('/api/whatsapp-config');
      if (data) setConfig(data);
    } catch {
      // usar defaults
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (field: keyof WhatsAppConfig, value: boolean) => {
    const prev = config;
    setConfig(c => ({ ...c, [field]: value }));
    try {
      await apiPut('/api/whatsapp-config', { ...config, [field]: value });
    } catch {
      setConfig(prev);
      setErrorModal({ visible: true, message: 'Error al guardar la configuración' });
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ConfirmModal visible={errorModal.visible} title="Error" message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'cancel' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <MaterialIcons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={s.headerMid}>
          <Text style={s.title}>WhatsApp Business</Text>
          <Text style={s.subtitle}>
            {isGratuito ? 'Disponible desde Plan Básico' :
             isBasico   ? 'Número compartido VYLTA' :
                          'Tu número propio'}
          </Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {isGratuito && <GratuitoScreen />}
      {isBasico   && <BasicoScreen  config={config} onToggle={handleToggle} />}
      {isPremium  && <PremiumScreen config={config} onToggle={handleToggle} />}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0',
  },
  back: { padding: 4 },
  headerMid: { flex: 1, paddingHorizontal: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 12, color: '#94A3B8', marginTop: 1 },
  scroll: { padding: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.2, marginBottom: 10, marginTop: 20 },

  // ── Gratuito ──────────────────────────────────────────────────────────────
  heroCard: { backgroundColor: '#ECFDF5', borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 0.5, borderColor: '#BBF7D0', marginBottom: 4 },
  heroEmoji: { fontSize: 48, marginBottom: 12 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#065F46', marginBottom: 8, textAlign: 'center' },
  heroDesc: { fontSize: 14, color: '#047857', textAlign: 'center', lineHeight: 22 },
  featureRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  featureIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  featureText: { flex: 1 },
  featureTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 3 },
  featureDesc: { fontSize: 12, color: '#64748B', lineHeight: 18 },
  upgradeCta: { backgroundColor: '#0F172A', borderRadius: 20, padding: 24, alignItems: 'center', marginTop: 8 },
  upgradeCtaLabel: { fontSize: 10, fontWeight: '800', color: '#64748B', letterSpacing: 1.5, marginBottom: 6 },
  upgradeCtaPrice: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 10 },
  upgradeCtaDesc: { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  upgradeCtaBtn: { backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28 },
  upgradeCtaBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // ── Básico ────────────────────────────────────────────────────────────────
  basicoBanner: { backgroundColor: '#F0FDF4', borderRadius: 16, padding: 16, borderWidth: 0.5, borderColor: '#BBF7D0', marginBottom: 4 },
  basicoBannerTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  basicoBannerIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center' },
  basicoBannerTitle: { fontSize: 15, fontWeight: '700', color: '#065F46' },
  basicoBannerSub: { fontSize: 12, color: '#10B981', marginTop: 2, fontWeight: '600' },
  basicoBannerDesc: { fontSize: 13, color: '#047857', lineHeight: 20 },

  stepsCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1, marginBottom: 4 },
  stepDesc: { fontSize: 13, color: '#64748B', lineHeight: 20 },
  stepNote: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F8FAFC', borderRadius: 8, padding: 8, marginTop: 8 },
  stepNoteText: { fontSize: 12, color: '#64748B', flex: 1 },

  timelineCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1, marginBottom: 4 },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 16 },
  timelineRowBorder: { borderBottomWidth: 0.5, borderBottomColor: '#F1F5F9' },
  timelineEmoji: { fontSize: 24, width: 32, textAlign: 'center' },
  timelineInfo: { flex: 1, gap: 4 },
  timeBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  timeBadgeText: { fontSize: 11, fontWeight: '700' },
  timelineTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  timelineDesc: { fontSize: 12, color: '#64748B', lineHeight: 18 },

  noteBox: { flexDirection: 'row', gap: 10, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: '#BFDBFE', marginBottom: 4 },
  noteText: { flex: 1, fontSize: 12, color: '#1E40AF', lineHeight: 18 },

  togglesCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1, marginBottom: 4 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  toggleIcon: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  toggleInfo: { flex: 1 },
  toggleTitle: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  toggleDesc: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  toggleDivider: { height: 0.5, backgroundColor: '#F1F5F9', marginLeft: 68 },

  pendingBox: { backgroundColor: '#FFFBEB', borderRadius: 14, padding: 16, borderWidth: 0.5, borderColor: '#FDE68A', marginBottom: 12 },
  pendingTitle: { fontSize: 14, fontWeight: '700', color: '#92400E', marginBottom: 6 },
  pendingDesc: { fontSize: 13, color: '#B45309', lineHeight: 20, marginBottom: 6 },
  pendingNote: { fontSize: 12, color: '#92400E', fontStyle: 'italic' },

  premiumTeaser: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#C7D2FE', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  premiumTeaserLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  premiumTeaserEmoji: { fontSize: 24 },
  premiumTeaserTitle: { fontSize: 14, fontWeight: '700', color: '#3730A3', marginBottom: 3 },
  premiumTeaserDesc: { fontSize: 12, color: '#6366F1', lineHeight: 18 },

  // ── Premium ───────────────────────────────────────────────────────────────
  premiumBanner: { backgroundColor: '#F5F3FF', borderRadius: 16, padding: 16, borderWidth: 0.5, borderColor: '#C4B5FD', marginBottom: 4 },
  premiumBannerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  premiumBannerIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#EDE9FE', justifyContent: 'center', alignItems: 'center' },
  premiumBannerTitle: { fontSize: 15, fontWeight: '700', color: '#3730A3' },
  premiumBannerSub: { fontSize: 12, color: '#6366F1', marginTop: 2, fontWeight: '600' },
  premiumBannerDesc: { fontSize: 13, color: '#4338CA', lineHeight: 20 },

  importantBox: { backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1, marginBottom: 4 },
  importantTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  importantRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  importantCheck: { fontSize: 16, width: 24 },
  importantText: { flex: 1, fontSize: 13, color: '#374151', lineHeight: 20 },

  timeBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#EEF2FF', borderRadius: 12, padding: 14, borderWidth: 0.5, borderColor: '#C7D2FE', marginBottom: 4 },
  timeTitle: { fontSize: 14, fontWeight: '700', color: '#3730A3', marginBottom: 4 },
  timeDesc: { fontSize: 13, color: '#4338CA', lineHeight: 20 },
});
