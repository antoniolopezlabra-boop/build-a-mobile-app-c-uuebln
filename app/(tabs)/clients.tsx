import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '@/styles/commonStyles';
import { ConfirmModal } from '@/components/button';
import { getCached, setCached, invalidateCache, CACHE_TTL } from '@/utils/cache';
import { apiGet } from '@/utils/api';
import { useTheme } from '@/contexts/ThemeContext';
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

const AVATAR_COLORS = [
  { bg: '#ECFDF5', fg: '#065F46' },
  { bg: '#EEF2FF', fg: '#3730A3' },
  { bg: '#FFF7ED', fg: '#92400E' },
  { bg: '#FEF2F2', fg: '#991B1B' },
  { bg: '#F0FDF4', fg: '#166534' },
  { bg: '#F5F3FF', fg: '#5B21B6' },
  { bg: '#ECFEFF', fg: '#155E75' },
  { bg: '#FDF4FF', fg: '#86198F' },
];

const AVATAR_COLORS_DARK = [
  { bg: '#052E16', fg: '#6EE7B7' },
  { bg: '#1E1B4B', fg: '#A5B4FC' },
  { bg: '#431407', fg: '#FED7AA' },
  { bg: '#450A0A', fg: '#FCA5A5' },
  { bg: '#052E16', fg: '#86EFAC' },
  { bg: '#2E1065', fg: '#DDD6FE' },
  { bg: '#083344', fg: '#67E8F9' },
  { bg: '#3B0764', fg: '#E879F9' },
];

const getAvatarColor = (name: string, dark: boolean) => {
  const arr = dark ? AVATAR_COLORS_DARK : AVATAR_COLORS;
  return arr[(name.charCodeAt(0) || 0) % arr.length];
};

