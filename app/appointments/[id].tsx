
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { useAuth } from '@/contexts/AuthContext';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { supabase } from '@/lib/supabase';

interface Client {
  id: string;
  name: string;
  phone: string;
  email?: string;
}

interface StaffMember {
  id: string;
  name: string;
  role: string | null;
  color: string;
  busy?: boolean;
}

interface Appointment {
  id: string;
  date: string;
  time: string;
  endTime?: string;
  end_time?: string;
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
  staff_id?: string | null;
}

function getReportsCacheKey() {
  const n = new Date();
  return `reports_stats_${n.getFullYear()}_${n.getMonth() + 1}`;
}

export default function AppointmentDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: tc } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // ⚡ Padding inferior dinámico para respetar zona de tolerancia (May 17 2026)
  const safeBottom = Math.max(insets.bottom, 16);

  const [loading, setLoading]             = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [appointment, setAppointment]     = useState<Appointment | null>(null);
  const [staffMembers, setStaffMembers]   = useState<StaffMember[]>([]);
  const [confirmModal, setConfirmModal]   = useState({ visible: false, action: '', title: '', message: '' });
  const [errorModal, setErrorModal]       = useState({ visible: false, message: '' });
  const [saveClientModal, setSaveClientModal] = useState(false);
  const [savingClient, setSavingClient]       = useState(false);
  const [clientForm, setClientForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [assignStaffModal, setAssignStaffModal] = useState(false);
  const [assigningStaff, setAssigningStaff]     = useState(false);

  useEffect(() => { if (id) loadAll(); }, [id]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [data, staffData] = await Promise.all([
        apiGet<Appointment>(`/api/appointments/${id}`),
        supabase
          .from('staff_members')
          .select('id, name, role, color')
          .eq('user_id', user?.id)
          .eq('is_active', true)
          .order('sort_order')
          .then(r => r.data || []),
      ]);
      if (data) {
        setAppointment(data);
        if (data.source === 'public_link') {
          setClientForm(prev => ({ ...prev, name: data.clientNameTemp || '', phone: data.clientPhone || '' }));
        }
      } else {
        router.back();
      }
      setStaffMembers(staffData as StaffMember[]);
    } catch (error) {
      logger.error('[AppointmentDetail] Error loading:', error);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const loadStaffAvailability = async () => {
    if (!appointment) return;
    const appt = appointment;
    const startTime = appt.time;
    const endTime   = appt.endTime || appt.end_time;
    if (!startTime || !endTime) return;

    const { data: busyApts } = await supabase
      .from('appointments')
      .select('staff_id, start_time, end_time')
      .eq('user_id', user?.id)
      .eq('date', appt.date)
      .not('id', 'eq', appt.id)
      .not('status', 'in', '("Cancelada","No asistió","Rechazada")')
      .not('staff_id', 'is', null);

    if (!busyApts) return;

    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin   = eh * 60 + em;

    setStaffMembers(prev => prev.map(m => {
      const conflict = busyApts.some((a: any) => {
        if (a.staff_id !== m.id) return false;
        const [ash, asm] = (a.start_time || '00:00').split(':').map(Number);
        const [aeh, aem] = (a.end_time   || '00:00').split(':').map(Number);
        return startMin < aeh * 60 + aem && endMin > ash * 60 + asm;
      });
      return { ...m, busy: conflict };
    }));
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!appointment) return;
    setActionLoading(true);
    try {
      await apiPatch(`/api/appointments/${appointment.id}`, { status: newStatus });
      invalidateCaches();
      await loadAll();
    } catch (error: any) {
      setErrorModal({ visible: true, message: error?.message || 'Error al actualizar el estado' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignStaff = async (staffId: string | null) => {
    if (!appointment) return;
    if (staffId) {
      const staffMember = staffMembers.find(m => m.id === staffId);
      if (staffMember?.busy) {
        Alert.alert(
          'Horario ocupado',
          `${staffMember.name} ya tiene una cita en ese horario.`,
          [{ text: 'Entendido', style: 'cancel' }]
        );
        return;
      }
    }
    setAssigningStaff(true);
    try {
      await apiPatch(`/api/appointments/${appointment.id}`, { staff_id: staffId });
      invalidateCaches();
      setAssignStaffModal(false);
      await loadAll();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo asignar el colaborador.');
    } finally {
      setAssigningStaff(false);
    }
  };

  const invalidateCaches = () => {
    invalidateCache('dashboard_stats');
    invalidateCache('today_appointments');
    invalidateCache('week_appointments');
    invalidateCache('appointments_list');
    invalidateCache(getReportsCacheKey());
  };

  const handleReschedule = () => router.push(`/appointments/${id}/reschedule`);

  const handleDelete = async () => {
    if (!appointment) return;
    setActionLoading(true);
    try {
      await apiDelete(`/api/appointments/${appointment.id}`);
      invalidateCaches();
      router.back();
    } catch (error: any) {
      setErrorModal({ visible: true, message: error?.message || 'Error al eliminar la cita' });
      setActionLoading(false);
    }
  };

  const handleSaveAsClient = async () => {
    if (!appointment) return;
    if (!clientForm.name.trim() || !clientForm.phone.trim()) {
      Alert.alert('Campos requeridos', 'El nombre y teléfono son obligatorios.');
      return;
    }
    setSavingClient(true);
    try {
      const newClient = await apiPost<any>('/api/clients', {
        name:     clientForm.name.trim(),
        phone:    clientForm.phone.trim(),
        email:    clientForm.email.trim() || null,
        notes:    clientForm.notes.trim() || null,
        is_active: true,
      });
      const { error } = await supabase
        .from('appointments')
        .update({
          client_id:         newClient.id,
          client_name_temp:  null,
          client_phone_temp: null,
          updated_at:        new Date().toISOString(),
        })
        .eq('id', appointment.id);
      if (error) throw error;
      invalidateCache('clients_list');
      invalidateCache('appointments_list');
      setSaveClientModal(false);
      Alert.alert(
        '¡Cliente guardado!',
        `${clientForm.name.trim()} fue agregado a tu base de clientes.`,
        [
          { text: 'Ver cliente', onPress: () => router.push(`/clients/${newClient.id}`) },
          { text: 'Quedarse aquí', onPress: () => loadAll() },
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo guardar el cliente.');
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

  const statusColor   = getStatusColor(appointment.status);
  const formattedDate = formatDisplayDate(appointment.date);
  const isPublicLink  = appointment.source === 'public_link';
  const hasRealClient = !!appointment.client;
  const clientName    = appointment.client?.name || appointment.clientNameTemp || 'Cliente desconocido';
  const clientPhone   = appointment.client?.phone || appointment.clientPhone || '—';
  const clientEmail   = appointment.client?.email;
  const clientInitial = clientName.charAt(0).toUpperCase();
  const canSaveAsClient = isPublicLink && !hasRealClient;
  const hasStaff = staffMembers.length > 0;
  const assignedStaff = appointment.staff_id
    ? staffMembers.find(m => m.id === appointment.staff_id)
    : null;

  // ⚡ FIX BUG (May 18 2026): citas con status 'Reagendada' debían tratarse igual
  // que 'Pendiente' — ambas requieren que el dueño confirme la (nueva) fecha
  // con el cliente. Antes este estado NO tenía botones, dejando al usuario
  // atascado sin poder confirmar/cancelar/reagendar nuevamente la cita.
  const isPendingLike = appointment.status === 'Pendiente' || appointment.status === 'Reagendada';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>

      <View style={[styles.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={tc.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: tc.text }]}>Detalle de Cita</Text>
        <TouchableOpacity
          onPress={() => showConfirmation('delete', 'Eliminar Cita', '¿Estás seguro de que deseas eliminar esta cita? Esta acción no se puede deshacer.')}
          style={styles.deleteButton}
        >
          <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={24} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: safeBottom }}
        showsVerticalScrollIndicator={false}
      >

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

        {hasStaff && (
          <View style={[styles.section, { backgroundColor: tc.surface }]}>
            <View style={styles.staffSectionHeader}>
              <Text style={[styles.sectionTitle, { color: tc.text }]}>Colaborador</Text>
              <TouchableOpacity
                style={styles.assignBtn}
                onPress={() => { setAssignStaffModal(true); loadStaffAvailability(); }}
              >
                <MaterialIcons name={assignedStaff ? 'swap-horiz' : 'person-add-alt'} size={15} color="#fff" />
                <Text style={styles.assignBtnText}>{assignedStaff ? 'Cambiar' : 'Asignar'}</Text>
              </TouchableOpacity>
            </View>
            {assignedStaff ? (
              <View style={[styles.staffCard, { backgroundColor: tc.bg, borderColor: assignedStaff.color + '44' }]}>
                <View style={[styles.staffAvatar, { backgroundColor: assignedStaff.color + '20', borderColor: assignedStaff.color }]}>
                  <Text style={[styles.staffAvatarText, { color: assignedStaff.color }]}>
                    {assignedStaff.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </Text>
                </View>
                <View style={styles.staffInfo}>
                  <Text style={[styles.staffName, { color: tc.text }]}>{assignedStaff.name}</Text>
                  {assignedStaff.role && <Text style={[styles.staffRole, { color: tc.textMuted }]}>{assignedStaff.role}</Text>}
                </View>
                <View style={[styles.staffColorDot, { backgroundColor: assignedStaff.color }]} />
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.staffUnassigned, { backgroundColor: tc.bg, borderColor: tc.border }]}
                onPress={() => { setAssignStaffModal(true); loadStaffAvailability(); }}
              >
                <View style={[styles.staffAvatarEmpty, { backgroundColor: tc.border + '40' }]}>
                  <MaterialIcons name="person-outline" size={22} color={tc.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.staffUnassignedText, { color: tc.textMuted }]}>Sin colaborador asignado</Text>
                  <Text style={[styles.staffUnassignedSub, { color: tc.textMuted }]}>Toca para asignar</Text>
                </View>
                <MaterialIcons name="arrow-forward-ios" size={14} color={tc.border} />
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={[styles.section, { backgroundColor: tc.surface }]}>
          <View style={styles.clientSectionHeader}>
            <Text style={[styles.sectionTitle, { color: tc.text }]}>Cliente</Text>
            {canSaveAsClient && (
              <TouchableOpacity style={styles.saveClientBtn} onPress={() => setSaveClientModal(true)}>
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
              <TouchableOpacity style={styles.btnPrimary} onPress={() => showConfirmation('approve', 'Aceptar solicitud', `¿Confirmas la cita de ${clientName}?`)} activeOpacity={0.8}>
                <MaterialIcons name="check-circle" size={22} color="#fff" />
                <Text style={styles.btnPrimaryText}>Aceptar solicitud</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnOutline, { borderColor: '#EF4444', marginTop: 10 }]} onPress={() => showConfirmation('reject', 'Rechazar solicitud', '¿Deseas rechazar esta solicitud?')} activeOpacity={0.8}>
                <MaterialIcons name="cancel" size={18} color="#EF4444" />
                <Text style={[styles.btnOutlineText, { color: '#EF4444' }]}>Rechazar solicitud</Text>
              </TouchableOpacity>
            </View>
          )}

          {appointment.status === 'En espera' && (
            <View>
              <View style={[styles.solicitudBanner, { backgroundColor: '#F3E8FF', borderColor: '#8B5CF6' }]}>
                <MaterialIcons name="hourglass-empty" size={16} color="#8B5CF6" />
                <Text style={[styles.solicitudTitle, { color: '#8B5CF6' }]}>Cita en espera de confirmación</Text>
              </View>
              <TouchableOpacity style={styles.btnPrimary} onPress={() => showConfirmation('approve', 'Aprobar cita', '¿Confirmas que puedes atender esta cita?')} activeOpacity={0.8}>
                <MaterialIcons name="check-circle" size={22} color="#fff" />
                <Text style={styles.btnPrimaryText}>Aprobar cita</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={handleReschedule} activeOpacity={0.8}>
                <MaterialIcons name="event" size={18} color="#3B82F6" />
                <Text style={styles.btnSecondaryText}>Modificar horario</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnOutline, { borderColor: '#EF4444' }]} onPress={() => showConfirmation('reject', 'Rechazar cita', '¿Deseas rechazar esta cita?')} activeOpacity={0.8}>
                <MaterialIcons name="cancel" size={18} color="#EF4444" />
                <Text style={[styles.btnOutlineText, { color: '#EF4444' }]}>Rechazar cita</Text>
              </TouchableOpacity>
            </View>
          )}

          {isPendingLike && (
            <View>
              {/* ⚡ Banner informativo SOLO para citas reagendadas: aclara al
                  dueño que la nueva fecha aún necesita confirmación del cliente. */}
              {appointment.status === 'Reagendada' && (
                <View style={[styles.solicitudBanner, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
                  <MaterialIcons name="event-repeat" size={16} color="#F59E0B" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.solicitudTitle, { color: '#92400E' }]}>Cita reagendada</Text>
                    <Text style={styles.solicitudSub}>Confirma la nueva fecha con el cliente.</Text>
                  </View>
                </View>
              )}
              <TouchableOpacity style={styles.btnPrimary} onPress={() => showConfirmation('confirm', 'Confirmar Cita', '¿Deseas confirmar esta cita?')} activeOpacity={0.8}>
                <MaterialIcons name="check-circle" size={22} color="#fff" />
                <Text style={styles.btnPrimaryText}>Confirmar cita</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={handleReschedule} activeOpacity={0.8}>
                <MaterialIcons name="event" size={18} color="#3B82F6" />
                <Text style={styles.btnSecondaryText}>Reagendar</Text>
              </TouchableOpacity>
              <View style={styles.destructiveRow}>
                <TouchableOpacity style={[styles.btnOutlineSmall, { borderColor: '#F97316', flex: 1 }]} onPress={() => showConfirmation('noshow', 'No asistió', '¿El cliente no se presentó?')} activeOpacity={0.8}>
                  <MaterialIcons name="person-off" size={16} color="#F97316" />
                  <Text style={[styles.btnOutlineSmallText, { color: '#F97316' }]}>No asistió</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btnOutlineSmall, { borderColor: '#EF4444', flex: 1 }]} onPress={() => showConfirmation('cancel', 'Cancelar Cita', '¿Estás seguro de que deseas cancelar esta cita?')} activeOpacity={0.8}>
                  <MaterialIcons name="close" size={16} color="#EF4444" />
                  <Text style={[styles.btnOutlineSmallText, { color: '#EF4444' }]}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {appointment.status === 'Confirmada' && (
            <View>
              <TouchableOpacity style={styles.btnPrimary} onPress={() => showConfirmation('complete', 'Completar Cita', '¿Marcar esta cita como completada?')} activeOpacity={0.8}>
                <MaterialIcons name="check" size={22} color="#fff" />
                <Text style={styles.btnPrimaryText}>Marcar como completada</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={handleReschedule} activeOpacity={0.8}>
                <MaterialIcons name="event" size={18} color="#3B82F6" />
                <Text style={styles.btnSecondaryText}>Reagendar</Text>
              </TouchableOpacity>
              <View style={styles.destructiveRow}>
                <TouchableOpacity style={[styles.btnOutlineSmall, { borderColor: '#F97316', flex: 1 }]} onPress={() => showConfirmation('noshow', 'No asistió', '¿El cliente no se presentó a la cita confirmada?')} activeOpacity={0.8}>
                  <MaterialIcons name="person-off" size={16} color="#F97316" />
                  <Text style={[styles.btnOutlineSmallText, { color: '#F97316' }]}>No asistió</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btnOutlineSmall, { borderColor: '#EF4444', flex: 1 }]} onPress={() => showConfirmation('cancel', 'Cancelar Cita', '¿Estás seguro de que deseas cancelar esta cita confirmada?')} activeOpacity={0.8}>
                  <MaterialIcons name="close" size={16} color="#EF4444" />
                  <Text style={[styles.btnOutlineSmallText, { color: '#EF4444' }]}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {appointment.status === 'Completada' && (
            <TouchableOpacity style={styles.btnPrimary} onPress={() => showConfirmation('paid', 'Marcar como Pagado', '¿Confirmas que ya se cobró este servicio?')} activeOpacity={0.8}>
              <MaterialIcons name="attach-money" size={22} color="#fff" />
              <Text style={styles.btnPrimaryText}>Marcar como pagado</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <Modal visible={assignStaffModal} transparent animationType="slide" onRequestClose={() => setAssignStaffModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setAssignStaffModal(false)} />
          <View style={[styles.modalBox, { backgroundColor: tc.surface }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: tc.text }]}>Asignar colaborador</Text>
              <TouchableOpacity onPress={() => setAssignStaffModal(false)}>
                <MaterialIcons name="close" size={22} color={tc.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSub, { color: tc.textMuted }]}>Selecciona quién atenderá esta cita.</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.staffOption, { backgroundColor: tc.bg, borderColor: tc.border }, !appointment.staff_id && { borderColor: '#10B981', backgroundColor: '#ECFDF5' }]}
                onPress={() => handleAssignStaff(null)}
                disabled={assigningStaff}
              >
                <View style={[styles.staffOptionAvatar, { backgroundColor: '#F1F5F9' }]}>
                  <MaterialIcons name="person-outline" size={22} color="#94A3B8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.staffOptionName, { color: tc.text }]}>Sin asignar</Text>
                  <Text style={[styles.staffOptionRole, { color: tc.textMuted }]}>Quitar asignación actual</Text>
                </View>
                {!appointment.staff_id && <MaterialIcons name="check-circle" size={20} color="#10B981" />}
              </TouchableOpacity>
              {staffMembers.map(m => {
                const isSelected = appointment.staff_id === m.id;
                const isBusy = m.busy === true;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[
                      styles.staffOption,
                      { backgroundColor: tc.bg, borderColor: tc.border },
                      isSelected && { borderColor: m.color, backgroundColor: m.color + '10' },
                      isBusy && { backgroundColor: '#FEF2F2', borderColor: '#FECACA', opacity: 0.7 },
                    ]}
                    onPress={() => handleAssignStaff(m.id)}
                    disabled={assigningStaff}
                  >
                    <View style={[styles.staffOptionAvatar, { backgroundColor: isBusy ? '#FEE2E2' : m.color + '18', borderWidth: 2, borderColor: isBusy ? '#FCA5A5' : m.color }]}>
                      <Text style={[styles.staffOptionInitials, { color: isBusy ? '#EF4444' : m.color }]}>
                        {m.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.staffOptionName, { color: isBusy ? '#EF4444' : tc.text }]}>{m.name}</Text>
                      {isBusy
                        ? <Text style={[styles.staffOptionRole, { color: '#EF4444' }]}>🚫 Ocupado en este horario</Text>
                        : m.role ? <Text style={[styles.staffOptionRole, { color: tc.textMuted }]}>{m.role}</Text> : null
                      }
                    </View>
                    {isSelected && !isBusy && <MaterialIcons name="check-circle" size={20} color={m.color} />}
                    {isBusy && <MaterialIcons name="block" size={20} color="#EF4444" />}
                    {assigningStaff && isSelected && <ActivityIndicator size="small" color={m.color} />}
                  </TouchableOpacity>
                );
              })}
              <View style={{ height: 30 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={saveClientModal} transparent animationType="slide" onRequestClose={() => setSaveClientModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setSaveClientModal(false)} />
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
              <TextInput style={[styles.fieldInput, { backgroundColor: tc.inputBg, borderColor: tc.inputBorder, color: tc.text }]} value={clientForm.name} onChangeText={v => setClientForm(p => ({ ...p, name: v }))} placeholder="Nombre completo" placeholderTextColor={tc.textMuted} returnKeyType="next" />
              <Text style={[styles.fieldLabel, { color: tc.textMuted }]}>Teléfono / WhatsApp *</Text>
              <TextInput style={[styles.fieldInput, { backgroundColor: tc.inputBg, borderColor: tc.inputBorder, color: tc.text }]} value={clientForm.phone} onChangeText={v => setClientForm(p => ({ ...p, phone: v }))} placeholder="Ej: 442 123 4567" placeholderTextColor={tc.textMuted} keyboardType="phone-pad" returnKeyType="next" />
              <Text style={[styles.fieldLabel, { color: tc.textMuted }]}>Email (opcional)</Text>
              <TextInput style={[styles.fieldInput, { backgroundColor: tc.inputBg, borderColor: tc.inputBorder, color: tc.text }]} value={clientForm.email} onChangeText={v => setClientForm(p => ({ ...p, email: v }))} placeholder="correo@ejemplo.com" placeholderTextColor={tc.textMuted} keyboardType="email-address" autoCapitalize="none" returnKeyType="next" />
              <Text style={[styles.fieldLabel, { color: tc.textMuted }]}>Notas (opcional)</Text>
              <TextInput style={[styles.fieldInput, styles.fieldTextarea, { backgroundColor: tc.inputBg, borderColor: tc.inputBorder, color: tc.text }]} value={clientForm.notes} onChangeText={v => setClientForm(p => ({ ...p, notes: v }))} placeholder="Preferencias, alergias..." placeholderTextColor={tc.textMuted} multiline />
              <TouchableOpacity style={[styles.modalSaveBtn, savingClient && { opacity: 0.6 }]} onPress={handleSaveAsClient} disabled={savingClient}>
                {savingClient
                  ? <ActivityIndicator color="#fff" />
                  : <><MaterialIcons name="person-add-alt" size={18} color="#fff" /><Text style={styles.modalSaveBtnText}>Guardar cliente</Text></>
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
  statusCard:           { alignItems: 'center', paddingVertical: 20, marginBottom: 12, gap: 8 },
  statusBadge:          { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  statusText:           { fontSize: 15, fontWeight: '700', color: '#fff' },
  publicLinkBadge:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  publicLinkText:       { fontSize: 12, color: '#3B82F6', fontWeight: '600' },
  section:              { padding: 20, marginBottom: 12 },
  sectionTitle:         { fontSize: 17, fontWeight: '700', marginBottom: 16 },
  infoRow:              { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, gap: 12 },
  infoContent:          { flex: 1 },
  infoLabel:            { fontSize: 12, marginBottom: 3 },
  infoValue:            { fontSize: 16, fontWeight: '500' },
  staffSectionHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  assignBtn:            { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#8B5CF6', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  assignBtnText:        { fontSize: 12, fontWeight: '700', color: '#fff' },
  staffCard:            { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5 },
  staffAvatar:          { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  staffAvatarText:      { fontSize: 15, fontWeight: '800' },
  staffInfo:            { flex: 1 },
  staffName:            { fontSize: 15, fontWeight: '700' },
  staffRole:            { fontSize: 12, marginTop: 2 },
  staffColorDot:        { width: 10, height: 10, borderRadius: 5 },
  staffUnassigned:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed' },
  staffAvatarEmpty:     { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  staffUnassignedText:  { fontSize: 14, fontWeight: '600' },
  staffUnassignedSub:   { fontSize: 12, marginTop: 2 },
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
  // ⚡ marginBottom: 32 removido (se aplica dinámico desde contentContainerStyle)
  actionsSection:       { padding: 20 },
  btnPrimary:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 16, marginBottom: 10 },
  btnPrimaryText:       { fontSize: 16, fontWeight: '800', color: '#fff' },
  btnSecondary:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#EFF6FF', borderRadius: 12, paddingVertical: 13, marginBottom: 10, borderWidth: 1, borderColor: '#BFDBFE' },
  btnSecondaryText:     { fontSize: 15, fontWeight: '700', color: '#3B82F6' },
  btnOutline:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 12, marginBottom: 8, borderWidth: 1.5, backgroundColor: 'transparent' },
  btnOutlineText:       { fontSize: 14, fontWeight: '700' },
  destructiveRow:       { flexDirection: 'row', gap: 10, marginTop: 2 },
  btnOutlineSmall:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 11, borderWidth: 1.5, backgroundColor: 'transparent' },
  btnOutlineSmallText:  { fontSize: 13, fontWeight: '700' },
  solicitudBanner:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#3B82F6' },
  solicitudTitle:       { fontSize: 13, fontWeight: '700', color: '#3B82F6' },
  solicitudSub:         { fontSize: 12, color: '#6B7280', marginTop: 2 },
  actionLoadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  modalOverlay:         { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop:        { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalHandle:          { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 12 },
  modalBox:             { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '90%' },
  modalHeader:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  modalTitle:           { fontSize: 18, fontWeight: '800' },
  modalSub:             { fontSize: 13, lineHeight: 18, marginBottom: 14 },
  staffOption:          { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, marginBottom: 8 },
  staffOptionAvatar:    { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  staffOptionInitials:  { fontSize: 15, fontWeight: '800' },
  staffOptionName:      { fontSize: 15, fontWeight: '700' },
  staffOptionRole:      { fontSize: 12, marginTop: 2 },
  fieldLabel:           { fontSize: 12, fontWeight: '600', marginBottom: 5, marginTop: 8 },
  fieldInput:           { borderRadius: 12, borderWidth: 1.5, padding: 12, fontSize: 15 },
  fieldTextarea:        { height: 70, textAlignVertical: 'top' },
  modalSaveBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10B981', borderRadius: 14, padding: 16, marginTop: 16, marginBottom: 8 },
  modalSaveBtnText:     { color: '#fff', fontWeight: '800', fontSize: 15 },
});
