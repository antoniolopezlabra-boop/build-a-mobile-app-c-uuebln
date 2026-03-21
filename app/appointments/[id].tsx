
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, TextInput, Alert,
  KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { invalidateCache } from '@/utils/cache';
import { apiGet, apiPatch, apiDelete, apiPost } from '@/utils/api';
import { getStatusColor } from '@/utils/appointmentUtils';
import { formatDisplayDate } from '@/utils/dateUtils';
import { logger } from '@/utils/logger';
import React, { useEffect, useState } from 'react';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ConfirmModal } from '@/components/button';
import { useTheme } from '@/contexts/ThemeContext';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { supabase } from '@/lib/supabase';

interface Client {
  id: string;
  name: string;
  phone: string;
  email?: string;
}

interface Appointment {
  id: string;
  date: string;
  time: string;
  service: string;
  status: 'Confirmada' | 'Pendiente' | 'Cancelada' | 'Completada' | 'No asistió' | 'Reagendada' | 'Pagado' | 'En espera' | 'Solicitud';
  notes?: string | null;
  client: Client | null;
  clientId: string | null;
  clientNameTemp?: string | null;
  clientPhone?: string | null;
  source?: string;
  userId: string;
  createdAt: string;
}

export default function AppointmentDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: tc } = useTheme();

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [confirmModal, setConfirmModal] = useState({ visible: false, action: '', title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });

  // Estado para el modal "Guardar como cliente"
  const [saveClientModal, setSaveClientModal] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [clientForm, setClientForm] = useState({ name: '', phone: '', email: '', notes: '' });

  useEffect(() => { if (id) loadAppointment(); }, [id]);

  const loadAppointment = async () => {
    setLoading(true);
    try {
      const data = await apiGet<Appointment>(`/api/appointments/${id}`);
      if (data) {
        setAppointment(data);
        // Pre-llenar el form con los datos del link público
        if (data.source === 'public_link') {
          setClientForm(prev => ({
            ...prev,
            name: data.clientNameTemp || '',
            phone: data.clientPhone || '',
          }));
        }
      } else {
        router.back();
      }
    } catch (error) {
      logger.error('[AppointmentDetail] Error loading appointment:', error);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!appointment) return;
    setActionLoading(true);
    try {
      await apiPatch(`/api/appointments/${appointment.id}`, { status: newStatus });
      invalidateCache('dashboard_stats');
      invalidateCache('today_appointments');
      invalidateCache('week_appointments');
      invalidateCache('appointments_list');
      invalidateCache('reports_stats');
      invalidateCache('reports_recent');
      await loadAppointment();
    } catch (error: any) {
      logger.error('[AppointmentDetail] Error updating status:', error);
      setErrorModal({ visible: true, message: error?.message || 'Error al actualizar el estado' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReschedule = () => router.push(`/appointments/${id}/reschedule`);

  const handleDelete = async () => {
    if (!appointment) return;
    setActionLoading(true);
    try {
      await apiDelete(`/api/appointments/${appointment.id}`);
      invalidateCache('dashboard_stats');
      invalidateCache('today_appointments');
      invalidateCache('week_appointments');
      invalidateCache('appointments_list');
      invalidateCache('reports_stats');
      invalidateCache('reports_recent');
      router.back();
    } catch (error: any) {
      logger.error('[AppointmentDetail] Error deleting appointment:', error);
      setErrorModal({ visible: true, message: error?.message || 'Error al eliminar la cita' });
      setActionLoading(false);
    }
  };

  // ── Guardar como cliente ──────────────────────────────────────────────────
  const handleSaveAsClient = async () => {
    if (!appointment) return;
    if (!clientForm.name.trim() || !clientForm.phone.trim()) {
      Alert.alert('Campos requeridos', 'El nombre y teléfono son obligatorios.');
      return;
    }
    setSavingClient(true);
    try {
      // 1. Crear el cliente en la BD
      const newClient = await apiPost<any>('/api/clients', {
        name: clientForm.name.trim(),
        phone: clientForm.phone.trim(),
        email: clientForm.email.trim() || null,
        notes: clientForm.notes.trim() || null,
        is_active: true,
      });

      // 2. Vincular la cita con el nuevo cliente y limpiar los campos temporales
      const { error } = await supabase
        .from('appointments')
        .update({
          client_id: newClient.id,
          client_name_temp: null,
          client_phone_temp: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointment.id);

      if (error) throw error;

      // 3. Invalidar caches
      invalidateCache('clients_list');
      invalidateCache('appointments_list');

      setSaveClientModal(false);
      Alert.alert(
        '¡Cliente guardado!',
        `${clientForm.name.trim()} fue agregado a tu base de clientes y vinculado a esta cita.`,
        [{ text: 'Ver cliente', onPress: () => router.push(`/clients/${newClient.id}`) },
         { text: 'Quedarse aquí', onPress: () => loadAppointment() }]
      );
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo guardar el cliente. Intenta de nuevo.');
    } finally {
      setSavingClient(false);
    }
  };

  const showConfirmation = (action: string, title: string, message: string) => {
    setConfirmModal({ visible: true, action, title, message });
  };

  const handleConfirmAction = () => {
    const action = confirmModal.action;
    setConfirmModal({ visible: false, action: '', title: '', message: '' });
    switch (action) {
      case 'confirm':  handleStatusChange('Confirmada'); break;
      case 'cancel':   handleStatusChange('Cancelada'); break;
      case 'complete': handleStatusChange('Completada'); break;
      case 'noshow':   handleStatusChange('No asistió'); break;
      case 'paid':     handleStatusChange('Pagado'); break;
      case 'delete':   handleDelete(); break;
      case 'approve':  handleStatusChange('Confirmada'); break;
      case 'reject':   handleStatusChange('Cancelada'); break;
    }
  };

  if (loading || !appointment) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: tc.textMuted }]}>Cargando detalles...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = getStatusColor(appointment.status);
  const formattedDate = formatDisplayDate(appointment.date);

  const isPublicLink = appointment.source === 'public_link';
  const hasRealClient = !!appointment.client;
  // Nombre y teléfono: prioridad cliente real > datos temporales del link
  const clientName = appointment.client?.name || appointment.clientNameTemp || 'Cliente desconocido';
  const clientPhone = appointment.client?.phone || appointment.clientPhone || '—';
  const clientEmail = appointment.client?.email;
  const clientInitial = clientName.charAt(0).toUpperCase();
  // Mostrar botón "Guardar como cliente" solo si es del link y no tiene cliente vinculado
  const canSaveAsClient = isPublicLink && !hasRealClient;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={tc.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: tc.text }]}>Detalle de Cita</Text>
        <TouchableOpacity
          onPress={() => showConfirmation('delete', 'Eliminar Cita', '¿Estás seguro de que deseas eliminar esta cita?')}
          style={styles.deleteButton}
        >
          <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={24} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

        {/* Status + badge link público */}
        <View style={[styles.statusCard, { backgroundColor: tc.surface }]}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{appointment.status}</Text>
          </View>
          {isPublicLink && (
            <View style={styles.publicLinkBadge}>
              <MaterialIcons name="link" size={13} color="#3B82F6" />
              <Text style={styles.publicLinkText}>Desde link de cita pública</Text>
            </View>
          )}
        </View>

        {/* Información de la cita */}
        <View style={[styles.section, { backgroundColor: tc.surface }]}>
          <Text style={[styles.sectionTitle, { color: tc.text }]}>Información de la Cita</Text>
          <View style={styles.infoRow}>
            <IconSymbol ios_icon_name="calendar" android_material_icon_name="event" size={22} color={colors.primary} />
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: tc.textMuted }]}>Fecha</Text>
              <Text style={[styles.infoValue, { color: tc.text }]}>{formattedDate}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <IconSymbol ios_icon_name="clock" android_material_icon_name="access-time" size={22} color={colors.primary} />
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: tc.textMuted }]}>Hora</Text>
              <Text style={[styles.infoValue, { color: tc.text }]}>{appointment.time}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <IconSymbol ios_icon_name="scissors" android_material_icon_name="content-cut" size={22} color={colors.primary} />
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: tc.textMuted }]}>Servicio</Text>
              <Text style={[styles.infoValue, { color: tc.text }]}>{appointment.service || 'Servicio'}</Text>
            </View>
          </View>
          {appointment.notes && (
            <View style={styles.infoRow}>
              <IconSymbol ios_icon_name="note" android_material_icon_name="description" size={22} color={colors.primary} />
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: tc.textMuted }]}>Notas</Text>
                <Text style={[styles.infoValue, { color: tc.text }]}>{appointment.notes}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Sección cliente */}
        <View style={[styles.section, { backgroundColor: tc.surface }]}>
          <View style={styles.clientSectionHeader}>
            <Text style={[styles.sectionTitle, { color: tc.text }]}>Cliente</Text>
            {/* Botón guardar como cliente — solo aparece si es del link y no está vinculado */}
            {canSaveAsClient && (
              <TouchableOpacity
                style={styles.saveClientBtn}
                onPress={() => setSaveClientModal(true)}
              >
                <MaterialIcons name="person-add-alt" size={15} color="#fff" />
                <Text style={styles.saveClientBtnText}>Guardar como cliente</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.clientCard, { backgroundColor: tc.bg, borderColor: tc.border }]}>
            <View style={[styles.clientAvatar, { backgroundColor: isPublicLink && !hasRealClient ? '#3B82F6' : colors.primary }]}>
              <Text style={styles.clientAvatarText}>{clientInitial}</Text>
            </View>
            <View style={styles.clientInfo}>
              <Text style={[styles.clientName, { color: tc.text }]}>{clientName}</Text>
              <View style={styles.clientPhoneRow}>
                <MaterialIcons name="phone" size={13} color={tc.textMuted} />
                <Text style={[styles.clientPhone, { color: tc.textMuted }]}>{clientPhone}</Text>
              </View>
              {clientEmail && (
                <View style={styles.clientPhoneRow}>
                  <MaterialIcons name="email" size={13} color={tc.textMuted} />
                  <Text style={[styles.clientPhone, { color: tc.textMuted }]}>{clientEmail}</Text>
                </View>
              )}
              {isPublicLink && !hasRealClient && (
                <View style={styles.notSavedPill}>
                  <Text style={styles.notSavedText}>No registrado como cliente aún</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Acciones */}
        <View style={[styles.actionsSection, { backgroundColor: tc.surface }]}>
          <Text style={[styles.sectionTitle, { color: tc.text }]}>Acciones</Text>

          {appointment.status === 'Solicitud' && (
            <View>
              <View style={styles.solicitudBanner}>
                <MaterialIcons name="link" size={16} color="#3B82F6" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.solicitudTitle}>Solicitud desde link público</Text>
                  <Text style={styles.solicitudSub}>{clientName} · {clientPhone}</Text>
                </View>
              </View>
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#10B981', marginBottom: 10 }]} onPress={() => showConfirmation('approve', 'Aceptar solicitud', `¿Confirmas la cita de ${clientName}?`)}>
                <MaterialIcons name="check-circle" size={22} color="#fff" />
                <Text style={styles.actionButtonText}>Aceptar solicitud</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#EF4444' }]} onPress={() => showConfirmation('reject', 'Rechazar solicitud', '¿Deseas rechazar esta solicitud?')}>
                <MaterialIcons name="cancel" size={22} color="#fff" />
                <Text style={styles.actionButtonText}>Rechazar solicitud</Text>
              </TouchableOpacity>
            </View>
          )}

          {appointment.status === 'En espera' && (
            <View>
              <View style={[styles.solicitudBanner, { backgroundColor: '#F3E8FF', borderColor: '#8B5CF6' }]}>
                <MaterialIcons name="hourglass-empty" size={16} color="#8B5CF6" />
                <Text style={[styles.solicitudTitle, { color: '#8B5CF6' }]}>Cita en espera de confirmación</Text>
              </View>
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#10B981', marginBottom: 10 }]} onPress={() => showConfirmation('approve', 'Aprobar cita', '¿Confirmas que puedes atender esta cita?')}>
                <MaterialIcons name="check-circle" size={22} color="#fff" />
                <Text style={styles.actionButtonText}>Aprobar cita</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#EF4444', marginBottom: 10 }]} onPress={() => showConfirmation('reject', 'Rechazar cita', '¿Deseas rechazar esta cita?')}>
                <MaterialIcons name="cancel" size={22} color="#fff" />
                <Text style={styles.actionButtonText}>Rechazar cita</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#3B82F6' }]} onPress={handleReschedule}>
                <MaterialIcons name="event" size={22} color="#fff" />
                <Text style={styles.actionButtonText}>Modificar horario</Text>
              </TouchableOpacity>
            </View>
          )}

          {appointment.status === 'Pendiente' && (
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#10B981' }]} onPress={() => showConfirmation('confirm', 'Confirmar Cita', '¿Deseas confirmar esta cita?')}>
              <MaterialIcons name="check-circle" size={22} color="#fff" />
              <Text style={styles.actionButtonText}>Confirmar</Text>
            </TouchableOpacity>
          )}

          {appointment.status === 'Completada' && (
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#10B981' }]} onPress={() => showConfirmation('paid', 'Marcar como Pagado', '¿Confirmas que ya se cobró este servicio?')}>
              <MaterialIcons name="attach-money" size={22} color="#fff" />
              <Text style={styles.actionButtonText}>Pagado</Text>
            </TouchableOpacity>
          )}

          {(appointment.status === 'Pendiente' || appointment.status === 'Confirmada') && (
            <>
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#3B82F6', marginTop: 10 }]} onPress={handleReschedule}>
                <MaterialIcons name="event" size={22} color="#fff" />
                <Text style={styles.actionButtonText}>Reagendar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#6B7280', marginTop: 10 }]} onPress={() => showConfirmation('complete', 'Completar Cita', '¿Marcar esta cita como completada?')}>
                <MaterialIcons name="check" size={22} color="#fff" />
                <Text style={styles.actionButtonText}>Completar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#F97316', marginTop: 10 }]} onPress={() => showConfirmation('noshow', 'No asistió', '¿El cliente no se presentó?')}>
                <MaterialIcons name="cancel" size={22} color="#fff" />
                <Text style={styles.actionButtonText}>No asistió</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#EF4444', marginTop: 10 }]} onPress={() => showConfirmation('cancel', 'Cancelar Cita', '¿Estás seguro de que deseas cancelar esta cita?')}>
                <MaterialIcons name="close" size={22} color="#fff" />
                <Text style={styles.actionButtonText}>Cancelar</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>

      {/* ── Modal: Guardar como cliente ── */}
      <Modal
        visible={saveClientModal}
        transparent
        animationType="slide"
        onRequestClose={() => setSaveClientModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setSaveClientModal(false)}
          />
          <View style={[styles.modalBox, { backgroundColor: tc.surface }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: tc.text }]}>Guardar como cliente</Text>
              <TouchableOpacity onPress={() => setSaveClientModal(false)}>
                <MaterialIcons name="close" size={22} color={tc.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSub, { color: tc.textMuted }]}>
              Esta información se guardará en tu base de clientes y quedará vinculada a esta cita.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[styles.fieldLabel, { color: tc.textMuted }]}>Nombre *</Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: tc.inputBg, borderColor: tc.inputBorder, color: tc.text }]}
                value={clientForm.name}
                onChangeText={v => setClientForm(p => ({ ...p, name: v }))}
                placeholder="Nombre completo"
                placeholderTextColor={tc.textMuted}
                returnKeyType="next"
              />

              <Text style={[styles.fieldLabel, { color: tc.textMuted }]}>Teléfono / WhatsApp *</Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: tc.inputBg, borderColor: tc.inputBorder, color: tc.text }]}
                value={clientForm.phone}
                onChangeText={v => setClientForm(p => ({ ...p, phone: v }))}
                placeholder="Ej: 442 123 4567"
                placeholderTextColor={tc.textMuted}
                keyboardType="phone-pad"
                returnKeyType="next"
              />

              <Text style={[styles.fieldLabel, { color: tc.textMuted }]}>Email (opcional)</Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: tc.inputBg, borderColor: tc.inputBorder, color: tc.text }]}
                value={clientForm.email}
                onChangeText={v => setClientForm(p => ({ ...p, email: v }))}
                placeholder="correo@ejemplo.com"
                placeholderTextColor={tc.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType="next"
              />

              <Text style={[styles.fieldLabel, { color: tc.textMuted }]}>Notas (opcional)</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldTextarea, { backgroundColor: tc.inputBg, borderColor: tc.inputBorder, color: tc.text }]}
                value={clientForm.notes}
                onChangeText={v => setClientForm(p => ({ ...p, notes: v }))}
                placeholder="Preferencias, alergias..."
                placeholderTextColor={tc.textMuted}
                multiline
              />

              <TouchableOpacity
                style={[styles.modalSaveBtn, savingClient && { opacity: 0.6 }]}
                onPress={handleSaveAsClient}
                disabled={savingClient}
              >
                {savingClient
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <MaterialIcons name="person-add-alt" size={18} color="#fff" />
                      <Text style={styles.modalSaveBtnText}>Guardar cliente</Text>
                    </>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmModal
        visible={confirmModal.visible}
        title={confirmModal.title}
        message={confirmModal.message}
        buttons={[
          { text: 'Cancelar', onPress: () => setConfirmModal({ visible: false, action: '', title: '', message: '' }), style: 'cancel' },
          { text: 'Confirmar', onPress: handleConfirmAction, style: 'destructive' },
        ]}
        onDismiss={() => setConfirmModal({ visible: false, action: '', title: '', message: '' })}
      />
      <ConfirmModal
        visible={errorModal.visible}
        title="Error"
        message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'cancel' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })}
      />

      {actionLoading && (
        <View style={styles.actionLoadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:            { flex: 1 },
  loadingContainer:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText:          { marginTop: 16, fontSize: 16 },
  header:               { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  backButton:           { padding: 4 },
  title:                { fontSize: 18, fontWeight: '700' },
  deleteButton:         { padding: 4 },
  content:              { flex: 1 },
  // Status card
  statusCard:           { alignItems: 'center', paddingVertical: 20, marginBottom: 12, gap: 8 },
  statusBadge:          { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  statusText:           { fontSize: 15, fontWeight: '700', color: '#fff' },
  publicLinkBadge:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  publicLinkText:       { fontSize: 12, color: '#3B82F6', fontWeight: '600' },
  // Sections
  section:              { padding: 20, marginBottom: 12 },
  sectionTitle:         { fontSize: 17, fontWeight: '700', marginBottom: 16 },
  infoRow:              { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, gap: 12 },
  infoContent:          { flex: 1 },
  infoLabel:            { fontSize: 12, marginBottom: 3 },
  infoValue:            { fontSize: 16, fontWeight: '500' },
  // Cliente
  clientSectionHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  saveClientBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#10B981', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  saveClientBtnText:    { fontSize: 12, fontWeight: '700', color: '#fff' },
  clientCard:           { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  clientAvatar:         { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  clientAvatarText:     { fontSize: 20, fontWeight: '700', color: '#fff' },
  clientInfo:           { flex: 1, gap: 4 },
  clientName:           { fontSize: 16, fontWeight: '700' },
  clientPhoneRow:       { flexDirection: 'row', alignItems: 'center', gap: 5 },
  clientPhone:          { fontSize: 13 },
  notSavedPill:         { alignSelf: 'flex-start', backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 4 },
  notSavedText:         { fontSize: 11, color: '#92400E', fontWeight: '600' },
  // Acciones
  actionsSection:       { padding: 20, marginBottom: 32 },
  actionButton:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, borderRadius: 12, gap: 8 },
  actionButtonText:     { fontSize: 15, fontWeight: '700', color: '#fff' },
  solicitudBanner:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#3B82F6' },
  solicitudTitle:       { fontSize: 13, fontWeight: '700', color: '#3B82F6' },
  solicitudSub:         { fontSize: 12, color: '#6B7280', marginTop: 2 },
  actionLoadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  // Modal guardar cliente
  modalOverlay:         { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop:        { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalHandle:          { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 12 },
  modalBox:             { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '90%' },
  modalHeader:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  modalTitle:           { fontSize: 18, fontWeight: '800' },
  modalSub:             { fontSize: 13, lineHeight: 18, marginBottom: 14 },
  fieldLabel:           { fontSize: 12, fontWeight: '600', marginBottom: 5, marginTop: 8 },
  fieldInput:           { borderRadius: 12, borderWidth: 1.5, padding: 12, fontSize: 15 },
  fieldTextarea:        { height: 70, textAlignVertical: 'top' },
  modalSaveBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10B981', borderRadius: 14, padding: 16, marginTop: 16, marginBottom: 8 },
  modalSaveBtnText:     { color: '#fff', fontWeight: '800', fontSize: 15 },
});