const getInitials = (name: string) => {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

// FIX: usar T12:00:00 para evitar bug de timezone en lastVisit
const formatLastVisit = (lastVisit: string | null | undefined) => {
  if (!lastVisit) return null;
  const visitDate = new Date(lastVisit + 'T12:00:00');
  const diffDays = Math.ceil(Math.abs(new Date().getTime() - visitDate.getTime()) / 86400000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} sem`;
  if (diffDays < 365) return `Hace ${Math.floor(diffDays / 30)} meses`;
  return `Hace ${Math.floor(diffDays / 365)} año${Math.floor(diffDays / 365) > 1 ? 's' : ''}`;
};

export default function ClientsScreen() {
  const router = useRouter();
  const { colors: tc, isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('Todos');
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });

  // FIX: useFocusEffect para refrescar al volver de crear/editar cliente
  useFocusEffect(
    useCallback(() => {
      const cached = getCached<Client[]>('clients_list');
      if (cached) {
        setAllClients(cached);
        setLoading(false);
      } else {
        loadClients();
      }
    }, [])
  );

  const loadClients = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiGet<Client[]>('/api/clients');
      setAllClients(data);
      setCached('clients_list', data, CACHE_TTL.CLIENTS);
    } catch {
      setErrorModal({ visible: true, message: 'Error al cargar los clientes' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    invalidateCache('clients_list');
    loadClients(true);
  }, []);

  const filteredClients = allClients.filter((c) => {
    const matchesSearch = !searchQuery ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      (c.email || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      filter === 'Todos' ? true :
      filter === 'Activos' ? c.isActive !== false :
      c.isActive === false;
    return matchesSearch && matchesFilter;
  });

  const activeCount   = allClients.filter(c => c.isActive !== false).length;
  const inactiveCount = allClients.filter(c => c.isActive === false).length;

  if (loading && allClients.length === 0) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]}>
        <View style={s.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]}>
      <ConfirmModal
        visible={errorModal.visible}
        title="Error"
        message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'cancel' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })}
      />

      {/* Header */}
      <View style={[s.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        <View style={s.headerTop}>
          <View>
            <Text style={[s.title, { color: tc.text }]}>Clientes</Text>
            <Text style={[s.subtitle, { color: tc.textMuted }]}>{allClients.length} registrados</Text>
          </View>
          <View style={s.headerStats}>
            <View style={s.headerStat}>
              <Text style={s.headerStatNum}>{activeCount}</Text>
              <Text style={[s.headerStatLabel, { color: tc.textMuted }]}>Activos</Text>
            </View>
            <View style={[s.headerStat, { borderLeftWidth: 1, borderLeftColor: tc.border, paddingLeft: 12 }]}>
              <Text style={[s.headerStatNum, { color: tc.textMuted }]}>{inactiveCount}</Text>
              <Text style={[s.headerStatLabel, { color: tc.textMuted }]}>Inactivos</Text>
            </View>
          </View>
        </View>

        {/* Búsqueda */}
        <View style={[s.searchBox, { backgroundColor: tc.inputBg, borderColor: tc.inputBorder }]}>
          <MaterialIcons name="search" size={20} color={tc.textMuted} />
          <TextInput
            style={[s.searchInput, { color: tc.text }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Buscar por nombre, teléfono o email..."
            placeholderTextColor={tc.textMuted}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MaterialIcons name="close" size={18} color={tc.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filtros */}
        <View style={s.filters}>
          {(['Todos', 'Activos', 'Inactivos'] as FilterType[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[
                s.filterBtn,
                { backgroundColor: tc.inputBg, borderColor: tc.border },
                filter === f && s.filterBtnActive,
              ]}
              onPress={() => setFilter(f)}
            >
              <Text style={[s.filterText, { color: tc.textMuted }, filter === f && s.filterTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {filteredClients.length === 0 ? (
          <View style={s.empty}>
            <View style={[s.emptyIconWrap, { backgroundColor: tc.surface }]}>
              <MaterialIcons name="group" size={36} color={tc.border} />
            </View>
            <Text style={[s.emptyTitle, { color: tc.text }]}>
              {searchQuery ? 'Sin resultados' : filter === 'Inactivos' ? 'Sin clientes inactivos' : 'Sin clientes aún'}
            </Text>
            <Text style={[s.emptyDesc, { color: tc.textMuted }]}>
              {searchQuery ? 'Intenta con otro término' : 'Agrega tu primer cliente'}
            </Text>
            {!searchQuery && (
              <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/clients/new')}>
                <MaterialIcons name="person-add-alt" size={16} color="#fff" />
                <Text style={s.emptyBtnText}>Nuevo cliente</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {filter === 'Inactivos' && (
              <TouchableOpacity
                style={[s.inactiveBanner, { backgroundColor: isDark ? '#431407' : '#FFFBEB', borderColor: isDark ? '#92400E' : '#FDE68A' }]}
                onPress={() => router.push('/clients/inactive')}
              >
                <View style={[s.inactiveBannerIcon, { backgroundColor: isDark ? '#7C2D12' : '#FEF3C7' }]}>
                  <MaterialIcons name="warning" size={20} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.inactiveBannerTitle, { color: isDark ? '#FED7AA' : '#92400E' }]}>Clientes sin visita reciente</Text>
                  <Text style={[s.inactiveBannerDesc, { color: isDark ? '#FB923C' : '#B45309' }]}>Ver campaña de reactivación →</Text>
                </View>
              </TouchableOpacity>
            )}

            {filteredClients.map((client) => {
              const avatarColor = getAvatarColor(client.name, isDark);
              const initials = getInitials(client.name);
              const lastVisit = formatLastVisit(client.lastVisit);
              const isActive = client.isActive !== false;
              return (
                <TouchableOpacity
                  key={client.id}
                  style={[s.clientCard, { backgroundColor: tc.surface, borderColor: tc.border }]}
                  onPress={() => router.push(`/clients/${client.id}`)}
                  activeOpacity={0.75}
                >
                  <View style={[s.avatar, { backgroundColor: avatarColor.bg }]}>
                    <Text style={[s.avatarText, { color: avatarColor.fg }]}>{initials}</Text>
                  </View>
                  <View style={s.clientInfo}>
                    <View style={s.clientNameRow}>
                      <Text style={[s.clientName, { color: tc.text }]} numberOfLines={1}>{client.name}</Text>
                      <View style={[s.activeDot, { backgroundColor: isActive ? '#10B981' : tc.border }]} />
                    </View>
                    <Text style={[s.clientPhone, { color: tc.textMuted }]}>{client.phone}</Text>
                    <View style={s.clientMeta}>
                      {lastVisit && (
                        <View style={s.metaChip}>
                          <MaterialIcons name="access-time" size={11} color={tc.textMuted} />
                          <Text style={[s.metaText, { color: tc.textMuted }]}>{lastVisit}</Text>
                        </View>
                      )}
                      <View style={s.metaChip}>
                        <MaterialIcons name="event" size={11} color={tc.textMuted} />
                        <Text style={[s.metaText, { color: tc.textMuted }]}>
                          {client.totalVisits} {client.totalVisits === 1 ? 'cita' : 'citas'}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={tc.border} />
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
  container:          { flex: 1 },
  loading:            { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:             { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 0.5 },
  headerTop:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  title:              { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle:           { fontSize: 13, marginTop: 2 },
  headerStats:        { flexDirection: 'row', gap: 12, alignItems: 'center' },
  headerStat:         { alignItems: 'center' },
  headerStatNum:      { fontSize: 20, fontWeight: '800', color: '#10B981' },
  headerStatLabel:    { fontSize: 10, fontWeight: '500', marginTop: 1 },
  searchBox:          { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, borderWidth: 0.5, gap: 8 },
  searchInput:        { flex: 1, fontSize: 15 },
  filters:            { flexDirection: 'row', gap: 8 },
  filterBtn:          { paddingVertical: 7, paddingHorizontal: 16, borderRadius: 20, borderWidth: 0.5 },
  filterBtnActive:    { backgroundColor: '#10B981', borderColor: '#10B981' },
  filterText:         { fontSize: 13, fontWeight: '600' },
  filterTextActive:   { color: '#fff' },
  scroll:             { padding: 16, paddingBottom: 100 },
  empty:              { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyIconWrap:      { width: 72, height: 72, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  emptyTitle:         { fontSize: 17, fontWeight: '600' },
  emptyDesc:          { fontSize: 13 },
  emptyBtn:           { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#10B981', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, marginTop: 4 },
  emptyBtnText:       { color: '#fff', fontSize: 14, fontWeight: '700' },
  inactiveBanner:     { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, borderWidth: 0.5 },
  inactiveBannerIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  inactiveBannerTitle:{ fontSize: 13, fontWeight: '600' },
  inactiveBannerDesc: { fontSize: 12, marginTop: 2 },
  clientCard:         { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 12, borderWidth: 1 },
  avatar:             { width: 46, height: 46, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  avatarText:         { fontSize: 16, fontWeight: '800' },
  clientInfo:         { flex: 1, gap: 2 },
  clientNameRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clientName:         { fontSize: 15, fontWeight: '700', flex: 1 },
  activeDot:          { width: 8, height: 8, borderRadius: 4 },
  clientPhone:        { fontSize: 13 },
  clientMeta:         { flexDirection: 'row', gap: 10, marginTop: 4 },
  metaChip:           { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText:           { fontSize: 11, fontWeight: '500' },
  fab:                { position: 'absolute', right: 20, bottom: 100, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8 },
});
