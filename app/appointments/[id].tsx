
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { apiGet, apiPut, apiPatch, apiDelete } from "@/utils/api";
import React, { useEffect, useState } from 'react';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ConfirmModal } from '@/components/button';

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
  status: 'Confirmada' | 'Pendiente' | 'Cancelada' | 'Completada' | 'No-show' | 'Reagendada';
  notes?: string | null;
  client: Client;
  clientId: string;
  userId: string;
  createdAt: string;
}

interface WhatsAppMessage {
  id: string;
  type: 'sent' | 'received';
  message: string;
  timestamp: string;
}

export default function AppointmentDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [whatsappMessages] = useState<WhatsAppMessage[]>([]);
  const [confirmModal, setConfirmModal] = useState({ visible: false, action: '', title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });

  useEffect(() => {
    loadAppointment();
  }, [id]);

  const loadAppointment = async () => {
    setLoading(true);
    try {
      console.log('[AppointmentDetail] Loading appointment:', id);
      // Load all appointments and find the one with matching id
      const appointments = await apiGet<Appointment[]>('/api/appointments');
      const found = appointments.find((appt) => appt.id === id);
      if (found) {
        console.log('[AppointmentDetail] Loaded appointment:', found);
        setAppointment(found);
      } else {
        console.error('[AppointmentDetail] Appointment not found');
        router.back();
      }
    } catch (error) {
      console.error('[AppointmentDetail] Error loading appointment:', error);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Confirmada':
        return '#10B981';
      case 'Pendiente':
        return '#F59E0B';
      case 'Cancelada':
        return '#EF4444';
      case 'Completada':
        return '#6B7280';
      case 'No-show':
        return '#F97316';
      case 'Reagendada':
        return '#3B82F6';
      default:
        return colors.text;
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!appointment) return;

    console.log('[AppointmentDetail] Changing status to:', newStatus);
    setActionLoading(true);
    try {
      // Use PUT /api/appointments/{id} to update status
      await apiPatch(`/api/appointments/${appointment.id}`, { status: newStatus });
      await loadAppointment();
    } catch (error: any) {
      console.error('[AppointmentDetail] Error updating status:', error);
      setErrorModal({ visible: true, message: error?.message || 'Error al actualizar el estado' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReschedule = () => {
    console.log('[AppointmentDetail] Navigate to reschedule');
    router.push(`/appointments/${id}/reschedule`);
  };

  const handleDelete = async () => {
    if (!appointment) return;

    console.log('[AppointmentDetail] Deleting appointment:', appointment.id);
    setActionLoading(true);
    try {
      await apiDelete(`/api/appointments/${appointment.id}`);
      console.log('[AppointmentDetail] Appointment deleted');
      router.back();
    } catch (error: any) {
      console.error('[AppointmentDetail] Error deleting appointment:', error);
      setErrorModal({ visible: true, message: error?.message || 'Error al eliminar la cita' });
      setActionLoading(false);
    }
  };

  const showConfirmation = (action: string, title: string, message: string) => {
    setConfirmModal({ visible: true, action, title, message });
  };

  const handleConfirmAction = () => {
    const action = confirmModal.action;
    setConfirmModal({ visible: false, action: '', title: '', message: '' });

    switch (action) {
      case 'confirm':
        handleStatusChange('Confirmada');
        break;
      case 'cancel':
        handleStatusChange('Cancelada');
        break;
      case 'complete':
        handleStatusChange('Completada');
        break;
      case 'noshow':
        handleStatusChange('No-show');
        break;
      case 'delete':
        handleDelete();
        break;
    }
  };

  if (loading || !appointment) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Cargando detalles...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = getStatusColor(appointment.status);
  // Add T12:00:00 to avoid timezone issues with date-only strings
  const formattedDate = new Date(appointment.date + 'T12:00:00').toLocaleDateString('es-MX', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={styles.title}>Detalle de Cita</Text>
        <TouchableOpacity
          onPress={() => showConfirmation('delete', 'Eliminar Cita', '¿Estás seguro de que deseas eliminar esta cita?')}
          style={styles.deleteButton}
        >
          <IconSymbol
            ios_icon_name="trash"
            android_material_icon_name="delete"
            size={24}
            color="#EF4444"
          />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.statusCard}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{appointment.status}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Información de la Cita</Text>
          
          <View style={styles.infoRow}>
            <IconSymbol
              ios_icon_name="calendar"
              android_material_icon_name="event"
              size={24}
              color={colors.primary}
            />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Fecha</Text>
              <Text style={styles.infoValue}>{formattedDate}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <IconSymbol
              ios_icon_name="clock"
              android_material_icon_name="access-time"
              size={24}
              color={colors.primary}
            />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Hora</Text>
              <Text style={styles.infoValue}>{appointment.time}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <IconSymbol
              ios_icon_name="scissors"
              android_material_icon_name="content-cut"
              size={24}
              color={colors.primary}
            />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Servicio</Text>
              <Text style={styles.infoValue}>{appointment.service || 'Servicio'}</Text>
            </View>
          </View>

          {appointment.notes && (
            <View style={styles.infoRow}>
              <IconSymbol
                ios_icon_name="note"
                android_material_icon_name="description"
                size={24}
                color={colors.primary}
              />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Notas</Text>
                <Text style={styles.infoValue}>{appointment.notes}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cliente</Text>
          
          <View style={styles.clientCard}>
            <View style={styles.clientAvatar}>
              <Text style={styles.clientAvatarText}>
                {appointment.client.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.clientInfo}>
              <Text style={styles.clientName}>{appointment.client.name}</Text>
              <Text style={styles.clientPhone}>{appointment.client.phone}</Text>
              {appointment.client.email && (
                <Text style={styles.clientEmail}>{appointment.client.email}</Text>
              )}
            </View>
          </View>
        </View>

        {whatsappMessages.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Mensajes de WhatsApp</Text>
            <View style={styles.messagesContainer}>
              {whatsappMessages.map((msg) => (
                <View
                  key={msg.id}
                  style={[
                    styles.messageCard,
                    msg.type === 'sent' ? styles.messageSent : styles.messageReceived,
                  ]}
                >
                  <Text style={styles.messageText}>{msg.message}</Text>
                  <Text style={styles.messageTime}>{msg.timestamp}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>Acciones</Text>
          
          {appointment.status === 'Pendiente' && (
            <TouchableOpacity
              style={[styles.actionButton, styles.confirmButton]}
              onPress={() => showConfirmation('confirm', 'Confirmar Cita', '¿Deseas confirmar esta cita?')}
            >
              <IconSymbol
                ios_icon_name="checkmark.circle"
                android_material_icon_name="check-circle"
                size={24}
                color="#ffffff"
              />
              <Text style={styles.actionButtonText}>Confirmar</Text>
            </TouchableOpacity>
          )}

          {(appointment.status === 'Pendiente' || appointment.status === 'Confirmada') && (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.rescheduleButton]}
                onPress={handleReschedule}
              >
                <IconSymbol
                  ios_icon_name="calendar"
                  android_material_icon_name="event"
                  size={24}
                  color="#ffffff"
                />
                <Text style={styles.actionButtonText}>Reagendar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.completeButton]}
                onPress={() => showConfirmation('complete', 'Completar Cita', '¿Marcar esta cita como completada?')}
              >
                <IconSymbol
                  ios_icon_name="checkmark"
                  android_material_icon_name="check"
                  size={24}
                  color="#ffffff"
                />
                <Text style={styles.actionButtonText}>Completar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.noshowButton]}
                onPress={() => showConfirmation('noshow', 'Marcar No-show', '¿El cliente no se presentó a la cita?')}
              >
                <IconSymbol
                  ios_icon_name="xmark.circle"
                  android_material_icon_name="cancel"
                  size={24}
                  color="#ffffff"
                />
                <Text style={styles.actionButtonText}>No-show</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={() => showConfirmation('cancel', 'Cancelar Cita', '¿Estás seguro de que deseas cancelar esta cita?')}
              >
                <IconSymbol
                  ios_icon_name="xmark"
                  android_material_icon_name="close"
                  size={24}
                  color="#ffffff"
                />
                <Text style={styles.actionButtonText}>Cancelar</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>

      <ConfirmModal
        visible={confirmModal.visible}
        title={confirmModal.title}
        message={confirmModal.message}
        buttons={[
          {
            text: 'Cancelar',
            onPress: () => setConfirmModal({ visible: false, action: '', title: '', message: '' }),
            style: 'cancel',
          },
          {
            text: 'Confirmar',
            onPress: handleConfirmAction,
            style: 'destructive',
          },
        ]}
        onDismiss={() => setConfirmModal({ visible: false, action: '', title: '', message: '' })}
      />

      <ConfirmModal
        visible={errorModal.visible}
        title="Error"
        message={errorModal.message}
        buttons={[
          {
            text: 'Aceptar',
            onPress: () => setErrorModal({ visible: false, message: '' }),
            style: 'cancel',
          },
        ]}
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
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  deleteButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  statusCard: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: '#ffffff',
    marginBottom: 16,
  },
  statusBadge: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  section: {
    backgroundColor: '#ffffff',
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  clientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clientAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clientAvatarText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  clientPhone: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  clientEmail: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  messagesContainer: {
    gap: 12,
  },
  messageCard: {
    padding: 12,
    borderRadius: 12,
    maxWidth: '80%',
  },
  messageSent: {
    backgroundColor: colors.primary,
    alignSelf: 'flex-end',
  },
  messageReceived: {
    backgroundColor: '#F3F4F6',
    alignSelf: 'flex-start',
  },
  messageText: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 4,
  },
  messageTime: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  actionsSection: {
    backgroundColor: '#ffffff',
    padding: 20,
    marginBottom: 32,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    gap: 8,
  },
  confirmButton: {
    backgroundColor: '#10B981',
  },
  rescheduleButton: {
    backgroundColor: '#3B82F6',
  },
  completeButton: {
    backgroundColor: '#6B7280',
  },
  noshowButton: {
    backgroundColor: '#F97316',
  },
  cancelButton: {
    backgroundColor: '#EF4444',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  actionLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
