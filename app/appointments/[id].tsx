
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

// ⚡ FIX BUG (May 18 2026): interface de servicios para el modal de cambio.
interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
}

interface Appointment {
  id: string;
  date: string;
  time: string;
  endTime?: string;
  end_time?: string;
  service: string;
  service_cost?: number | null;
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

// ⚡ FIX BUG (May 18 2026): helpers para calcular duración de la cita actual.
function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function calcApptDuration(startTime: string, endTime: string | null | undefined): number {
  if (!endTime) return 30;
  const diff = timeToMin(endTime) - timeToMin(startTime);
  return diff > 0 ? diff : 30;
}

// Estados de la cita en los que NO se permite cambiar de servicio.
// (Cancelada/No asistió/Rechazada = cita "cerrada"; Pagado = afecta reportes financieros.)
const STATUSES_LOCKED_FOR_SERVICE_CHANGE = ['Cancelada', 'No asistió', 'Rechazada', 'Pagado'];

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

  // ⚡ FIX BUG (May 18 2026): estado para modal "Cambiar servicio".
  const [services, setServices]                     = useState<Service[]>([]);
  const [changeServiceModal, setChangeServiceModal] = useState(false);
  const [changingService, setChangingService]       = useState(false);

  useEffect(() => { if (id) loadAll(); }, [id]);

