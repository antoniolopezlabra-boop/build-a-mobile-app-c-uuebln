
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
import { apiGet } from '@/utils/api';

interface WhatsAppConfig { isConnected: boolean; phoneNumber?: string; }
interface Subscription { planType: 'Basico' | 'Premium' | 'Gratuito'; price: string; }

function SettingRow({
  iconName, iconColor, iconBg, label, sublabel, badge, right, onPress, danger,
}: {
  iconName: string; iconColor: string; iconBg: string;
  label: string; sublabel?: string; badge?: React.ReactNode;
  right?: React.ReactNode; onPress?: () => void; danger?: boolean;
}) {
  return (
    <TouchableOpacity style={row.container} onPress={onPress} activeOpacity={onPress ? 0.7 : 1} disabled={!onPress}>
      <View style={[row.iconBox, { backgroundColor: iconBg }]}>
        <IconSymbol android_material_icon_name={iconName as any} size={20} color={iconColor} />
      </View>
      <View style={row.textBox}>
        <View style={row.labelRow}>
          <Text style={[row.label, danger && row.labelDanger]}>{label}</Text>
          {badge}
        </View>
        {sublabel ? <Text style={row.sublabel}>{sublabel}</Text> : null}
      </View>
      {right !== undefined ? right : (onPress ? <IconSymbol android_material_icon_name="arrow-forward-ios" size={16} color="#CBD5E1" /> : null)}
    </TouchableOpacity>
  );
}

const row = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, backgroundColor: '#fff', gap: 14 },
  iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  textBox: { flex: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 15, fontWeight: '500', color: '#0F172A' },
  labelDanger: { color: '#EF4444' },
  sublabel: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
});

function SettingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  return (
    <View style={grp.wrapper}>
      <Text style={grp.title}>{title}</Text>
      <View style={grp.card}>
        {items.map((child, i) => (
          <React.Fragment key={i}>
            {child}
            {i < items.length - 1 && <View style={grp.divider} />}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

const grp = StyleSheet.create({
  wrapper: { marginBottom: 28 },
  title: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.2, marginBottom: 8, paddingHorizontal: 4 },
  card: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginLeft: 66 },
});

export default function SettingsScreen() {
  const router = useRouter();
  const { user, businessProfile, signOut } = useAuth();
  const { canOverlap, isPremium, isBasico, isGratuito } = usePlan();
  const [logoutModal, setLogoutModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [whatsappConfig, setWhatsappConfig] = useState<WhatsAppConfig | null>(null);
  const [allowOverlapping, setAllowOverlapping] = useState(false);
  const [savingOverlap, setSavingOverlap] = useState(false);
  const [birthdayEnabled, setBirthdayEnabled] = useState(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async (forceRefresh = false) => {
    const cachedWA = getCached<any>('settings_whatsapp');
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
      const { supabase } = await import('@/lib/supabase');
      const { data: bpData } = await supabase
        .from('business_profiles')
        .select('allow_overlapping, birthday_reminders_enabled')
        .eq('user_id', user?.id).single();
      if (bpData) {
        setAllowOverlapping(bpData.allow_overlapping || false);
        setBirthdayEnabled(bpData.birthday_reminders_enabled || false);
      }
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
      const { supabase } = await import('@/lib/supabase');
      await supabase.from('business_profiles').update({ allow_overlapping: value }).eq('user_id', user?.id);
    } catch { setAllowOverlapping(!value); } finally { setSavingOverlap(false); }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.rpc('delete_user_account');
      if (error) throw error;
      await signOut();
    } catch { alert('Error al eliminar la cuenta. Intenta de nuevo.'); } finally { setDeleting(false); }
  };

  const planColor   = isPremium ? '#6366F1' : isBasico ? '#10B981' : '#94A3B8';
  const planBg      = isPremium ? '#EDE9FE' : isBasico ? '#ECFDF5' : '#F1F5F9';
  const planPrice   = isPremium ? '$1,490 MXN/mes' : isBasico ? '$990 MXN/mes' : 'Gratis';
  const planEmoji   = isPremium ? '⭐' : isBasico ? '🚀' : '🌱';
  const planDisplay = isPremium ? 'Premium' : isBasico ? 'Básico' : 'Gratuito';
  const waConnected = whatsappConfig?.isConnected || false;
  const initials = user?.name?.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || 'U';

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <ConfirmModal visible={logoutModal} title="Cerrar sesión" message="¿Estás seguro de que deseas cerrar sesión?"
        buttons={[{ text: 'Cerrar sesión', onPress: handleLogout, style: 'destructive' }, { text: 'Cancelar', onPress: () => setLogoutModal(false), style: 'cancel' }]}
        onDismiss={() => setLogoutModal(false)} />
      <ConfirmModal visible={deleteModal} title="⚠️ Eliminar cuenta" message="Se eliminarán TODOS tus datos permanentemente. Esta acción no tiene vuelta atrás."
        buttons={[{ text: 'Cancelar', onPress: () => setDeleteModal(false), style: 'cancel' }, { text: deleting ? 'Eliminando...' : 'Sí, eliminar todo', onPress: () => { setDeleteModal(false); handleDeleteAccount(); }, style: 'destructive' }]}
        onDismiss={() => setDeleteModal(false)} />

      <View style={s.header}><Text style={s.headerTitle}>Ajustes</Text></View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero perfil */}
        <TouchableOpacity style={s.heroCard} onPress={() => router.push('/settings/profile')} activeOpacity={0.85}>
          <View style={s.heroAvatarWrap}>
            {businessProfile?.logoUrl
              ? <Image source={{ uri: businessProfile.logoUrl }} style={s.heroAvatar} />
              : <View style={[s.heroAvatar, s.heroAvatarFallback]}><Text style={s.heroAvatarText}>{initials}</Text></View>
            }
            <View style={s.heroOnline} />
          </View>
          <View style={s.heroInfo}>
            <Text style={s.heroName}>{user?.name || 'Usuario'}</Text>
            <Text style={s.heroEmail}>{user?.email}</Text>
            {businessProfile?.businessName ? <Text style={s.heroBusiness}>🏢 {businessProfile.businessName}</Text> : null}
          </View>
          <IconSymbol android_material_icon_name="arrow-forward-ios" size={16} color="#CBD5E1" />
        </TouchableOpacity>

        {/* Card plan */}
        <TouchableOpacity style={[s.planCard, { borderColor: planColor }]} onPress={() => router.push('/settings/subscription')} activeOpacity={0.85}>
          <View style={[s.planIconBox, { backgroundColor: planBg }]}><Text style={s.planEmoji}>{planEmoji}</Text></View>
          <View style={s.planInfo}>
            <View style={s.planRow}>
              <Text style={s.planName}>Plan {planDisplay}</Text>
              <View style={[s.planBadge, { backgroundColor: planBg }]}><Text style={[s.planBadgeText, { color: planColor }]}>{planDisplay.toUpperCase()}</Text></View>
            </View>
            <Text style={s.planPrice}>{planPrice}</Text>
            {!isPremium && <Text style={s.planUpgrade}>{isGratuito ? 'Activa WhatsApp y reportes →' : 'Obtén tu número propio →'}</Text>}
          </View>
          <IconSymbol android_material_icon_name="arrow-forward-ios" size={16} color={planColor} />
        </TouchableOpacity>

        {/* MI NEGOCIO */}
        <SettingGroup title="MI NEGOCIO">
          <SettingRow iconName="store" iconColor="#10B981" iconBg="#ECFDF5" label="Información del negocio" sublabel={businessProfile?.businessName || 'Configura tu negocio'} onPress={() => router.push('/settings/business')} />
          <SettingRow iconName="schedule" iconColor="#3B82F6" iconBg="#EFF6FF" label="Horarios de atención" sublabel="Configura tu disponibilidad" onPress={() => router.push('/settings/schedule')} />
          <SettingRow iconName="content-cut" iconColor="#F59E0B" iconBg="#FFFBEB" label="Catálogo de servicios" sublabel="Gestiona tus servicios y precios" onPress={() => router.push('/settings/services')} />
          <SettingRow
            iconName="event-available" iconColor="#8B5CF6" iconBg="#F5F3FF"
            label="Citas simultáneas" sublabel="Permite sobreponer citas"
            badge={!isPremium ? <View style={s.premiumChip}><Text style={s.premiumChipText}>PREMIUM</Text></View> : undefined}
            right={<Switch value={allowOverlapping} onValueChange={handleOverlappingToggle} trackColor={{ false: '#E2E8F0', true: '#10B981' }} thumbColor="#fff" disabled={savingOverlap || !canOverlap} />}
          />
        </SettingGroup>

        {/* AUTOMATIZACIONES */}
        <SettingGroup title="AUTOMATIZACIONES">
          <SettingRow
            iconName="cake" iconColor="#EC4899" iconBg="#FDF2F8"
            label="Recordatorios de cumpleaños"
            sublabel={birthdayEnabled ? 'Activado — mensaje automático el día del cumpleaños' : 'Desactivado'}
            right={
              <View style={s.birthdayRight}>
                {birthdayEnabled && <View style={s.activeDot} />}
                <IconSymbol android_material_icon_name="arrow-forward-ios" size={16} color="#CBD5E1" />
              </View>
            }
            onPress={() => router.push('/settings/birthday')}
          />
        </SettingGroup>

        {/* WHATSAPP */}
        <SettingGroup title="WHATSAPP BUSINESS">
          <SettingRow
            iconName="message" iconColor="#25D366" iconBg="#F0FDF4"
            label="Configuración de WhatsApp"
            sublabel={waConnected ? `Conectado · ${whatsappConfig?.phoneNumber || ''}` : 'Sin configurar'}
            right={
              <View style={[s.waBadge, { backgroundColor: waConnected ? '#ECFDF5' : '#FEF3C7' }]}>
                <View style={[s.waDot, { backgroundColor: waConnected ? '#10B981' : '#F59E0B' }]} />
                <Text style={[s.waText, { color: waConnected ? '#10B981' : '#92400E' }]}>{waConnected ? 'Activo' : 'Inactivo'}</Text>
              </View>
            }
            onPress={() => router.push('/settings/whatsapp')}
          />
        </SettingGroup>

        {/* CUENTA */}
        <SettingGroup title="CUENTA">
          <SettingRow iconName="person" iconColor="#6366F1" iconBg="#EEF2FF" label="Editar perfil" onPress={() => router.push('/settings/profile')} />
          <SettingRow iconName="lock" iconColor="#8B5CF6" iconBg="#F5F3FF" label="Cambiar contraseña" onPress={() => router.push('/settings/password')} />
          <SettingRow iconName="description" iconColor="#64748B" iconBg="#F8FAFC" label="Legal y Privacidad" onPress={() => router.push('/legal')} />
        </SettingGroup>

        {/* SESIÓN */}
        <SettingGroup title="SESIÓN">
          <SettingRow iconName="logout" iconColor="#EF4444" iconBg="#FEF2F2" label="Cerrar sesión" danger onPress={() => setLogoutModal(true)} />
          <SettingRow iconName="delete-forever" iconColor="#EF4444" iconBg="#FEF2F2" label="Eliminar mi cuenta" sublabel="Esta acción es permanente e irreversible" danger onPress={() => setDeleteModal(true)} />
        </SettingGroup>

        <View style={s.footer}>
          <Text style={s.footerBrand}>VYLTA</Text>
          <Text style={s.footerTagline}>Cada cliente regresa</Text>
          <Text style={s.footerVersion}>v1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, backgroundColor: '#F8FAFC' },
  headerTitle: { fontSize: 32, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  scroll: { padding: 20, paddingBottom: 100 },
  heroCard: { backgroundColor: '#fff', borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  heroAvatarWrap: { position: 'relative' },
  heroAvatar: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: '#E2E8F0' },
  heroAvatarFallback: { backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
  heroAvatarText: { fontSize: 22, fontWeight: '800', color: '#fff' },
  heroOnline: { position: 'absolute', bottom: 1, right: 1, width: 14, height: 14, borderRadius: 7, backgroundColor: '#10B981', borderWidth: 2, borderColor: '#fff' },
  heroInfo: { flex: 1 },
  heroName: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  heroEmail: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  heroBusiness: { fontSize: 12, color: '#10B981', fontWeight: '600', marginTop: 4 },
  planCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 28, borderWidth: 1.5, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  planIconBox: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  planEmoji: { fontSize: 24 },
  planInfo: { flex: 1 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  planName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  planBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  planBadgeText: { fontSize: 10, fontWeight: '800' },
  planPrice: { fontSize: 13, color: '#64748B', marginBottom: 2 },
  planUpgrade: { fontSize: 12, color: '#6366F1', fontWeight: '600' },
  waBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  waDot: { width: 7, height: 7, borderRadius: 4 },
  waText: { fontSize: 12, fontWeight: '700' },
  premiumChip: { backgroundColor: '#FFFBEB', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  premiumChipText: { fontSize: 9, fontWeight: '800', color: '#92400E' },
  birthdayRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EC4899' },
  footer: { alignItems: 'center', paddingTop: 8, paddingBottom: 16, gap: 4 },
  footerBrand: { fontSize: 16, fontWeight: '900', color: '#CBD5E1', letterSpacing: 3 },
  footerTagline: { fontSize: 12, color: '#CBD5E1', fontStyle: 'italic' },
  footerVersion: { fontSize: 11, color: '#E2E8F0' },
});
