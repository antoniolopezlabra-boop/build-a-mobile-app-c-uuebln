
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
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { apiGet } from '@/utils/api';

interface InactiveClient {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  lastVisit: string | null;
  totalVisits: number;
  daysSinceLastVisit: number;
}

export default function InactiveClientsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<InactiveClient[]>([]);
  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });

  useEffect(() => {
    loadInactiveClients();
  }, []);

  const loadInactiveClients = async () => {
    console.log('[InactiveClients] Loading inactive clients');
    setLoading(true);
    try {
      const data = await apiGet<InactiveClient[]>('/api/clients/inactive');
      console.log('[InactiveClients] Loaded:', data.length, 'inactive clients');
      setClients(data);
    } catch (error) {
      console.error('[InactiveClients] Failed to load:', error);
      setErrorModal({ visible: true, message: 'Error al cargar los clientes inactivos' });
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const formatDaysSince = (days: number) => {
    if (days < 30) return `${days} días`;
    if (days < 365) return `${Math.floor(days / 30)} meses`;
    return `${Math.floor(days / 365)} años`;
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Clientes Inactivos</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.infoCard}>
        <IconSymbol android_material_icon_name="info" size={24} color={colors.warning} />
        <Text style={styles.infoText}>
          Clientes sin visita en los últimos 90 días. Considera enviarles un mensaje para
          reactivarlos.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {clients.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol
              android_material_icon_name="check-circle"
              size={64}
              color={colors.primary}
            />
            <Text style={styles.emptyStateText}>¡Excelente!</Text>
            <Text style={styles.emptyStateSubtext}>
              No tienes clientes inactivos. Todos tus clientes están activos.
            </Text>
          </View>
        ) : (
          clients.map((client) => {
            const initials = getInitials(client.name);
            const daysSinceText = formatDaysSince(client.daysSinceLastVisit);

            return (
              <TouchableOpacity
                key={client.id}
                style={styles.clientCard}
                onPress={() => {
                  console.log('User tapped inactive client:', client.id);
                  router.push(`/clients/${client.id}`);
                }}
              >
                <View style={styles.clientAvatar}>
                  <Text style={styles.clientAvatarText}>{initials}</Text>
                </View>
                <View style={styles.clientInfo}>
                  <Text style={styles.clientName}>{client.name}</Text>
                  <Text style={styles.clientPhone}>{client.phone}</Text>
                  <View style={styles.inactiveInfo}>
                    <IconSymbol
                      android_material_icon_name="warning"
                      size={14}
                      color={colors.warning}
                    />
                    <Text style={styles.inactiveText}>Sin visita hace {daysSinceText}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.messageButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    console.log('User tapped send message to:', client.id);
                  }}
                >
                  <IconSymbol android_material_icon_name="message" size={20} color={colors.primary} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 48,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  placeholder: {
    width: 32,
  },
  infoCard: {
    backgroundColor: colors.card,
    margin: 20,
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    marginLeft: 12,
    lineHeight: 20,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 0,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
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
    backgroundColor: colors.textSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  clientAvatarText: {
    fontSize: 18,
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
  inactiveInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  inactiveText: {
    fontSize: 12,
    color: colors.warning,
    fontWeight: '600',
  },
  messageButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
});
