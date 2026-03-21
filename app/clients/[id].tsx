
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { apiGet } from '@/utils/api';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface Client {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  lastVisit?: string | null;
  totalVisits: number;
  isActive?: boolean;
  birthday?: string | null;
  createdAt: string;
}

interface ClientStats {
  totalAppointments: number;
  attendanceRate: number;
  lastVisit: string | null;
  noShowCount: number;
}

interface Appointment {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  service: string;
  status: string;
}

type TabType = 'appointments' | 'messages';

export default function ClientDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<Client | null>(null);
  const [stats, setStats] = useState<ClientStats | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('appointments');
  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });

  useEffect(() => {
    if (id) loadClientData();
  }, [id]);

  const loadClientData = async () => {
    setLoading(true);
    try {
      const allClients = await apiGet<Client[]>('/api/clients');
      const clientData = allClients.find((c) => c.id === id);
      if (!clientData) throw new Error('Cliente no encontrado');
      setClient(clientData);

      const [statsData, appointmentsData] = await Promise.all([
        apiGet<ClientStats>(`/api/clients/${id}/stats`).catch(() => ({
          totalAppointments: clientData.totalVisits || 0,
          attendanceRate: 0,
          lastVisit: clientData.lastVisit || null,
          noShowCount: 0,
        })),
        apiGet<Appointment[]>(`/api/clients/${id}/appointments`).catch(() => []),
      ]);

      setStats(statsData);
      setAppointments(appointmentsData);
    } catch (error) {
      setErrorModal({ visible: true, message: 'Error al cargar los datos del cliente' });
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  // Formato legible: "24 mar 26"
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    const day = date.getDate();
    const month = date.toLocaleString('es-MX', { month: 'short' });
    const year = date.getFullYear().toString().slice(-2);
    return `${day} ${month} '${year}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Confirmada':  return colors.primary;
      case 'Pendiente':   return colors.warning;
      case 'Cancelada':   return colors.error;
      case 'Completada':  return colors.textSecondary;
      default:            return colors.textSecondary;
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

  if (!client || !stats) {
    return (
      <SafeAreaView style={styles.container}>
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

  return (
    <SafeAreaView style={styles.container}>
      <ConfirmModal
        visible={errorModal.visible}
        title="Error"
        message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'cancel' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })}
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

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Client info card */}
        <View style={styles.clientCard}>
          <View style={styles.clientAvatar}>
            <Text style={styles.clientAvatarText}>{initials}</Text>
          </View>
          <Text style={styles.clientName}>{client.name}</Text>
          <Text style={styles.clientPhone}>{client.phone}</Text>
          {client.email ? <Text style={styles.clientEmail}>{client.email}</Text> : null}
        </View>

        {/* Stats — fila superior: Total Citas + Asistencia */}
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

        {/* Stats — fila inferior: Última visita en card ancha */}
        <View style={styles.statCardWide}>
          <View style={styles.statCardWideInner}>
            <MaterialIcons name="event-available" size={20} color={colors.primary} />
            <Text style={styles.statLabelWide}>Última visita</Text>
          </View>
          <Text style={styles.statValueWide}>{lastVisitText}</Text>
        </View>

        {/* Action buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/appointments/new')}
          >
            <IconSymbol android_material_icon_name="calendar-today" size={20} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>Agendar cita</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonSecondary]}
            onPress={() => {}}
          >
            <IconSymbol android_material_icon_name="message" size={20} color={colors.primary} />
            <Text style={[styles.actionButtonText, styles.actionButtonTextSecondary]}>
              Enviar mensaje
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'appointments' && styles.tabActive]}
            onPress={() => setActiveTab('appointments')}
          >
            <Text style={[styles.tabText, activeTab === 'appointments' && styles.tabTextActive]}>
              Historial de Citas
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'messages' && styles.tabActive]}
            onPress={() => setActiveTab('messages')}
          >
            <Text style={[styles.tabText, activeTab === 'messages' && styles.tabTextActive]}>
              Mensajes WhatsApp
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab content */}
        {activeTab === 'appointments' ? (
          <View style={styles.tabContent}>
            {appointments.length === 0 ? (
              <View style={styles.emptyState}>
                <IconSymbol android_material_icon_name="calendar-today" size={48} color={colors.textSecondary} />
                <Text style={styles.emptyStateText}>Sin citas registradas</Text>
              </View>
            ) : (
              appointments.map((appointment) => (
                <TouchableOpacity
                  key={appointment.id}
                  style={styles.appointmentCard}
                  onPress={() => router.push(`/appointments/${appointment.id}`)}
                >
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
              <Text style={styles.emptyStateSubtext}>
                Configura WhatsApp Business para enviar mensajes
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:            { flex: 1, backgroundColor: colors.background },
  loadingContainer:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorContainer:       { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText:            { fontSize: 18, color: colors.text, marginBottom: 20 },
  backButton:           { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  backButtonText:       { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  header:               { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: 48, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerBackButton:     { padding: 4 },
  headerTitle:          { fontSize: 18, fontWeight: 'bold', color: colors.text },
  scrollContent:        { padding: 20, paddingBottom: 40 },

  // Cliente
  clientCard:           { backgroundColor: colors.card, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  clientAvatar:         { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  clientAvatarText:     { fontSize: 32, fontWeight: 'bold', color: '#FFFFFF' },
  clientName:           { fontSize: 24, fontWeight: 'bold', color: colors.text, marginBottom: 4 },
  clientPhone:          { fontSize: 16, color: colors.textSecondary, marginBottom: 2 },
  clientEmail:          { fontSize: 14, color: colors.textSecondary },

  // Stats — fila de 2
  statsRow:             { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard:             { flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  statValue:            { fontSize: 28, fontWeight: 'bold', color: colors.primary, marginBottom: 4 },
  statLabel:            { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },

  // Stats — card ancha última visita
  statCardWide:         { backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 14, marginBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  statCardWideInner:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statLabelWide:        { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  statValueWide:        { fontSize: 16, fontWeight: 'bold', color: colors.primary },

  // Acciones
  actionButtons:        { flexDirection: 'row', gap: 12, marginBottom: 24 },
  actionButton:         { flex: 1, backgroundColor: colors.primary, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionButtonSecondary:{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary },
  actionButtonText:     { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  actionButtonTextSecondary: { color: colors.primary },

  // Tabs
  tabsContainer:        { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 12, padding: 4, marginBottom: 20 },
  tab:                  { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive:            { backgroundColor: colors.primary },
  tabText:              { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  tabTextActive:        { color: '#FFFFFF' },
  tabContent:           { minHeight: 200 },

  // Empty state
  emptyState:           { alignItems: 'center', paddingVertical: 40 },
  emptyStateText:       { fontSize: 16, color: colors.textSecondary, marginTop: 12 },
  emptyStateSubtext:    { fontSize: 14, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },

  // Historial citas
  appointmentCard:      { backgroundColor: colors.card, borderRadius: 12, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  appointmentInfo:      { flex: 1 },
  appointmentService:   { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 4 },
  appointmentDate:      { fontSize: 14, color: colors.textSecondary },
  appointmentTime:      { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  statusBadge:          { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  statusText:           { fontSize: 12, color: '#FFFFFF', fontWeight: '600' },
});
