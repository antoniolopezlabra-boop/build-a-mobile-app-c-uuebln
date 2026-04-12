import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Contacts from 'expo-contacts';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '@/contexts/ThemeContext';
import { apiPost } from '@/utils/api';
import { invalidateCache } from '@/utils/cache';

interface PhoneContact {
  id: string;
  name: string;
  phone: string;      // primer teléfono limpio
  rawPhone: string;   // teléfono original del contacto
  selected: boolean;
  alreadyExists?: boolean;
}

// Limpia el número a solo dígitos + +
const cleanPhone = (raw: string): string => raw.replace(/[^0-9+]/g, '').trim();

export default function ImportContactsScreen() {
  const router  = useRouter();
  const { colors: tc, isDark } = useTheme();
  const insets  = useSafeAreaInsets();

  const [loading, setLoading]       = useState(true);
  const [importing, setImporting]   = useState(false);
  const [contacts, setContacts]     = useState<PhoneContact[]>([]);
  const [search, setSearch]         = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => { loadContacts(); }, []);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        setLoading(false);
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        sort:   Contacts.SortTypes.FirstName,
      });

      // Filtrar contactos que tengan nombre y al menos un teléfono
      const parsed: PhoneContact[] = [];
      const seen = new Set<string>();

      for (const c of data) {
        const name = (c.name || '').trim();
        const phones = c.phoneNumbers || [];
        if (!name || phones.length === 0) continue;

        const rawPhone = phones[0].number || '';
        const phone    = cleanPhone(rawPhone);
        if (!phone || phone.length < 7) continue;

        // Deduplicar por teléfono limpio
        if (seen.has(phone)) continue;
        seen.add(phone);

        parsed.push({
          id:       c.id ?? `${name}-${phone}`,
          name,
          phone,
          rawPhone,
          selected: false,
        });
      }

      setContacts(parsed);
    } catch (e) {
      Alert.alert('Error', 'No se pudieron cargar los contactos.');
    } finally {
      setLoading(false);
    }
  };

  const toggleContact = (id: string) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, selected: !c.selected } : c));
  };

  const toggleAll = () => {
    const filtered = filteredContacts;
    const allSelected = filtered.every(c => c.selected);
    const filteredIds = new Set(filtered.map(c => c.id));
    setContacts(prev => prev.map(c =>
      filteredIds.has(c.id) ? { ...c, selected: !allSelected } : c
    ));
  };

  const filteredContacts = contacts.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phone.includes(q);
  });

  const selectedContacts = contacts.filter(c => c.selected);
  const selectedCount    = selectedContacts.length;
  const allFilteredSelected = filteredContacts.length > 0 && filteredContacts.every(c => c.selected);

  const handleImport = async () => {
    if (selectedCount === 0) return;
    Keyboard.dismiss();
    setImporting(true);
    let imported = 0;
    let failed   = 0;

    for (const contact of selectedContacts) {
      try {
        await apiPost('/api/clients', {
          name:  contact.name,
          phone: contact.phone,
        });
        imported++;
      } catch {
        failed++;
      }
    }

    invalidateCache('clients_list');
    setImporting(false);

    const msg = failed === 0
      ? `${imported} cliente${imported !== 1 ? 's' : ''} importado${imported !== 1 ? 's' : ''} correctamente.`
      : `${imported} importado${imported !== 1 ? 's' : ''}, ${failed} no se pudieron importar (ya existen o hubo un error).`;

    Alert.alert(
      imported > 0 ? '\uD83C\uDF89 Importación lista' : 'Importación completada',
      msg,
      [{ text: 'Ver clientes', onPress: () => router.back() }]
    );
  };

  // ── Render contact row ────────────────────────────────────────────────
  const renderContact = ({ item }: { item: PhoneContact }) => {
    const initials = item.name.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const avatarBg = isDark ? '#1E293B' : '#ECFDF5';
    const avatarFg = '#10B981';

    return (
      <TouchableOpacity
        style={[
          s.row,
          { backgroundColor: tc.surface, borderBottomColor: tc.border },
          item.selected && { backgroundColor: isDark ? '#052E16' : '#F0FDF4' },
        ]}
        onPress={() => toggleContact(item.id)}
        activeOpacity={0.7}
      >
        {/* Avatar */}
        <View style={[s.avatar, { backgroundColor: avatarBg }]}>
          <Text style={[s.avatarText, { color: avatarFg }]}>{initials}</Text>
        </View>

        {/* Info */}
        <View style={s.rowInfo}>
          <Text style={[s.rowName, { color: tc.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[s.rowPhone, { color: tc.textMuted }]}>{item.rawPhone}</Text>
        </View>

        {/* Checkbox */}
        <View style={[
          s.checkbox,
          { borderColor: item.selected ? '#10B981' : tc.border },
          item.selected && { backgroundColor: '#10B981' },
        ]}>
          {item.selected && <MaterialIcons name="check" size={14} color="#fff" />}
        </View>
      </TouchableOpacity>
    );
  };

  // ── Sin permiso ───────────────────────────────────────────────────────
  if (permissionDenied) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <View style={[s.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={tc.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: tc.text }]}>Importar contactos</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.permissionWrap}>
          <View style={[s.permissionIcon, { backgroundColor: isDark ? '#1E293B' : '#FEF3C7' }]}>
            <MaterialIcons name="contacts" size={44} color="#F59E0B" />
          </View>
          <Text style={[s.permissionTitle, { color: tc.text }]}>Acceso a contactos requerido</Text>
          <Text style={[s.permissionDesc, { color: tc.textMuted }]}>
            VYLTA necesita acceso a tus contactos para importarlos como clientes. Ve a Configuración y activa el permiso.
          </Text>
          <TouchableOpacity style={s.permissionBtn} onPress={loadContacts}>
            <Text style={s.permissionBtnText}>Volver a intentar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <View style={[s.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={tc.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: tc.text }]}>Importar contactos</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={[s.loadingText, { color: tc.textMuted }]}>Cargando contactos...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>

      {/* Header */}
      <View style={[s.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={tc.text} />
        </TouchableOpacity>
        <View style={s.headerMid}>
          <Text style={[s.headerTitle, { color: tc.text }]}>Importar contactos</Text>
          <Text style={[s.headerSub, { color: tc.textMuted }]}>
            {contacts.length} contactos con teléfono
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Buscador */}
      <View style={[s.searchWrap, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        <View style={[s.searchBox, { backgroundColor: tc.inputBg, borderColor: tc.inputBorder }]}>
          <MaterialIcons name="search" size={18} color={tc.textMuted} />
          <TextInput
            style={[s.searchInput, { color: tc.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nombre o número..."
            placeholderTextColor={tc.textMuted}
            returnKeyType="search"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <MaterialIcons name="close" size={16} color={tc.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Barra de selección */}
      <View style={[s.selectionBar, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        <TouchableOpacity style={s.selectAllBtn} onPress={toggleAll}>
          <View style={[
            s.checkboxSmall,
            { borderColor: allFilteredSelected ? '#10B981' : tc.border },
            allFilteredSelected && { backgroundColor: '#10B981' },
          ]}>
            {allFilteredSelected && <MaterialIcons name="check" size={11} color="#fff" />}
          </View>
          <Text style={[s.selectAllText, { color: tc.textMuted }]}>
            {allFilteredSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
          </Text>
        </TouchableOpacity>
        {selectedCount > 0 && (
          <View style={s.selectedBadge}>
            <Text style={s.selectedBadgeText}>{selectedCount} seleccionado{selectedCount !== 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>

      {/* Lista de contactos */}
      {filteredContacts.length === 0 ? (
        <View style={s.emptyWrap}>
          <MaterialIcons name="person-search" size={44} color={tc.border} />
          <Text style={[s.emptyText, { color: tc.textMuted }]}>
            {search ? `Sin resultados para "${search}"` : 'No hay contactos con teléfono'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredContacts}
          keyExtractor={item => item.id}
          renderItem={renderContact}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          initialNumToRender={30}
          maxToRenderPerBatch={30}
          getItemLayout={(_, index) => ({ length: 72, offset: 72 * index, index })}
        />
      )}

      {/* Botón flotante importar */}
      {selectedCount > 0 && (
        <View style={[s.fabWrap, { bottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[s.importBtn, importing && { opacity: 0.7 }]}
            onPress={handleImport}
            disabled={importing}
            activeOpacity={0.85}
          >
            {importing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <MaterialIcons name="person-add-alt" size={20} color="#fff" />
            )}
            <Text style={s.importBtnText}>
              {importing ? 'Importando...' : `Importar ${selectedCount} contacto${selectedCount !== 1 ? 's' : ''}`}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:          { flex: 1 },
  // Header
  header:             { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  backBtn:            { width: 40, padding: 4 },
  headerMid:          { flex: 1, alignItems: 'center' },
  headerTitle:        { fontSize: 17, fontWeight: '700' },
  headerSub:          { fontSize: 11, marginTop: 1 },
  // Buscador
  searchWrap:         { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5 },
  searchBox:          { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 0.5, gap: 8 },
  searchInput:        { flex: 1, fontSize: 15 },
  // Barra selección
  selectionBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5 },
  selectAllBtn:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectAllText:      { fontSize: 13, fontWeight: '600' },
  selectedBadge:      { backgroundColor: '#10B981', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  selectedBadgeText:  { fontSize: 12, fontWeight: '700', color: '#fff' },
  // Fila de contacto
  row:                { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, gap: 12, minHeight: 72 },
  avatar:             { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  avatarText:         { fontSize: 16, fontWeight: '800' },
  rowInfo:            { flex: 1, gap: 2 },
  rowName:            { fontSize: 15, fontWeight: '600' },
  rowPhone:           { fontSize: 12 },
  checkbox:           { width: 24, height: 24, borderRadius: 7, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  checkboxSmall:      { width: 20, height: 20, borderRadius: 6, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  // Loading / permiso
  loadingWrap:        { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText:        { fontSize: 14 },
  permissionWrap:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36, gap: 16 },
  permissionIcon:     { width: 88, height: 88, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  permissionTitle:    { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  permissionDesc:     { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  permissionBtn:      { backgroundColor: '#10B981', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 28, marginTop: 8 },
  permissionBtnText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  // Empty
  emptyWrap:          { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyText:          { fontSize: 14 },
  // FAB importar
  fabWrap:            { position: 'absolute', left: 20, right: 20 },
  importBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#10B981', borderRadius: 16, paddingVertical: 16, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 6 },
  importBtnText:      { color: '#fff', fontSize: 16, fontWeight: '800' },
});
