
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { apiGet, apiPost, apiPut, apiDelete } from '@/utils/api';

interface Client {
  id: string;
  name: string;
  phone: string;
}

interface Appointment {
  id: string;
  date: string;
  time: string;
  service: string;
  status: string;
  notes?: string | null;
  client: Client;
  clientId: string;
}

const STATUS_OPTIONS = [
  { value: 'confirmada', label: 'Confirmada' },
  { value: 'sin_confirmar', label: 'Sin confirmar' },
  { value: 'completada', label: 'Completada' },
  { value: 'cancelada', label: 'Cancelada' },
];

export default function AppointmentsScreen() {
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ visible: boolean; id: string | null }>({
    visible: false,
    id: null,
  });
  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  // Form state
  const [formClientId, setFormClientId] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');
  const [formService, setFormService] = useState('');
  const [formStatus, setFormStatus] = useState('sin_confirmar');
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    console.log('[Appointments] Loading appointments and clients');
    setLoading(true);
    try {
      const [apptData, clientData] = await Promise.all([
        apiGet<Appointment[]>('/api/appointments'),
        apiGet<Client[]>('/api/clients'),
      ]);
      console.log('[Appointments] Loaded:', apptData.length, 'appointments');
      setAppointments(apptData);
      setClients(clientData);
    } catch (error) {
      console.error('[Appointments] Failed to load:', error);
      setErrorModal({ visible: true, message: 'Error al cargar las citas' });
    } finally {
      setLoading(false);
    }
  };

  const openCreateForm = () => {
    setEditingAppointment(null);
    setFormClientId('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormTime('10:00');
    setFormService('');
    setFormStatus('sin_confirmar');
    setFormNotes('');
    setShowForm(true);
  };

  const openEditForm = (appt: Appointment) => {
    setEditingAppointment(appt);
    setFormClientId(appt.clientId);
    setFormDate(appt.date);
    setFormTime(appt.time);
    setFormService(appt.service);
    setFormStatus(appt.status);
    setFormNotes(appt.notes || '');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formClientId || !formDate || !formTime || !formService) {
      setErrorModal({ visible: true, message: 'Por favor completa todos los campos requeridos' });
      return;
    }

    setSaving(true);
    try {
      const body = {
        clientId: formClientId,
        date: formDate,
        time: formTime,
        service: formService,
        status: formStatus,
        notes: formNotes || undefined,
      };

      if (editingAppointment) {
        console.log('[Appointments] Updating appointment:', editingAppointment.id);
        await apiPut(`/api/appointments/${editingAppointment.id}`, body);
        console.log('[Appointments] Appointment updated');
      } else {
        console.log('[Appointments] Creating appointment');
        await apiPost('/api/appointments', body);
        console.log('[Appointments] Appointment created');
      }

      setShowForm(false);
      await loadData();
    } catch (error: any) {
      console.error('[Appointments] Save failed:', error);
      setErrorModal({ visible: true, message: error?.message || 'Error al guardar la cita' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (id: string) => {
    setDeleteModal({ visible: true, id });
  };

  const handleDelete = async () => {
    if (!deleteModal.id) return;
    const id = deleteModal.id;
    setDeleteModal({ visible: false, id: null });

    try {
      console.log('[Appointments] Deleting appointment:', id);
      await apiDelete(`/api/appointments/${id}`);
      console.log('[Appointments] Appointment deleted');
      setAppointments((prev) => prev.filter((a) => a.id !== id));
    } catch (error: any) {
      console.error('[Appointments] Delete failed:', error);
      setErrorModal({ visible: true, message: error?.message || 'Error al eliminar la cita' });
    }
  };

  const getStatusLabel = (status: string) => {
    return STATUS_OPTIONS.find((s) => s.value === status)?.label || status;
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'confirmada': return styles.statusConfirmed;
      case 'completada': return styles.statusCompleted;
      case 'cancelada': return styles.statusCancelled;
      default: return styles.statusPending;
    }
  };

  const selectedClient = clients.find((c) => c.id === formClientId);
  const selectedStatusLabel = STATUS_OPTIONS.find((s) => s.value === formStatus)?.label || 'Sin confirmar';

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ConfirmModal
        visible={deleteModal.visible}
        title="Eliminar cita"
        message="¿Estás seguro de que deseas eliminar esta cita? Esta acción no se puede deshacer."
        buttons={[
          {
            text: 'Eliminar',
            onPress: handleDelete,
            style: 'destructive',
          },
          {
            text: 'Cancelar',
            onPress: () => setDeleteModal({ visible: false, id: null }),
            style: 'cancel',
          },
        ]}
        onDismiss={() => setDeleteModal({ visible: false, id: null })}
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

      <View style={styles.header}>
        <Text style={styles.title}>Citas</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {appointments.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol
              android_material_icon_name="event-note"
              size={64}
              color={colors.textSecondary}
            />
            <Text style={styles.emptyStateText}>No tienes citas registradas</Text>
            <Text style={styles.emptyStateSubtext}>
              Comienza agregando tu primera cita
            </Text>
            <TouchableOpacity
              style={styles.emptyStateButton}
              onPress={() => {
                console.log('User tapped Nueva Cita button');
                openCreateForm();
              }}
            >
              <Text style={styles.emptyStateButtonText}>Nueva Cita</Text>
            </TouchableOpacity>
          </View>
        ) : (
          appointments.map((appt) => (
            <View key={appt.id} style={styles.appointmentCard}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Text style={styles.clientName}>{appt.client?.name}</Text>
                  <Text style={styles.serviceText}>{appt.service}</Text>
                </View>
                <View style={[styles.statusBadge, getStatusStyle(appt.status)]}>
                  <Text style={styles.statusText}>{getStatusLabel(appt.status)}</Text>
                </View>
              </View>
              <View style={styles.cardDetails}>
                <View style={styles.detailRow}>
                  <IconSymbol android_material_icon_name="calendar-today" size={16} color={colors.textSecondary} />
                  <Text style={styles.detailText}>{appt.date}</Text>
                </View>
                <View style={styles.detailRow}>
                  <IconSymbol android_material_icon_name="schedule" size={16} color={colors.textSecondary} />
                  <Text style={styles.detailText}>{appt.time}</Text>
                </View>
                {appt.client?.phone ? (
                  <View style={styles.detailRow}>
                    <IconSymbol android_material_icon_name="phone" size={16} color={colors.textSecondary} />
                    <Text style={styles.detailText}>{appt.client.phone}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => {
                    console.log('User tapped edit appointment:', appt.id);
                    openEditForm(appt);
                  }}
                >
                  <IconSymbol android_material_icon_name="edit" size={18} color={colors.primary} />
                  <Text style={styles.editButtonText}>Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => {
                    console.log('User tapped delete appointment:', appt.id);
                    confirmDelete(appt.id);
                  }}
                >
                  <IconSymbol android_material_icon_name="delete" size={18} color={colors.error} />
                  <Text style={styles.deleteButtonText}>Eliminar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          console.log('User tapped FAB to create appointment');
          openCreateForm();
        }}
      >
        <IconSymbol
          android_material_icon_name="add"
          size={32}
          color="#FFFFFF"
        />
      </TouchableOpacity>

      {/* Appointment Form Modal */}
      <Modal
        visible={showForm}
        animationType="slide"
        transparent
        onRequestClose={() => setShowForm(false)}
      >
        <View style={styles.formOverlay}>
          <View style={styles.formContainer}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>
                {editingAppointment ? 'Editar Cita' : 'Nueva Cita'}
              </Text>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <IconSymbol android_material_icon_name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formScroll}>
              <Text style={styles.fieldLabel}>Cliente *</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowClientPicker(true)}
              >
                <Text style={[styles.pickerText, !formClientId && styles.pickerPlaceholder]}>
                  {selectedClient ? selectedClient.name : 'Seleccionar cliente'}
                </Text>
                <IconSymbol android_material_icon_name="arrow-drop-down" size={24} color={colors.textSecondary} />
              </TouchableOpacity>

              {clients.length === 0 && (
                <Text style={styles.noClientsText}>
                  No tienes clientes. Agrega uno en la pestaña Clientes.
                </Text>
              )}

              <Text style={styles.fieldLabel}>Fecha * (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={formDate}
                onChangeText={setFormDate}
                placeholder="2024-01-15"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.fieldLabel}>Hora * (HH:MM)</Text>
              <TextInput
                style={styles.input}
                value={formTime}
                onChangeText={setFormTime}
                placeholder="10:00"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.fieldLabel}>Servicio *</Text>
              <TextInput
                style={styles.input}
                value={formService}
                onChangeText={setFormService}
                placeholder="Ej: Corte de cabello"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.fieldLabel}>Estado</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowStatusPicker(true)}
              >
                <Text style={styles.pickerText}>{selectedStatusLabel}</Text>
                <IconSymbol android_material_icon_name="arrow-drop-down" size={24} color={colors.textSecondary} />
              </TouchableOpacity>

              <Text style={styles.fieldLabel}>Notas (opcional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formNotes}
                onChangeText={setFormNotes}
                placeholder="Notas adicionales..."
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={3}
              />

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingAppointment ? 'Guardar cambios' : 'Crear cita'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Client Picker Modal */}
      <Modal
        visible={showClientPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowClientPicker(false)}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Seleccionar cliente</Text>
              <TouchableOpacity onPress={() => setShowClientPicker(false)}>
                <IconSymbol android_material_icon_name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {clients.map((client) => (
                <TouchableOpacity
                  key={client.id}
                  style={styles.pickerOption}
                  onPress={() => {
                    setFormClientId(client.id);
                    setShowClientPicker(false);
                  }}
                >
                  <Text style={styles.pickerOptionText}>{client.name}</Text>
                  <Text style={styles.pickerOptionSubtext}>{client.phone}</Text>
                  {formClientId === client.id && (
                    <IconSymbol android_material_icon_name="check" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Status Picker Modal */}
      <Modal
        visible={showStatusPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowStatusPicker(false)}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Estado de la cita</Text>
              <TouchableOpacity onPress={() => setShowStatusPicker(false)}>
                <IconSymbol android_material_icon_name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {STATUS_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={styles.pickerOption}
                  onPress={() => {
                    setFormStatus(option.value);
                    setShowStatusPicker(false);
                  }}
                >
                  <Text style={styles.pickerOptionText}>{option.label}</Text>
                  {formStatus === option.value && (
                    <IconSymbol android_material_icon_name="check" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  header: {
    padding: 20,
    paddingTop: 48,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 100,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
    marginBottom: 24,
  },
  emptyStateButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyStateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  appointmentCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flex: 1,
    marginRight: 8,
  },
  clientName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  serviceText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusConfirmed: {
    backgroundColor: '#D1FAE5',
  },
  statusPending: {
    backgroundColor: '#FEF3C7',
  },
  statusCompleted: {
    backgroundColor: '#DBEAFE',
  },
  statusCancelled: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
  },
  cardDetails: {
    gap: 6,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  cardActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    gap: 12,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F0FDF4',
  },
  editButtonText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
  },
  deleteButtonText: {
    fontSize: 14,
    color: colors.error,
    fontWeight: '600',
  },
  formOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  formContainer: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  formScroll: {
    padding: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  pickerButton: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerText: {
    fontSize: 16,
    color: colors.text,
  },
  pickerPlaceholder: {
    color: colors.textSecondary,
  },
  noClientsText: {
    fontSize: 13,
    color: colors.warning,
    marginTop: 6,
    fontStyle: 'italic',
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 32,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '60%',
    paddingBottom: 32,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  pickerOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerOptionText: {
    fontSize: 16,
    color: colors.text,
    flex: 1,
  },
  pickerOptionSubtext: {
    fontSize: 13,
    color: colors.textSecondary,
    marginRight: 8,
  },
});
