
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
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { getCached, setCached } from '@/utils/cache';
import { apiGet } from '@/utils/api';

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

type FilterType = 'Todos' | 'Activos' | 'Inactivos';

export default function ClientsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('Todos');
  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });

  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    loadClients().then(() => setInitialLoad(false));
  }, []);

  useEffect(() => {
    if (initialLoad) return;
    const timer = setTimeout(() => {
      loadClients(searchQuery || undefined);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadClients = async (search?: string) => {
    console.log('[Clients] Loading clients', search ? `with search: ${search}` : '');
    setLoading(true);
    try {
      const endpoint = search
        ? `/api/clients?search=${encodeURIComponent(search)}`
        : '/api/clients';
      const data = await apiGet<Client[]>(endpoint);
      console.log('[Clients] Loaded:', data.length, 'clients');
      setClients(data);
      setCached('clients_list', data);
    } catch (error) {
      console.error('[Clients] Failed to load:', error);
      setErrorModal({ visible: true, message: 'Error al cargar los clientes' });
    } finally {
      setLoading(false);
    }
  };

  const getFilteredClients = () => {
    let filtered = clients;

    // Apply status filter (client-side, search is handled server-side)
    if (filter === 'Activos') {
      filtered = filtered.filter((c) => c.isActive !== false);
    } else if (filter === 'Inactivos') {
      filtered = filtered.filter((c) => c.isActive === false);
    }

    return filtered;
  };

  const filteredClients = getFilteredClients();

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const formatLastVisit = (lastVisit: string | null | undefined) => {
    if (!lastVisit) return 'Sin visitas';
    const date = new Date(lastVisit);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
    if (diffDays < 365) return `Hace ${Math.floor(diffDays / 30)} meses`;
    return `Hace ${Math.floor(diffDays / 365)} años`;
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
        <Text style={styles.title}>Clientes</Text>
        
        {/* Search bar */}
        <View style={styles.searchContainer}>
          <IconSymbol
            android_material_icon_name="search"
            size={20}
            color={colors.textSecondary}
          />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Buscar cliente..."
            placeholderTextColor={colors.textSecondary}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <IconSymbol
                android_material_icon_name="close"
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filter tabs */}
        <View style={styles.filterContainer}>
          {(['Todos', 'Activos', 'Inactivos'] as FilterType[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterTab, filter === f && styles.filterTabActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {filteredClients.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol
              android_material_icon_name="group"
              size={64}
              color={colors.textSecondary}
            />
            <Text style={styles.emptyStateText}>
              {searchQuery
                ? 'No se encontraron clientes'
                : filter === 'Inactivos'
                ? 'No hay clientes inactivos'
                : 'No tienes clientes registrados'}
            </Text>
            <Text style={styles.emptyStateSubtext}>
              {searchQuery
                ? 'Intenta con otro término de búsqueda'
                : 'Agrega tu primer cliente para comenzar'}
            </Text>
            {!searchQuery && (
              <TouchableOpacity
                style={styles.emptyStateButton}
                onPress={() => {
                  console.log('User tapped Nuevo Cliente button');
                  router.push('/clients/new');
                }}
              >
                <Text style={styles.emptyStateButtonText}>Nuevo Cliente</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {filter === 'Inactivos' && (
              <TouchableOpacity
                style={styles.inactivesBanner}
                onPress={() => {
                  console.log('User tapped view inactive clients');
                  router.push('/clients/inactive');
                }}
              >
                <IconSymbol
                  android_material_icon_name="warning"
                  size={24}
                  color={colors.warning}
                />
                <View style={styles.inactivesBannerText}>
                  <Text style={styles.inactivesBannerTitle}>Clientes Inactivos</Text>
                  <Text style={styles.inactivesBannerSubtitle}>
                    Ver clientes sin visita en 90+ días
                  </Text>
                </View>
                <IconSymbol
                  android_material_icon_name="arrow-forward"
                  size={24}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            )}

            {filteredClients.map((client) => {
              const isActive = client.isActive !== false;
              const initials = getInitials(client.name);
              const lastVisitText = formatLastVisit(client.lastVisit);
              const totalAppointmentsText = `${client.totalVisits} ${
                client.totalVisits === 1 ? 'cita' : 'citas'
              }`;

              return (
                <TouchableOpacity
                  key={client.id}
                  style={styles.clientCard}
                  onPress={() => {
                    console.log('User tapped client:', client.id);
                    router.push(`/clients/${client.id}`);
                  }}
                >
                  <View style={styles.clientAvatar}>
                    <Text style={styles.clientAvatarText}>{initials}</Text>
                  </View>
                  <View style={styles.clientInfo}>
                    <View style={styles.clientNameRow}>
                      <Text style={styles.clientName}>{client.name}</Text>
                      <View
                        style={[
                          styles.statusDot,
                          isActive ? styles.statusDotActive : styles.statusDotInactive,
                        ]}
                      />
                    </View>
                    <Text style={styles.clientPhone}>{client.phone}</Text>
                    <View style={styles.clientStats}>
                      <Text style={styles.clientStatsText}>{lastVisitText}</Text>
                      <Text style={styles.clientStatsSeparator}>•</Text>
                      <Text style={styles.clientStatsText}>{totalAppointmentsText}</Text>
                    </View>
                  </View>
                  <IconSymbol
                    android_material_icon_name="arrow-forward"
                    size={24}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          console.log('User tapped FAB to create client');
          router.push('/clients/new');
        }}
      >
        <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={32} color="#FFFFFF" />
      </TouchableOpacity>
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
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    marginLeft: 8,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  filterTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.background,
  },
  filterTabActive: {
    backgroundColor: colors.primary,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterTextActive: {
    color: '#FFFFFF',
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
    textAlign: 'center',
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
  inactivesBanner: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  inactivesBannerText: {
    flex: 1,
    marginLeft: 12,
  },
  inactivesBannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  inactivesBannerSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
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
    boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.3)',
    elevation: 8,
  },
  clientCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.05)',
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
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  clientInfo: {
    flex: 1,
  },
  clientNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clientName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginRight: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotActive: {
    backgroundColor: colors.primary,
  },
  statusDotInactive: {
    backgroundColor: colors.textSecondary,
  },
  clientPhone: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  clientStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  clientStatsText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  clientStatsSeparator: {
    fontSize: 12,
    color: colors.textSecondary,
    marginHorizontal: 6,
  },
});
