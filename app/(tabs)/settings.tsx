
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Switch, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { usePlan } from '@/contexts/PlanContext';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { getCached, setCached } from '@/utils/cache';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, ThemeMode } from '@/contexts/ThemeContext';
import { apiGet } from '@/utils/api';
import { supabase } from '@/lib/supabase';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { getPlanDisplayName, getPlanPrice, getPlanEmoji } from '@/utils/planLabels';

interface WhatsAppConfig {
  isConnected: boolean;
  confirmationOnBooking: boolean;
  reminder24h: boolean;
  reminder2h: boolean;
}
interface Subscription { planType: 'Basico' | 'Premium' | 'Gratuito'; price: string; }

function SettingRow({
  iconName, iconColor, iconBg, label, sublabel, badge, right, onPress, danger, disabled,
}: {
  iconName: string; iconColor: string; iconBg: string;
  label: string; sublabel?: string; badge?: React.ReactNode;
  right?: React.ReactNode; onPress?: () => void; danger?: boolean; disabled?: boolean;
}) {
  const { colors: tc } = useTheme();
  return (
    <TouchableOpacity
      style={[row.container, { backgroundColor: tc.surface }, disabled && row.containerDisabled]}
      onPress={disabled ? undefined : onPress}
      activeOpacity={onPress && !disabled ? 0.7 : 1}
      disabled={!onPress || disabled}
    >
      <View style={[row.iconBox, { backgroundColor: disabled ? '#F1F5F9' : iconBg }]}>
        <IconSymbol android_material_icon_name={iconName as any} size={20} color={disabled ? '#CBD5E1' : iconColor} />
      </View>
      <View style={row.textBox}>
        <View style={row.labelRow}>
          <Text style={[
            row.label,
            { color: danger ? '#EF4444' : disabled ? '#CBD5E1' : tc.text },
          ]}>{label}</Text>
          {badge}
        </View>
        {sublabel ? <Text style={[row.sublabel, { color: disabled ? '#CBD5E1' : tc.textMuted }]}>{sublabel}</Text> : null}
      </View>
      {right !== undefined ? right : (onPress && !disabled ? <IconSymbol android_material_icon_name="arrow-forward-ios" size={16} color={tc.border} /> : null)}
    </TouchableOpacity>
  );
}

