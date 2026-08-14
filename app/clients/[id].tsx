import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { apiGet } from '@/utils/api';
import { supabase } from '@/lib/supabase';
import { invalidateCache } from '@/utils/cache';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface Client {
  id: string; name: string; phone: string;

  email?: string | null; notes?: string | null;
  lastVisit?: string | null; totalVisits: number;
  isActive?: boolean; birthday?: string | null; createdAt: string;
}
interface ClientStats {
  totalAppointments: number; attendanceRate: number;
  lastVisit: string | null; noShowCount: number;
}
interface Appointment {
  id: string; date: string; startTime: string;
  endTime: string; service: string; status: string;
}
interface LoyaltyProgress {
  total_visits: number; visits_in_cycle: number; visits_required: number;
  reward_percent: number; redemptions: number; is_eligible: boolean; enabled: boolean;
}

export default function ClientDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<Client | null>(null);
  const [stats, setStats] = useState<ClientStats | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [activeTab, setActiveTab] = useState<'appointments' | 'messages'>('appointments');
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ─── Tarjeta de lealtad (Ago 2026) ───────────────────────────────
  // Progreso calculado en BD (RPC get_loyalty_progress) a partir del
  // teléfono del cliente. Solo se muestra si el negocio activó la función.
  const [loyalty, setLoyalty] = useState<LoyaltyProgress | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemModal, setRedeemModal] = useState(false);

  const loadLoyalty = async (phone?: string | null) => {
    if (!phone) { setLoyalty(null); return; }
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user?.id) return;
      const { data, error } = await supabase.rpc('get_loyalty_progress', {
        p_user_id: auth.user.id,
        p_phone: phone,
      });
      if (error) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.enabled) setLoyalty(row as LoyaltyProgress);
      else setLoyalty(null);
    } catch {
      // Función no desplegada aún — simplemente no mostramos la tarjeta
    }
  };

  const confirmRedeem = async () => {
    if (!client || !loyalty) return;
    setRedeemModal(false);
    setRedeeming(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from('loyalty_redemptions').insert({
        user_id: auth?.user?.id,
        client_phone: (client.phone || '').replace(/\D/g, '').slice(-10),
        client_id: client.id,
        client_name: client.name,
        reward_percent: loyalty.reward_percent,
        visits_required: loyalty.visits_required,
      });
      if (error) throw error;
      await loadLoyalty(client.phone);
    } catch (e: any) {
      setErrorModal({ visible: true, message: e?.message ?? 'No se pudo registrar el canje.' });
    } finally {
      setRedeeming(false);
    }
  };

  useEffect(() => { if (id) loadClientData(); }, [id]);

  const loadClientData = async () => {
    setLoading(true);
    try {
      const clientData = await apiGet<Client>(`/api/clients/${id}`);
      if (!clientData) throw new Error('Cliente no encontrado');
      setClient(clientData);
      const [statsData, appointmentsData] = await Promise.all([
        apiGet<ClientStats>(`/api/clients/${id}/stats`).catch(() => ({ totalAppointments: clientData.totalVisits || 0, attendanceRate: 0, lastVisit: clientData.lastVisit || null, noShowCount: 0 })),
        apiGet<Appointment[]>(`/api/clients/${id}/appointments`).catch(() => []),
      ]);
      setStats(statsData);
      setAppointments(appointmentsData);
      loadLoyalty(clientData.phone);
    } catch {
      setErrorModal({ visible: true, message: 'Error al cargar los datos del cliente' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClient = () => {
    if (!client) return;
    // Primera confirmación
    setDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!client || !id) return;
    setDeleteModal(false);

    // Segunda confirmación con Alert nativo
    Alert.alert(
      '¿Estás completamente seguro?',
      `Se eliminará permanentemente a "${client.name}" y se desvincularán todas sus citas. Esta acción no se puede deshacer.`,
      [
        { text: 'No, cancelar', style: 'cancel' },
        {
          text: 'Sí, eliminar',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              // Desvincular citas del cliente (poner client_id = null)
              await supabase
                .from('appointments')
                .update({ client_id: null })
                .eq('client_id', id);

              // Eliminar el cliente
              const { error } = await supabase
                .from('clients')
                .delete()
                .eq('id', id);

              if (error) throw error;

              // Invalidar caché de clientes
              invalidateCache('clients');

              // Volver a la lista
              router.back();
            } catch (err: any) {
              console.error('[Client] Delete error:', err);
              setErrorModal({ visible: true, message: 'No se pudo eliminar el cliente. Intenta de nuevo.' });
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const getInitials = (name: string) => {
    // ⚡ FIX BUG (jul 2026): split robusto (antes "MUNDEFINED" con doble espacio).
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return '?';
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    const day = date.getDate();
    const month = date.toLocaleString('es-MX', { month: 'short' });
    const year = date.getFullYear().toString().slice(-2);
    return `${day} ${month} '${year}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Confirmada': return colors.primary;
      case 'Pendiente': return colors.warning;
      case 'Cancelada': return colors.error;
      case 'Completada': return colors.textSecondary;
      default: return colors.textSecondary;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!client || !stats) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Cliente no encontrado</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const initials = getInitials(client.name);
  const attendanceRateText = `${Math.round(stats.attendanceRate)}%`;
  const lastVisitText = stats.lastVisit ? formatDate(stats.lastVisit) : 'Sin visitas';

  const handleScheduleAppointment = () => {
    router.push({
      pathname: '/appointments/new',
      params: { clientId: client.id, clientName: client.name, clientPhone: client.phone },
    } as any);
  };

  const openWhatsApp = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    const mx = digits.startsWith('52') ? digits : `52${digits}`;
    Linking.openURL(`https://wa.me/${mx}`);
  };

  const hasPhone = !!client.phone && client.phone.replace(/\D/g, '').length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ConfirmModal
        visible={errorModal.visible} title="Error" message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'cancel' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })}
      />
      <ConfirmModal
        visible={deleteModal}
        title="⚠️ Eliminar cliente"
        message={`¿Deseas eliminar a "${client.name}"?\n\nSus citas existentes se conservarán pero ya no estarán vinculadas a este cliente. Esta acción es permanente.`}
        buttons={[
          { text: 'Cancelar', onPress: () => setDeleteModal(false), style: 'cancel' },
          { text: 'Eliminar cliente', onPress: confirmDelete, style: 'destructive' },
        ]}
        onDismiss={() => setDeleteModal(false)}
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBackButton}>
          <IconSymbol android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detalle del Cliente</Text>
        <TouchableOpacity onPress={() => router.push(`/clients/${id}/edit`)}>
          <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ConfirmModal
        visible={redeemModal}
        title="🎁 Canjear recompensa"
        message={loyalty
          ? `${client.name} completó ${loyalty.visits_required} visitas.\n\n¿Aplicar ${loyalty.reward_percent}% de descuento y reiniciar su tarjeta?`
          : ''}
        buttons={[
          { text: 'Cancelar', onPress: () => setRedeemModal(false), style: 'cancel' },
          { text: 'Sí, canjear', onPress: confirmRedeem, style: 'default' },
        ]}
        onDismiss={() => setRedeemModal(false)}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* ─── Tarjeta de lealtad ─── */}
        {loyalty && (
          <View style={[styles.loyaltyCard, loyalty.is_eligible && styles.loyaltyCardWin]}>
            <View style={styles.loyaltyHead}>
              <MaterialIcons name="card-giftcard" size={18} color={loyalty.is_eligible ? '#fff' : '#B45309'} />
              <Text style={[styles.loyaltyTitle, loyalty.is_eligible && { color: '#fff' }]}>
                {loyalty.is_eligible ? '¡Recompensa lista!' : 'Tarjeta de lealtad'}
              </Text>
              <Text style={[styles.loyaltyCount, loyalty.is_eligible && { color: '#FEF3C7' }]}>
                {Math.min(loyalty.visits_in_cycle, loyalty.visits_required)}/{loyalty.visits_required}
              </Text>
            </View>

            <View style={styles.loyaltyDots}>
              {Array.from({ length: Math.min(loyalty.visits_required, 12) }).map((_, i) => {
                const done = i < Math.min(loyalty.visits_in_cycle, loyalty.visits_required);
                return (
                  <View key={i} style={[
                    styles.loyaltyDot,
                    done && styles.loyaltyDotDone,
                    loyalty.is_eligible && styles.loyaltyDotWin,
                  ]}>
                    {done && <MaterialIcons name="check" size={10} color={loyalty.is_eligible ? '#B45309' : '#fff'} />}
                  </View>
                );
              })}
            </View>

            {loyalty.is_eligible ? (
              <TouchableOpacity style={styles.loyaltyBtn} onPress={() => setRedeemModal(true)} disabled={redeeming}>
                {redeeming
                  ? <ActivityIndicator size="small" color="#B45309" />
                  : <Text style={styles.loyaltyBtnText}>Canjear {loyalty.reward_percent}% de descuento</Text>}
              </TouchableOpacity>
            ) : (
              <Text style={styles.loyaltyHint}>
                {loyalty.visits_required - loyalty.visits_in_cycle} visita
                {loyalty.visits_required - loyalty.visits_in_cycle !== 1 ? 's' : ''} más para
                ganar {loyalty.reward_percent}% de descuento
                {loyalty.redemptions > 0 ? ` · ${loyalty.redemptions} canjeada${loyalty.redemptions !== 1 ? 's' : ''}` : ''}
              </Text>
            )}
          </View>
        )}

        <View style={styles.clientCard}>
          <View style={styles.clientAvatar}>
            <Text style={styles.clientAvatarText}>{initials}</Text>
          </View>
          <Text style={styles.clientName}>{client.name}</Text>
          <Text style={styles.clientPhone}>{client.phone}</Text>
          {client.email ? <Text style={styles.clientEmail}>{client.email}</Text> : null}
          {client.birthday ? (
            <View style={styles.birthdayRow}>
              <MaterialIcons name="cake" size={14} color="#EC4899" />
              <Text style={styles.birthdayText}>{formatDate(client.birthday)}</Text>
            </View>
          ) : null}
          {client.notes ? (
            <View style={styles.notesRow}>
              <MaterialIcons name="notes" size={14} color={colors.textSecondary} />
              <Text style={styles.notesText}>{client.notes}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.totalAppointments}</Text>
            <Text style={styles.statLabel}>Total Citas</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{attendanceRateText}</Text>
            <Text style={styles.statLabel}>Asistencia</Text>
          </View>
        </View>

        <View style={styles.statCardWide}>
          <View style={styles.statCardWideInner}>
            <MaterialIcons name="event-available" size={20} color={colors.primary} />
            <Text style={styles.statLabelWide}>Última visita</Text>
          </View>
          <Text style={styles.statValueWide}>{lastVisitText}</Text>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.actionButton} onPress={handleScheduleAppointment}>
            <IconSymbol android_material_icon_name="calendar-today" size={20} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>Agendar cita</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonSecondary, !hasPhone && styles.actionButtonDisabled]}
            onPress={() => openWhatsApp(client.phone)}
            disabled={!hasPhone}
          >
            <IconSymbol android_material_icon_name="message" size={20} color={colors.primary} />
            <Text style={[styles.actionButtonText, styles.actionButtonTextSecondary]}>Enviar mensaje</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabsContainer}>
          <TouchableOpacity style={[styles.tab, activeTab === 'appointments' && styles.tabActive]} onPress={() => setActiveTab('appointments')}>
            <Text style={[styles.tabText, activeTab === 'appointments' && styles.tabTextActive]}>Historial de Citas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, activeTab === 'messages' && styles.tabActive]} onPress={() => setActiveTab('messages')}>
            <Text style={[styles.tabText, activeTab === 'messages' && styles.tabTextActive]}>Mensajes WhatsApp</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'appointments' ? (
          <View style={styles.tabContent}>
            {appointments.length === 0 ? (
              <View style={styles.emptyState}>
                <IconSymbol android_material_icon_name="calendar-today" size={48} color={colors.textSecondary} />
                <Text style={styles.emptyStateText}>Sin citas registradas</Text>
                <TouchableOpacity style={[styles.actionButton, { marginTop: 16, paddingHorizontal: 24 }]} onPress={handleScheduleAppointment}>
                  <IconSymbol android_material_icon_name="add" size={18} color="#FFFFFF" />
                  <Text style={styles.actionButtonText}>Agendar primera cita</Text>
                </TouchableOpacity>
              </View>
            ) : (
              appointments.map(appointment => (
                <TouchableOpacity key={appointment.id} style={styles.appointmentCard} onPress={() => router.push(`/appointments/${appointment.id}`)}>
                  <View style={styles.appointmentInfo}>
                    <Text style={styles.appointmentService}>{appointment.service}</Text>
                    <Text style={styles.appointmentDate}>{formatDate(appointment.date)}</Text>
                    <Text style={styles.appointmentTime}>{appointment.startTime}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(appointment.status) }]}>
                    <Text style={styles.statusText}>{appointment.status}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        ) : (
          <View style={styles.tabContent}>
            <View style={styles.emptyState}>
              <IconSymbol android_material_icon_name="message" size={48} color={colors.textSecondary} />
              <Text style={styles.emptyStateText}>Sin mensajes de WhatsApp</Text>
              <TouchableOpacity onPress={() => router.push('/settings/whatsapp')}>
                <Text style={[styles.emptyStateSubtext, styles.emptyStateLink]}>Configura WhatsApp Business para enviar mensajes</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Botón eliminar cliente — al final del scroll con separación visual */}
        <View style={styles.dangerZone}>
          <View style={styles.dangerDivider} />
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDeleteClient}
            disabled={deleting}
            activeOpacity={0.7}
          >
            {deleting ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <MaterialIcons name="delete-outline" size={18} color="#EF4444" />
            )}
            <Text style={styles.deleteBtnText}>
              {deleting ? 'Eliminando...' : 'Eliminar cliente'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.deleteHint}>
            Se desvincularán las citas existentes y se eliminará el registro del cliente de forma permanente.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ─── Tarjeta de lealtad ───
  loyaltyCard: {
    backgroundColor: '#FFFBEB', borderRadius: 16, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  loyaltyCardWin: { backgroundColor: '#F59E0B', borderColor: '#D97706' },
  loyaltyHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  loyaltyTitle: { flex: 1, fontSize: 13.5, fontWeight: '700', color: '#78350F' },
  loyaltyCount: { fontSize: 13, fontWeight: '800', color: '#B45309' },
  loyaltyDots: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 10 },
  loyaltyDot: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: '#FEF3C7',
    borderWidth: 1, borderColor: '#FDE68A', justifyContent: 'center', alignItems: 'center',
  },
  loyaltyDotDone: { backgroundColor: '#F59E0B', borderColor: '#D97706' },
  loyaltyDotWin: { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' },
  loyaltyHint: { fontSize: 11.5, color: '#92400E', lineHeight: 16 },
  loyaltyBtn: {
    backgroundColor: '#fff', borderRadius: 10, paddingVertical: 10, alignItems: 'center',
  },
  loyaltyBtnText: { fontSize: 13.5, fontWeight: '700', color: '#B45309' },

  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { fontSize: 18, color: colors.text, marginBottom: 20 },
  backButton: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  backButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingVertical: 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerBackButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text },
  scrollContent: { padding: 20, paddingBottom: 40 },
  clientCard: { backgroundColor: colors.card, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  clientAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  clientAvatarText: { fontSize: 32, fontWeight: 'bold', color: '#FFFFFF' },
  clientName: { fontSize: 24, fontWeight: 'bold', color: colors.text, marginBottom: 4 },
  clientPhone: { fontSize: 16, color: colors.textSecondary, marginBottom: 2 },
  clientEmail: { fontSize: 14, color: colors.textSecondary, marginBottom: 6 },
  birthdayRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  birthdayText: { fontSize: 13, color: '#EC4899', fontWeight: '500' },
  notesRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8, paddingHorizontal: 16 },
  notesText: { fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 18 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  statValue: { fontSize: 28, fontWeight: 'bold', color: colors.primary, marginBottom: 4 },
  statLabel: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
  statCardWide: { backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 14, marginBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  statCardWideInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statLabelWide: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  statValueWide: { fontSize: 16, fontWeight: 'bold', color: colors.primary },
  actionButtons: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  actionButton: { flex: 1, backgroundColor: colors.primary, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionButtonSecondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary },
  actionButtonDisabled: { opacity: 0.5 },
  actionButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  actionButtonTextSecondary: { color: colors.primary },
  tabsContainer: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 12, padding: 4, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: '#FFFFFF' },
  tabContent: { minHeight: 200 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyStateText: { fontSize: 16, color: colors.textSecondary, marginTop: 12 },
  emptyStateSubtext: { fontSize: 14, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
  emptyStateLink: { color: colors.primary, fontWeight: '600', textDecorationLine: 'underline' },
  appointmentCard: { backgroundColor: colors.card, borderRadius: 12, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  appointmentInfo: { flex: 1 },
  appointmentService: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 4 },
  appointmentDate: { fontSize: 14, color: colors.textSecondary },
  appointmentTime: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  statusText: { fontSize: 12, color: '#FFFFFF', fontWeight: '600' },

  // Danger zone — eliminar cliente
  dangerZone: { marginTop: 24, paddingTop: 8 },
  dangerDivider: { height: 1, backgroundColor: '#FEE2E2', marginBottom: 20 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1.5, borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  deleteBtnText: { fontSize: 15, fontWeight: '600', color: '#EF4444' },
  deleteHint: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 10, lineHeight: 16, paddingHorizontal: 20 },
});
