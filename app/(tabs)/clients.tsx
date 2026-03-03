
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
  email?: string | null;
  notes?: string | null;
  lastVisit?: string | null;
  totalVisits: number;
  createdAt: string;
}

export default function ClientsScreen() {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ visible: boolean; id: string | null }>({
    visible: false,
    id: null,
  });
  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });

  // Form state
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    console.log('[Clients] Loading clients');
    setLoading(true);
    try {
      const data = await apiGet<Client[]>('/api/clients');
      console.log('[Clients] Loaded:', data.length, 'clients');
      setClients(data);
    } catch (error) {
      console.error('[Clients] Failed to load:', error);
      setErrorModal({ visible: true, message: 'Error al cargar los clientes' });
    } finally {
      setLoading(false);
    }
  };

  const openCreateForm = () => {
    setEditingClient(null);
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormNotes('');
    setShowForm(true);
  };

  const openEditForm = (client: Client) => {
    setEditingClient(client);
    setFormName(client.name);
    setFormPhone(client.phone);
    setFormEmail(client.email || '');
    setFormNotes(client.notes || '');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName || !formPhone) {
      setErrorModal({ visible: true, message: 'El nombre y teléfono son requeridos' });
      return;
    }

    setSaving(true);
    try {
      const body = {
        name: formName,
        phone: formPhone,
        email: formEmail || undefined,
        notes: formNotes || undefined,
      };

      if (editingClient) {
        console.log('[Clients] Updating client:', editingClient.id);
        await apiPut(`/api/clients/${editingClient.id}`, body);
        console.log('[Clients] Client updated');
      } else {
        console.log('[Clients] Creating client');
        await apiPost('/api/clients', body);
        console.log('[Clients] Client created');
      }

      setShowForm(false);
      await loadClients();
    } catch (error: any) {
      console.error('[Clients] Save failed:', error);
      setErrorModal({ visible: true, message: error?.message || 'Error al guardar el cliente' });
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
      console.log('[Clients] Deleting client:', id);
      await apiDelete(`/api/clients/${id}`);
      console.log('[Clients] Client deleted');
      setClients((prev) => prev.filter((c) => c.id !== id));
    } catch (error: any) {
      console.error('[Clients] Delete failed:', error);
      setErrorModal({ visible: true, message: error?.message || 'Error al eliminar el cliente' });
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

  return (
    <SafeAreaView style={styles.container}>
      <ConfirmModal
        visible={deleteModal.visible}
        title="Eliminar cliente"
        message="¿Estás seguro de que deseas eliminar este cliente? Esta acción no se puede deshacer."
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
        <Text style={styles.title}>Clientes</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {clients.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol
              android_material_icon_name="group"
              size={64}
              color={colors.textSecondary}
            />
            <Text style={styles.emptyStateText}>No tienes clientes registrados</Text>
            <Text style={styles.emptyStateSubtext}>
              Agrega tu primer cliente para comenzar
            </Text>
            <TouchableOpacity
              style={styles.emptyStateButton}
              onPress={() => {
                console.log('User tapped Nuevo Cliente button');
                openCreateForm();
              }}
            >
              <Text style={styles.emptyStateButtonText}>Nuevo Cliente</Text>
            </TouchableOpacity>
          </View>
        ) : (
          clients.map((client) => (
            <View key={client.id} style={styles.clientCard}>
              <View style={styles.clientAvatar}>
                <Text style={styles.clientAvatarText}>
                  {client.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.clientInfo}>
                <Text style={styles.clientName}>{client.name}</Text>
                <Text style={styles.clientPhone}>{client.phone}</Text>
                {client.email ? (
                  <Text style={styles.clientEmail}>{client.email}</Text>
                ) : null}
                <Text style={styles.clientVisits}>
                  {client.totalVisits} {client.totalVisits === 1 ? 'visita' : 'visitas'}
                </Text>
              </View>
              <View style={styles.clientActions}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => {
                    console.log('User tapped edit client:', client.id);
                    openEditForm(client);
                  }}
                >
                  <IconSymbol android_material_icon_name="edit" size={20} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => {
                    console.log('User tapped delete client:', client.id);
                    confirmDelete(client.id);
                  }}
                >
                  <IconSymbol android_material_icon_name="delete" size={20} color={colors.error} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          console.log('User tapped FAB to create client');
          openCreateForm();
        }}
      >
        <IconSymbol
          android_material_icon_name="person-add"
          size={32}
          color="#FFFFFF"
        />
      </TouchableOpacity>

      {/* Client Form Modal */}
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
                {editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}
              </Text>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <IconSymbol android_material_icon_name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formScroll}>
              <Text style={styles.fieldLabel}>Nombre *</Text>
              <TextInput
                style={styles.input}
                value={formName}
                onChangeText={setFormName}
                placeholder="Nombre completo"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="words"
              />

              <Text style={styles.fieldLabel}>Teléfono *</Text>
              <TextInput
                style={styles.input}
                value={formPhone}
                onChangeText={setFormPhone}
                placeholder="+52 55 1234 5678"
                placeholderTextColor={colors.textSecondary}
                keyboardType="phone-pad"
              />

              <Text style={styles.fieldLabel}>Correo electrónico (opcional)</Text>
              <TextInput
                style={styles.input}
                value={formEmail}
                onChangeText={setFormEmail}
                placeholder="cliente@email.com"
                placeholderTextColor={colors.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.fieldLabel}>Notas (opcional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formNotes}
                onChangeText={setFormNotes}
                placeholder="Notas sobre el cliente..."
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
                    {editingClient ? 'Guardar cambios' : 'Agregar cliente'}
                  </Text>
                )}
              </TouchableOpacity>
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
  clientCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  clientAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  clientAvatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  clientPhone: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  clientEmail: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 1,
  },
  clientVisits: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  clientActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.background,
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
    maxHeight: '85%',
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
});