const row = StyleSheet.create({
  container:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, gap: 14 },
  containerDisabled: { opacity: 0.5 },
  iconBox:           { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  textBox:           { flex: 1 },
  labelRow:          { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label:             { fontSize: 15, fontWeight: '500' },
  sublabel:          { fontSize: 12, marginTop: 2 },
});

function SettingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors: tc } = useTheme();
  const items = React.Children.toArray(children);
  return (
    <View style={grp.wrapper}>
      <Text style={[grp.title, { color: tc.textMuted }]}>{title}</Text>
      <View style={[grp.card, { backgroundColor: tc.surface, shadowColor: tc.shadow }]}>
        {items.map((child, i) => (
          <React.Fragment key={i}>
            {child}
            {i < items.length - 1 && <View style={[grp.divider, { backgroundColor: tc.border }]} />}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

const grp = StyleSheet.create({
  wrapper: { marginBottom: 24 },
  title:   { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8, paddingHorizontal: 4 },
  card:    { borderRadius: 16, overflow: 'hidden', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  divider: { height: 1, marginLeft: 66 },
});

export default function SettingsScreen() {
  const router = useRouter();
  const { user, businessProfile, signOut } = useAuth();
  const { canOverlap, isPremium, isBasico, isGratuito, canUseBookingLink, canUseWhatsApp, canUseCollaborators, plan } = usePlan();
  const { colors: tc, mode, setMode, isDark } = useTheme();

  const [logoutModal, setLogoutModal]           = useState(false);
  const [deleteModal, setDeleteModal]           = useState(false);
  const [deleting, setDeleting]                 = useState(false);
  const [whatsappConfig, setWhatsappConfig]     = useState<WhatsAppConfig | null>(null);
  const [allowOverlapping, setAllowOverlapping] = useState(false);
  const [savingOverlap, setSavingOverlap]       = useState(false);
  const [birthdayEnabled, setBirthdayEnabled]   = useState(false);
  const [bookingLinkActive, setBookingLinkActive] = useState(false);
  const [subscription, setSubscription]         = useState<Subscription | null>(null);
  const [loading, setLoading]                   = useState(true);
  const [staffCount, setStaffCount]             = useState(0);
  const [timeBlocksCount, setTimeBlocksCount]   = useState(0);

  const canUseAISupport = isBasico || isPremium;

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async (forceRefresh = false) => {
    const cachedWA  = getCached<any>('settings_whatsapp');
    const cachedSub = getCached<any>('settings_subscription');
    if (!forceRefresh && cachedWA && cachedSub) {
      setWhatsappConfig(cachedWA); setSubscription(cachedSub); setLoading(false); return;
    }
    setLoading(true);
    try {
      const [whatsappData, subscriptionData] = await Promise.all([
        apiGet<WhatsAppConfig | null>('/api/whatsapp-config').catch(() => null),
        apiGet<Subscription>('/api/subscription').catch(() => null),
      ]);
      if (whatsappData) setCached('settings_whatsapp', whatsappData);
      const { data: bpData } = await supabase
        .from('business_profiles')
        .select('allow_overlapping, birthday_reminders_enabled')
        .eq('user_id', user?.id).single();
      if (bpData) {
        setAllowOverlapping(bpData.allow_overlapping || false);
        setBirthdayEnabled(bpData.birthday_reminders_enabled || false);
      }
      const { data: blData } = await supabase
        .from('booking_links').select('is_active').eq('user_id', user?.id).single();
      if (blData) setBookingLinkActive(blData.is_active || false);
      const { count } = await supabase
        .from('staff_members').select('id', { count: 'exact', head: true })
        .eq('user_id', user?.id).eq('is_active', true);
      setStaffCount(count || 0);
      // Cargar conteo de bloqueos de tiempo activos para mostrar en sublabel
      const { count: tbCount } = await supabase
        .from('time_blocks').select('id', { count: 'exact', head: true })
        .eq('user_id', user?.id).eq('is_active', true);
      setTimeBlocksCount(tbCount || 0);
      if (subscriptionData) setCached('settings_subscription', subscriptionData);
      setWhatsappConfig(whatsappData); setSubscription(subscriptionData);
    } catch (error) {
      console.error('[Settings] Failed to load:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLogoutModal(false);
    try { await signOut(); } finally { router.replace('/auth/login'); }
  };

  const handleOverlappingToggle = async (value: boolean) => {
    if (!canOverlap) { router.push('/settings/subscription'); return; }
    setAllowOverlapping(value); setSavingOverlap(true);
    try {
      await supabase.from('business_profiles').update({ allow_overlapping: value }).eq('user_id', user?.id);
    } catch { setAllowOverlapping(!value); } finally { setSavingOverlap(false); }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.rpc('delete_user_account');
      if (error) throw error;
      await signOut();
    } catch { alert('Error al eliminar la cuenta. Intenta de nuevo.'); } finally { setDeleting(false); }
  };

  const planDisplay = getPlanDisplayName(plan.planType);
  const planPrice   = getPlanPrice(plan.planType);
  const planEmoji   = getPlanEmoji(plan.planType);
  const planColor   = isPremium ? '#6366F1' : isBasico ? '#10B981' : '#94A3B8';
  const planBg      = isPremium ? '#EDE9FE' : isBasico ? '#ECFDF5' : '#F1F5F9';
  const initials = user?.name?.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || 'U';

  const waActive = canUseWhatsApp && (whatsappConfig?.confirmationOnBooking || whatsappConfig?.reminder24h || whatsappConfig?.reminder2h);
  const waSubLabel = isGratuito ? 'Disponible en Plan Premium' : waActive ? 'Recordatorios activos · Número VYLTA' : 'Recordatorios desactivados';
  const staffSublabel = !canUseCollaborators ? 'Solo disponible en Plan Luxury' : staffCount > 0 ? `${staffCount} colaborador${staffCount !== 1 ? 'es' : ''} activo${staffCount !== 1 ? 's' : ''} (máx. 5)` : 'Sin colaboradores — toca para agregar';
  const timeBlocksSublabel = timeBlocksCount > 0
    ? `${timeBlocksCount} bloqueo${timeBlocksCount !== 1 ? 's' : ''} activo${timeBlocksCount !== 1 ? 's' : ''}`
    : 'Horarios de comida y descansos';

  if (loading) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]}>
        <View style={s.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]}>
      <ConfirmModal visible={logoutModal} title="Cerrar sesión" message="¿Estás seguro de que deseas cerrar sesión?" buttons={[{ text: 'Cerrar sesión', onPress: handleLogout, style: 'destructive' }, { text: 'Cancelar', onPress: () => setLogoutModal(false), style: 'cancel' }]} onDismiss={() => setLogoutModal(false)} />
      <ConfirmModal visible={deleteModal} title="⚠️ Eliminar cuenta" message="Se eliminarán TODOS tus datos permanentemente. Esta acción no tiene vuelta atrás." buttons={[{ text: 'Cancelar', onPress: () => setDeleteModal(false), style: 'cancel' }, { text: deleting ? 'Eliminando...' : 'Sí, eliminar todo', onPress: () => { setDeleteModal(false); handleDeleteAccount(); }, style: 'destructive' }]} onDismiss={() => setDeleteModal(false)} />

      <View style={[s.header, { backgroundColor: tc.bg }]}>
        <Text style={[s.headerTitle, { color: tc.text }]}>Ajustes</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={[s.heroCard, { backgroundColor: tc.surface, shadowColor: tc.shadow }]} onPress={() => router.push('/settings/profile')} activeOpacity={0.85}>
          <View style={s.heroAvatarWrap}>
            {businessProfile?.logoUrl ? <Image source={{ uri: businessProfile.logoUrl }} style={s.heroAvatar} /> : <View style={[s.heroAvatar, s.heroAvatarFallback]}><Text style={s.heroAvatarText}>{initials}</Text></View>}
            <View style={[s.heroOnline, { borderColor: tc.surface }]} />
          </View>
          <View style={s.heroInfo}>
            <Text style={[s.heroName, { color: tc.text }]}>{user?.name || 'Usuario'}</Text>
            <Text style={[s.heroEmail, { color: tc.textMuted }]}>{user?.email}</Text>
            {businessProfile?.businessName ? <Text style={s.heroBusiness}>{businessProfile.businessName}</Text> : null}
          </View>
          <MaterialIcons name="arrow-forward-ios" size={16} color={tc.border} />
        </TouchableOpacity>

        <TouchableOpacity style={[s.planCard, { backgroundColor: tc.surface, borderColor: planColor, shadowColor: tc.shadow }]} onPress={() => router.push('/settings/subscription')} activeOpacity={0.85}>
          <View style={[s.planIconBox, { backgroundColor: planBg }]}><Text style={s.planEmoji}>{planEmoji}</Text></View>
          <View style={s.planInfo}>
            <View style={s.planRow}>
              <Text style={[s.planName, { color: tc.text }]}>Plan {planDisplay}</Text>
              <View style={[s.planBadge, { backgroundColor: planBg }]}><Text style={[s.planBadgeText, { color: planColor }]}>{planDisplay.toUpperCase()}</Text></View>
            </View>
            <Text style={[s.planPrice, { color: tc.textMuted }]}>{planPrice}</Text>
            {!isPremium && <Text style={s.planUpgrade}>{isGratuito ? 'Activa recordatorios y reportes →' : 'Activa equipo, email marketing y más →'}</Text>}
          </View>
          <MaterialIcons name="arrow-forward-ios" size={16} color={planColor} />
        </TouchableOpacity>

        <SettingGroup title="MI NEGOCIO">
          <SettingRow iconName="store" iconColor="#10B981" iconBg="#ECFDF5" label="Información del negocio" sublabel={businessProfile?.businessName || 'Configura tu negocio'} onPress={() => router.push('/settings/business')} />
          <SettingRow iconName="schedule" iconColor="#3B82F6" iconBg="#EFF6FF" label="Horarios de atención" sublabel="Configura tu disponibilidad" onPress={() => router.push('/settings/schedule')} />
          <SettingRow iconName="content-cut" iconColor="#F59E0B" iconBg="#FFFBEB" label="Catálogo de servicios" sublabel="Gestiona tus servicios y precios" onPress={() => router.push('/settings/services')} />
          <SettingRow iconName="group" iconColor={canUseCollaborators ? '#8B5CF6' : '#CBD5E1'} iconBg={canUseCollaborators ? '#F5F3FF' : '#F8FAFC'} label="Mi equipo" sublabel={staffSublabel} badge={!canUseCollaborators ? <View style={s.luxuryChip}><Text style={s.luxuryChipText}>LUXURY</Text></View> : undefined} disabled={!canUseCollaborators} onPress={() => { if (!canUseCollaborators) { router.push('/settings/subscription'); return; } router.push('/settings/staff' as any); }} />
          <SettingRow iconName="event-available" iconColor={canOverlap ? '#06B6D4' : '#CBD5E1'} iconBg={canOverlap ? '#ECFEFF' : '#F8FAFC'} label="Citas simultáneas" sublabel={canOverlap ? 'Permite atender más de una cita al mismo tiempo' : 'Solo disponible en Plan Luxury'} badge={!canOverlap ? <View style={s.luxuryChip}><Text style={s.luxuryChipText}>LUXURY</Text></View> : undefined} disabled={!canOverlap} right={<Switch value={allowOverlapping} onValueChange={canOverlap ? handleOverlappingToggle : () => router.push('/settings/subscription')} trackColor={{ false: '#E2E8F0', true: '#10B981' }} thumbColor="#fff" disabled={savingOverlap || !canOverlap} />} />
          {/* Nuevo: bloqueos de tiempo (horario de comida, descansos, etc.) */}
          <SettingRow iconName="lunch-dining" iconColor="#F59E0B" iconBg="#FFFBEB" label="Bloqueos de tiempo" sublabel={timeBlocksSublabel} onPress={() => router.push('/settings/time-blocks' as any)} />
        </SettingGroup>

        <SettingGroup title="CAPTACIÓN DE CLIENTES">
          <SettingRow iconName="link" iconColor="#10B981" iconBg="#ECFDF5" label="Link de cita pública" sublabel={canUseBookingLink ? (bookingLinkActive ? 'Activo — clientes pueden agendar en línea' : 'Inactivo — toca para configurar') : 'Disponible en Plan Premium'} badge={!canUseBookingLink ? <View style={s.premiumChip}><Text style={s.premiumChipText}>PREMIUM</Text></View> : undefined} right={canUseBookingLink ? (<View style={[s.waBadge, { backgroundColor: bookingLinkActive ? '#ECFDF5' : '#F1F5F9' }]}><View style={[s.waDot, { backgroundColor: bookingLinkActive ? '#10B981' : '#94A3B8' }]} /><Text style={[s.waText, { color: bookingLinkActive ? '#10B981' : '#64748B' }]}>{bookingLinkActive ? 'Activo' : 'Inactivo'}</Text></View>) : undefined} onPress={() => canUseBookingLink ? router.push('/settings/booking-link') : router.push('/settings/subscription')} />
        </SettingGroup>

        <SettingGroup title="AUTOMATIZACIONES">
          <SettingRow iconName="cake" iconColor="#EC4899" iconBg="#FDF2F8" label="Cumpleaños automáticos" sublabel={birthdayEnabled ? 'Activado — envía WhatsApp el día del cumpleaños' : 'Desactivado'} badge={!isPremium ? <View style={s.luxuryChip}><Text style={s.luxuryChipText}>LUXURY</Text></View> : undefined} right={<View style={s.statusRight}>{birthdayEnabled && <View style={[s.statusDot, { backgroundColor: '#EC4899' }]} />}<MaterialIcons name="arrow-forward-ios" size={16} color={tc.border} /></View>} onPress={() => isPremium ? router.push('/settings/birthday') : router.push('/settings/subscription')} />
          <SettingRow iconName="email" iconColor="#6366F1" iconBg="#EEF2FF" label="Email Marketing" sublabel="Envía campañas y promociones a tus clientes" badge={!isPremium ? <View style={s.luxuryChip}><Text style={s.luxuryChipText}>LUXURY</Text></View> : undefined} onPress={() => isPremium ? router.push('/marketing') : router.push('/settings/subscription')} />
          <SettingRow iconName="person-search" iconColor="#F59E0B" iconBg="#FFFBEB" label="Recuperar clientes inactivos" sublabel="Detecta y reactiva clientes sin visita reciente" badge={!isPremium ? <View style={s.luxuryChip}><Text style={s.luxuryChipText}>LUXURY</Text></View> : undefined} onPress={() => isPremium ? router.push('/clients/inactive') : router.push('/settings/subscription')} />
        </SettingGroup>

        <SettingGroup title="WHATSAPP BUSINESS">
          <SettingRow iconName="message" iconColor="#25D366" iconBg="#F0FDF4" label="Recordatorios automáticos" sublabel={waSubLabel} badge={isGratuito ? <View style={s.premiumChip}><Text style={s.premiumChipText}>PREMIUM</Text></View> : undefined} right={!isGratuito ? (<View style={[s.waBadge, { backgroundColor: waActive ? '#ECFDF5' : '#FEF3C7' }]}><View style={[s.waDot, { backgroundColor: waActive ? '#10B981' : '#F59E0B' }]} /><Text style={[s.waText, { color: waActive ? '#10B981' : '#92400E' }]}>{waActive ? 'Activos' : 'Inactivos'}</Text></View>) : undefined} onPress={() => router.push('/settings/whatsapp')} />
        </SettingGroup>

        <SettingGroup title="APARIENCIA">
          <View style={[row.container, { backgroundColor: tc.surface }]}>
            <View style={[row.iconBox, { backgroundColor: isDark ? '#1E3A5F' : '#EFF6FF' }]}>
              <MaterialIcons name={isDark ? 'dark-mode' : 'light-mode'} size={20} color={isDark ? '#60A5FA' : '#F59E0B'} />
            </View>
            <View style={row.textBox}>
              <Text style={[row.label, { color: tc.text }]}>Tema de la app</Text>
              <Text style={[row.sublabel, { color: tc.textMuted }]}>{isDark ? 'Modo oscuro activado' : 'Modo claro activado'}</Text>
            </View>
            <View style={s.themeToggleWrap}>
              {(['light', 'dark'] as ThemeMode[]).map((m) => (
                <TouchableOpacity key={m} style={[s.themeOption, { borderColor: tc.border, backgroundColor: tc.bg }, mode === m && s.themeOptionActive]} onPress={() => setMode(m)} activeOpacity={0.75}>
                  <MaterialIcons name={m === 'light' ? 'light-mode' : 'dark-mode'} size={18} color={mode === m ? '#fff' : tc.textMuted} />
                  <Text style={[s.themeOptionText, mode === m && { color: '#fff' }]}>{m === 'light' ? 'Claro' : 'Oscuro'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </SettingGroup>

        <SettingGroup title="CUENTA">
          <SettingRow iconName="person" iconColor="#6366F1" iconBg="#EEF2FF" label="Editar perfil" onPress={() => router.push('/settings/profile')} />
          <SettingRow iconName="lock" iconColor="#8B5CF6" iconBg="#F5F3FF" label="Cambiar contraseña" onPress={() => router.push('/settings/password')} />
          <SettingRow iconName="description" iconColor="#64748B" iconBg="#F8FAFC" label="Legal y Privacidad" onPress={() => router.push('/legal')} />
          <SettingRow iconName="file-download" iconColor="#3B82F6" iconBg="#EFF6FF" label="Exportar mis datos" sublabel="Descarga tus citas y clientes en CSV" onPress={() => router.push('/settings/export-data')} />
        </SettingGroup>

        <SettingGroup title="SOPORTE">
          <SettingRow iconName="support-agent" iconColor={canUseAISupport ? '#10B981' : '#CBD5E1'} iconBg={canUseAISupport ? '#ECFDF5' : '#F8FAFC'} label="Chat con IA · Soporte" sublabel={canUseAISupport ? 'Pregunta lo que quieras sobre VYLTA' : 'Disponible en Plan Premium y Luxury'} badge={!canUseAISupport ? <View style={s.premiumChip}><Text style={s.premiumChipText}>PREMIUM</Text></View> : undefined} right={canUseAISupport ? (<View style={s.aiChip}><MaterialIcons name="auto-awesome" size={12} color="#10B981" /><Text style={s.aiChipText}>IA</Text></View>) : undefined} onPress={() => canUseAISupport ? router.push('/settings/support-chat') : router.push('/settings/subscription')} />
        </SettingGroup>

        <SettingGroup title="SESIÓN">
          <SettingRow iconName="logout" iconColor="#EF4444" iconBg="#FEF2F2" label="Cerrar sesión" danger onPress={() => setLogoutModal(true)} />
          <SettingRow iconName="delete-forever" iconColor="#EF4444" iconBg="#FEF2F2" label="Eliminar mi cuenta" sublabel="Esta acción es permanente e irreversible" danger onPress={() => setDeleteModal(true)} />
        </SettingGroup>

        <View style={s.footer}>
          <Text style={[s.footerBrand, { color: tc.border }]}>VYLTA</Text>
          <Text style={[s.footerTagline, { color: tc.border }]}>Cada cliente regresa</Text>
          <Text style={[s.footerVersion, { color: tc.border }]}>v1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerTitle: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  scroll: { padding: 20, paddingBottom: 100 },
  heroCard: { borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  heroAvatarWrap: { position: 'relative' },
  heroAvatar: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: '#E2E8F0' },
  heroAvatarFallback: { backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
  heroAvatarText: { fontSize: 22, fontWeight: '800', color: '#fff' },
  heroOnline: { position: 'absolute', bottom: 1, right: 1, width: 14, height: 14, borderRadius: 7, backgroundColor: '#10B981', borderWidth: 2 },
  heroInfo: { flex: 1 },
  heroName: { fontSize: 17, fontWeight: '700' },
  heroEmail: { fontSize: 12, marginTop: 2 },
  heroBusiness: { fontSize: 12, color: '#10B981', fontWeight: '600', marginTop: 4 },
  planCard: { borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 28, borderWidth: 1.5, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  planIconBox: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  planEmoji: { fontSize: 24 },
  planInfo: { flex: 1 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  planName: { fontSize: 16, fontWeight: '700' },
  planBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  planBadgeText: { fontSize: 10, fontWeight: '800' },
  planPrice: { fontSize: 13, marginBottom: 2 },
  planUpgrade: { fontSize: 12, color: '#6366F1', fontWeight: '600' },
  waBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  waDot: { width: 7, height: 7, borderRadius: 4 },
  waText: { fontSize: 12, fontWeight: '700' },
  luxuryChip: { backgroundColor: '#FFFBEB', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  luxuryChipText: { fontSize: 9, fontWeight: '800', color: '#92400E' },
  premiumChip: { backgroundColor: '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  premiumChipText: { fontSize: 9, fontWeight: '800', color: '#065F46' },
  statusRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  themeToggleWrap: { flexDirection: 'row', gap: 6 },
  themeOption: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  themeOptionActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
  themeOptionText: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  aiChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 0.5, borderColor: '#10B981' },
  aiChipText: { fontSize: 11, fontWeight: '800', color: '#10B981' },
  footer: { alignItems: 'center', paddingTop: 8, paddingBottom: 16, gap: 4 },
  footerBrand: { fontSize: 16, fontWeight: '900', letterSpacing: 3 },
  footerTagline: { fontSize: 12, fontStyle: 'italic' },
  footerVersion: { fontSize: 11 },
});
