import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { getCached, setCached } from '@/utils/cache';
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

type FilterType = 'Todos' | 'Activos' | 'Inactivos';

// Paleta de colores para avatares — asignado por inicial
const AVATAR_COLORS = [
  { bg: '#ECFDF5', fg: '#065F46' }, // green
  { bg: '#EEF2FF', fg: '#3730A3' }, // indigo
  { bg: '#FFF7ED', fg: '#92400E' }, // amber
  { bg: '#FEF2F2', fg: '#991B1B' }, // red
  { bg: '#F0FDF4', fg: '#166534' }, // emerald
  { bg: '#F5F3FF', fg: '#5B21B6' }, // violet
  { bg: '#ECFEFF', fg: '#155E75' }, // cyan
  { bg: '#FDF4FF', fg: '#86198F' }, // fuchsia
];

const getAvatarColor = (name: string) => {
  const idx = (name.charCodeAt(0) || 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
};

const getInitials = (name: string) => {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

const formatLastVisit = (lastVisit: string | null | undefined) => {
  if (!lastVisit) return null;
  const date = new Date(lastVisit);
  const diffDays = Math.ceil(Math.abs(new Date().getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} sem`;
  if (diffDays < 365) return `Hace ${Math.floor(diffDays / 30)} meses`;
  return `Hace ${Math.floor(diffDays / 365)} año${Math.floor(diffDays / 365) > 1 ? 's' : ''}`;
};

export default function ClientsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('Todos');
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => { loadClients().then(() => setInitialLoad(false)); }, []);

  useEffect(() => {
    if (initialLoad) return;
    const timer = setTimeout(() => { loadClients(searchQuery || undefined); }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadClients = async (search?: string) => {
    setLoading(true);
    try {
      const endpoint = search ? `/api/clients?search=${encodeURIComponent(search)}` : '/api/clients';
      const data = await apiGet<Client[]>(endpoint);
      setClients(data); setCached('clients_list', data);
    } catch (error) {
      setErrorModal({ visible: true, message: 'Error al cargar los clientes' });
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = clients.filter((c) => {
    if (filter === 'Activos') return c.isActive !== false;
    if (filter === 'Inactivos') return c.isActive === false;
    return true;
  });

  const activeCount   = clients.filter(c => c.isActive !== false).length;
  const inactiveCount = clients.filter(c => c.isActive === false).length;

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <ConfirmModal
        visible={errorModal.visible}
        title="Error"
        message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'cancel' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })}
      />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <View>
            <Text style={s.title}>Clientes</Text>
            <Text style={s.subtitle}>{clients.length} registrados</Text>
          </View>
          <View style={s.headerStats}>
            <View style={s.headerStat}>
              <Text style={s.headerStatNum}>{activeCount}</Text>
              <Text style={s.headerStatLabel}>Activos</Text>
            </View>
            <View style={[s.headerStat, { borderLeftWidth: 1, borderLeftColor: '#E2E8F0', paddingLeft: 12 }]}>
              <Text style={[s.headerStatNum, { color: '#94A3B8' }]}>{inactiveCount}</Text>
              <Text style={s.headerStatLabel}>Inactivos</Text>
            </View>
          </View>
        </View>

        {/* Búsqueda */}
        <View style={s.searchBox}>
          <MaterialIcons name="search" size={20} color="#94A3B8" />
          <TextInput
            style={s.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Buscar por nombre o teléfono..."
            placeholderTextColor="#CBD5E1"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MaterialIcons name="close" size={18} color="#94A3B8" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filtros */}
        <View style={s.filters}>
          {(['Todos', 'Activos', 'Inactivos'] as FilterType[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[s.filterBtn, filter === f && s.filterBtnActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {filteredClients.length === 0 ? (
          <View style={s.empty}>
            <MaterialIcons name="group" size={52} color="#CBD5E1" />
            <Text style={s.emptyTitle}>
              {searchQuery ? 'Sin resultados' : filter === 'Inactivos' ? 'Sin clientes inactivos' : 'Sin clientes aún'}
            </Text>
            <Text style={s.emptyDesc}>
              {searchQuery ? 'Intenta con otro término' : 'Agrega tu primer cliente'}
            </Text>
            {!searchQuery && (
              <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/clients/new')}>
                <Text style={s.emptyBtnText}>+ Nuevo cliente</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {filter === 'Inactivos' && (
              <TouchableOpacity style={s.inactiveBanner} onPress={() => router.push('/clients/inactive')}>
                <View style={s.inactiveBannerIcon}>
                  <MaterialIcons name="warning" size={20} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.inactiveBannerTitle}>Clientes sin visita reciente</Text>
                  <Text style={s.inactiveBannerDesc}>Ver campaña de reactivación →</Text>
                </View>
              </TouchableOpacity>
            )}

            {filteredClients.map((client) => {
              const avatarColor = getAvatarColor(client.name);
              const initials = getInitials(client.name);
              const lastVisit = formatLastVisit(client.lastVisit);
              const isActive = client.isActive !== false;

              return (
                <TouchableOpacity
                  key={client.id}
                  style={s.clientCard}
                  onPress={() => router.push(`/clients/${client.id}`)}
                  activeOpacity={0.75}
                >
                  {/* Avatar con color único */}
                  <View style={[s.avatar, { backgroundColor: avatarColor.bg }]}>
                    <Text style={[s.avatarText, { color: avatarColor.fg }]}>{initials}</Text>
                  </View>

                  <View style={s.clientInfo}>
                    <View style={s.clientNameRow}>
                      <Text style={s.clientName}>{client.name}</Text>
                      <View style={[s.activeDot, { backgroundColor: isActive ? '#10B981' : '#CBD5E1' }]} />
                    </View>
                    <Text style={s.clientPhone}>{client.phone}</Text>
                    <View style={s.clientMeta}>
                      {lastVisit && (
                        <View style={s.metaChip}>
                          <MaterialIcons name="access-time" size={11} color="#94A3B8" />
                          <Text style={s.metaText}>{lastVisit}</Text>
                        </View>
                      )}
                      <View style={s.metaChip}>
                        <MaterialIcons name="event" size={11} color="#94A3B8" />
                        <Text style={s.metaText}>{client.totalVisits} {client.totalVisits === 1 ? 'cita' : 'citas'}</Text>
                      </View>
                    </View>
                  </View>

                  <MaterialIcons name="chevron-right" size={20} color="#CBD5E1" />
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>

      <TouchableOpacity style={s.fab} onPress={() => router.push('/clients/new')}>
        <MaterialIcons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: { backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0' },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  title: { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: '#94A3B8', marginTop: 2 },
  headerStats: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  headerStat: { alignItems: 'center' },
  headerStatNum: { fontSize: 20, fontWeight: '800', color: '#10B981' },
  headerStatLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '500', marginTop: 1 },

  // Search
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 12, borderWidth: 0.5, borderColor: '#E2E8F0', gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#0F172A' },

  // Filters
  filters: { flexDirection: 'row', gap: 8 },
  filterBtn: { paddingVertical: 7, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#F8FAFC', borderWidth: 0.5, borderColor: '#E2E8F0' },
  filterBtnActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
  filterText: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
  filterTextActive: { color: '#fff' },

  scroll: { padding: 16, paddingBottom: 100 },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#0F172A' },
  emptyDesc: { fontSize: 13, color: '#94A3B8' },
  emptyBtn: { backgroundColor: '#10B981', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, marginTop: 8 },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Inactive banner
  inactiveBanner: {
    backgroundColor: '#FFFBEB', borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12,
    borderWidth: 0.5, borderColor: '#FDE68A',
  },
  inactiveBannerIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center' },
  inactiveBannerTitle: { fontSize: 13, fontWeight: '600', color: '#92400E' },
  inactiveBannerDesc: { fontSize: 12, color: '#B45309', marginTop: 2 },

  // Client card
  clientCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  avatar: { width: 46, height: 46, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800' },
  clientInfo: { flex: 1, gap: 2 },
  clientNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clientName: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  activeDot: { width: 8, height: 8, borderRadius: 4 },
  clientPhone: { fontSize: 13, color: '#94A3B8' },
  clientMeta: { flexDirection: 'row', gap: 10, marginTop: 4 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },

  // FAB
  fab: {
    position: 'absolute', right: 20, bottom: 100,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8,
  },
});