  const loadAll = async () => {
    setLoading(true);
    try {
      // ⚡ FIX BUG (May 18 2026): cargar servicios junto con cita y staff
      // para que el modal "Cambiar servicio" tenga la lista lista al abrirlo.
      const [data, staffData, servicesData] = await Promise.all([
        apiGet<Appointment>(`/api/appointments/${id}`),
        supabase
          .from('staff_members')
          .select('id, name, role, color')
          .eq('user_id', user?.id)
          .eq('is_active', true)
          .order('sort_order')
          .then(r => r.data || []),
        apiGet<Service[]>('/api/services'),
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
      setServices(servicesData || []);
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

  // ⚡ FIX BUG (May 18 2026): cambiar servicio de una cita ya creada.
  //
  // Reglas de negocio (acordadas con usuario el 18 may 2026):
  //   1. Si el servicio nuevo tiene la MISMA duración que el actual:
  //      → Patch directo. Validamos que el slot siga libre con la nueva
  //        duración (debería estarlo porque es la misma, pero por seguridad
  //        chequeamos contra otras citas del mismo día).
  //      → Si hay conflicto (caso raro pero posible) → caemos al caso 2.
  //
  //   2. Si la duración cambia:
  //      → Redirigimos a la pantalla de reschedule con el servicio nuevo
  //        pre-seleccionado por URL params. Allí el usuario elige nuevo horario
  //        y al guardar se aplican AMBOS cambios (servicio + fecha/hora).
  const handleChangeService = async (svc: Service) => {
    if (!appointment) return;

    // No-op si seleccionó el mismo servicio ya asignado.
    if (svc.name === appointment.service) {
      setChangeServiceModal(false);
      return;
    }

    const currentEnd = appointment.endTime || appointment.end_time;
    const currentDuration = currentEnd ? calcApptDuration(appointment.time, currentEnd) : 30;
    const sameDuration = svc.durationMinutes === currentDuration;

    if (sameDuration) {
      setChangingService(true);
      try {
        // Validar conflicto en el slot actual contra otras citas (excluyendo esta).
        const startMin = timeToMin(appointment.time);
        const endMin   = startMin + svc.durationMinutes;
        const newEndTime = `${Math.floor(endMin/60).toString().padStart(2,'0')}:${(endMin%60).toString().padStart(2,'0')}`;

        const { data: conflicts } = await supabase
          .from('appointments')
          .select('id')
          .eq('user_id', user?.id)
          .eq('date', appointment.date)
          .neq('id', appointment.id)
          .not('status', 'in', '("Cancelada","No asistió","Rechazada")')
          .lt('start_time', newEndTime)
          .gt('end_time', appointment.time)
          .limit(1);

        if (conflicts && conflicts.length > 0) {
          // Conflicto detectado en mismo slot → redirigir a reagendar (Opción B).
          setChangeServiceModal(false);
          setChangingService(false);
          Alert.alert(
            'Conflicto en el horario',
            `El servicio "${svc.name}" tiene la misma duración, pero el slot actual ya no está libre. Elige un nuevo horario.`,
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Elegir horario',
                onPress: () => router.push({
                  pathname: `/appointments/${appointment.id}/reschedule`,
                  params: {
                    service_name: svc.name,
                    service_cost: String(svc.price),
                    duration: String(svc.durationMinutes),
                  },
                }),
              },
            ]
          );
          return;
        }

        // Sin conflicto → patch directo.
        await apiPatch(`/api/appointments/${appointment.id}`, {
          service_name: svc.name,
          service_cost: svc.price,
          end_time: newEndTime,
        });
        invalidateCaches();
        setChangeServiceModal(false);
        await loadAll();
        Alert.alert('✓ Servicio actualizado', `El servicio cambió a "${svc.name}".`);
      } catch (error: any) {
        logger.error('[AppointmentDetail] handleChangeService error:', error);
        Alert.alert('Error', error?.message || 'No se pudo cambiar el servicio.');
      } finally {
        setChangingService(false);
      }
      return;
    }

    // Duración distinta → redirigir a reagendar con servicio pre-seleccionado.
    setChangeServiceModal(false);
    Alert.alert(
      'El nuevo servicio dura distinto',
      `"${svc.name}" dura ${svc.durationMinutes} min (la cita actual dura ${currentDuration} min). Necesitas elegir un nuevo horario.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Elegir horario',
          onPress: () => router.push({
            pathname: `/appointments/${appointment.id}/reschedule`,
            params: {
              service_name: svc.name,
              service_cost: String(svc.price),
              duration: String(svc.durationMinutes),
            },
          }),
        },
      ]
    );
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

  // ⚡ FIX BUG (May 18 2026): determinar si se permite cambiar el servicio.
  // Bloqueamos solo en estados "cerrados" o de impacto financiero (Pagado).
  const canChangeService = !STATUSES_LOCKED_FOR_SERVICE_CHANGE.includes(appointment.status) && services.length > 0;
  const currentDuration = calcApptDuration(appointment.time, appointment.endTime || appointment.end_time);

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
              <View style={styles.serviceLabelRow}>
                <Text style={[styles.infoLabel, { color: tc.textMuted }]}>Servicio</Text>
                {/* ⚡ FIX BUG (May 18 2026): botón "Cambiar" para cambiar servicio
                    de una cita ya creada. Solo visible si el estado lo permite. */}
                {canChangeService && (
                  <TouchableOpacity
                    style={styles.changeServiceBtn}
                    onPress={() => setChangeServiceModal(true)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="swap-horiz" size={14} color="#fff" />
                    <Text style={styles.changeServiceBtnText}>Cambiar</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={[styles.infoValue, { color: tc.text }]}>{appointment.service || 'Servicio'}</Text>
              <Text style={[styles.serviceMeta, { color: tc.textMuted }]}>
                {currentDuration} min{appointment.service_cost ? ` · $${Number(appointment.service_cost).toLocaleString('es-MX')}` : ''}
              </Text>
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

      {/* ⚡ FIX BUG (May 18 2026): Modal "Cambiar servicio".
          Lista los servicios activos del negocio. Muestra duración + precio.
          Marca el servicio actual con check. Tap = handleChangeService. */}
      <Modal visible={changeServiceModal} transparent animationType="slide" onRequestClose={() => setChangeServiceModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setChangeServiceModal(false)} />
          <View style={[styles.modalBox, { backgroundColor: tc.surface }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: tc.text }]}>Cambiar servicio</Text>
              <TouchableOpacity onPress={() => setChangeServiceModal(false)}>
                <MaterialIcons name="close" size={22} color={tc.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSub, { color: tc.textMuted }]}>
              Si el nuevo servicio dura distinto, te llevaremos a elegir un nuevo horario.
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {services.length === 0 ? (
                <View style={styles.emptyServicesWrap}>
                  <MaterialIcons name="content-cut" size={32} color={tc.border} />
                  <Text style={[styles.emptyServicesText, { color: tc.textMuted }]}>
                    No tienes servicios activos. Configúralos en Ajustes &gt; Servicios.
                  </Text>
                </View>
              ) : services.map(svc => {
                const isCurrent = svc.name === appointment.service;
                const sameDuration = svc.durationMinutes === currentDuration;
                return (
                  <TouchableOpacity
                    key={svc.id}
                    style={[
                      styles.serviceOption,
                      { backgroundColor: tc.bg, borderColor: tc.border },
                      isCurrent && { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
                    ]}
                    onPress={() => handleChangeService(svc)}
                    disabled={changingService || isCurrent}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.serviceOptionIcon, { backgroundColor: colors.primary + '18' }]}>
                      <MaterialIcons name="content-cut" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.serviceOptionName, { color: tc.text }]} numberOfLines={1}>{svc.name}</Text>
                      <View style={styles.serviceOptionMeta}>
                        <Text style={[styles.serviceOptionDur, { color: tc.textMuted }]}>
                          {svc.durationMinutes} min
                        </Text>
                        <Text style={[styles.serviceOptionDur, { color: tc.textMuted }]}>·</Text>
                        <Text style={[styles.serviceOptionDur, { color: tc.textMuted }]}>
                          ${Number(svc.price).toLocaleString('es-MX')}
                        </Text>
                        {!isCurrent && !sameDuration && (
                          <View style={styles.diffDurationPill}>
                            <Text style={styles.diffDurationText}>requiere nuevo horario</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {isCurrent && <MaterialIcons name="check-circle" size={20} color={colors.primary} />}
                    {changingService && !isCurrent && <ActivityIndicator size="small" color={colors.primary} />}
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
  // ⚡ FIX BUG (May 18 2026): estilos para el botón "Cambiar" de servicio.
  serviceLabelRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  serviceMeta:          { fontSize: 12, marginTop: 4 },
  changeServiceBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#8B5CF6', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  changeServiceBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },
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
  // ⚡ FIX BUG (May 18 2026): estilos del modal "Cambiar servicio".
  serviceOption:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, marginBottom: 8 },
  serviceOptionIcon:    { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  serviceOptionName:    { fontSize: 15, fontWeight: '700' },
  serviceOptionMeta:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  serviceOptionDur:     { fontSize: 12 },
  diffDurationPill:     { backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 4 },
  diffDurationText:     { fontSize: 10, color: '#92400E', fontWeight: '700' },
  emptyServicesWrap:    { alignItems: 'center', padding: 24, gap: 12 },
  emptyServicesText:    { fontSize: 13, textAlign: 'center' },
});
