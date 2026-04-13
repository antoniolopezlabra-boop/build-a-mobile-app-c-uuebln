import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Contacts from 'expo-contacts';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '@/contexts/ThemeContext';
import { apiPost, apiGet } from '@/utils/api';
import { invalidateCache } from '@/utils/cache';

interface PhoneContact {
  id: string;
  name: string;
  phone: string;      // teléfono limpio para API
  rawPhone: string;   // teléfono original para mostrar
  selected: boolean;
  alreadySaved: boolean;
}

// Quita todo excepto dígitos y + al inicio
const cleanPhone = (raw: string): string => raw.replace(/[^0-9+]/g, '').trim();

// Normaliza a los últimos 10 dígitos para comparar sin importar prefijo de país
const normalizePhone = (raw: string): string => {
  const digits = cleanPhone(raw).replace(/^\+/, '');
  // Quitar prefijo de país México (52) si tiene 12 dígitos empezando en 52
  if (digits.length === 12 && digits.startsWith('52')) return digits.slice(2);
  // Quitar prefijo de país genérico si tiene más de 10 dígitos
  if (digits.length > 10) return digits.slice(-10);
  return digits;
};

export default function ImportContactsScreen() {
  const router  = useRouter();
  const { colors: tc, isDark } = useTheme();
  const insets  = useSafeAreaInsets();

  const [loading,    setLoading]    = useState(true);
  const [importing,  setImporting]  = useState(false);
  const [contacts,   setContacts]   = useState<PhoneContact[]>([]);
  const [search,     setSearch]     = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });

  useEffect(() => { loadContacts(); }, []);

  const loadContacts = async () => {
    setLoading(true);
    setPermissionDenied(false);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        setLoading(false);
        return;
      }

      // Cargar contactos del teléfono Y clientes existentes en paralelo
      const [{ data: phoneContacts }, existingClients] = await Promise.all([
        Contacts.getContactsAsync({
          fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
          sort:   Contacts.SortTypes.FirstName,
        }),
        apiGet<{ phone: string }[]>('/api/clients').catch(() => []),
      ]);

      // Set de teléfonos normalizados (últimos 10 dígitos) para comparar
      const savedPhones = new Set(
        existingClients.map((c: any) => normalizePhone(c.phone || ''))
      );

      const parsed: PhoneContact[] = [];
      const seen = new Set<string>();

      for (const c of phoneContacts) {
        const name   = (c.name || '').trim();
        const phones = c.phoneNumbers || [];
        if (!name || phones.length === 0) continue;

        const rawPhone = phones[0].number || '';
        const phone    = cleanPhone(rawPhone);
        if (!phone || phone.length < 7) continue;

        const normalized = normalizePhone(rawPhone);
        if (seen.has(normalized)) continue;
        seen.add(normalized);

        parsed.push({
          id:           c.id ?? `${name}-${normalized}`,
          name,
          phone,        // el limpio para enviar al API
          rawPhone,     // el original para mostrar
          selected:     false,
          alreadySaved: savedPhones.has(normalized),
        });
      }

      // Primero los nuevos, luego los ya guardados
      parsed.sort((a, b) => {
        if (a.alreadySaved === b.alreadySaved) return 0;
        return a.alreadySaved ? 1 : -1;
      });

      setContacts(parsed);
    } catch (e) {
      Alert.alert('Error', 'No se pudieron cargar los contactos.');
    } finally {
      setLoading(false);
    }
  };

  const toggleContact = (id: string) =>
    setContacts(prev => prev.map(c =>
      c.id === id && !c.alreadySaved ? { ...c, selected: !c.selected } : c
    ));

  const toggleAll = () => {
    const eligible    = filteredContacts.filter(c => !c.alreadySaved);
    const allSelected = eligible.every(c => c.selected);
    const ids         = new Set(eligible.map(c => c.id));
    setContacts(prev => prev.map(c =>
      ids.has(c.id) ? { ...c, selected: !allSelected } : c
    ));
  };

  const filteredContacts = contacts.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.rawPhone.includes(q);
  });

  const selectedContacts    = contacts.filter(c => c.selected);
  const selectedCount       = selectedContacts.length;
  const eligibleFiltered    = filteredContacts.filter(c => !c.alreadySaved);
  const allFilteredSelected = eligibleFiltered.length > 0 && eligibleFiltered.every(c => c.selected);
  const alreadySavedCount   = contacts.filter(c => c.alreadySaved).length;
  const newCount            = contacts.filter(c => !c.alreadySaved).length;

  const handleImport = async () => {
    if (selectedCount === 0) return;
    Keyboard.dismiss();
    setImporting(true);
    setImportProgress({ done: 0, total: selectedCount });

    let imported   = 0;
    let failed     = 0;
    let duplicates = 0;
    const errors: string[] = [];

    for (const contact of selectedContacts) {
      try {
        await apiPost('/api/clients', { name: contact.name, phone: contact.phone });
        imported++;
      } catch (e: any) {
        const msg = (e?.message || '').toLowerCase();
        if (
          msg.includes('duplicate') || msg.includes('unique') ||
          msg.includes('already')   || msg.includes('exist')  ||
          e?.status === 409         || e?.status === 422
        ) {
          duplicates++;
        } else {
          failed++;
          errors.push(`${contact.name}: ${e?.message || 'error desconocido'}`);
        }
      }
      setImportProgress(prev => ({ ...prev, done: prev.done + 1 }));
    }

    // Marcar los importados como ya guardados en el estado local
    // para que si el usuario no sale, los vea en gris
    if (imported > 0) {
      const importedPhones = new Set(
        selectedContacts
          .filter((_, i) => i < imported) // aproximación simple
          .map(c => normalizePhone(c.phone))
      );
      setContacts(prev => prev.map(c =>
        importedPhones.has(normalizePhone(c.phone))
          ? { ...c, selected: false, alreadySaved: true }
          : c
      ));
    }

    invalidateCache('clients_list');
    setImporting(false);

    const parts: string[] = [];
    if (imported > 0)   parts.push(`${imported} cliente${imported !== 1 ? 's' : ''} agregado${imported !== 1 ? 's' : ''} ✓`);
    if (duplicates > 0) parts.push(`${duplicates} ya existía${duplicates !== 1 ? 'n' : ''}`);
    if (failed > 0)     parts.push(`${failed} con error`);

    let msg = parts.join(', ') + '.';
    if (errors.length > 0) msg += `\n\nDetalle: ${errors.slice(0, 3).join(', ')}`;

    Alert.alert(
      imported > 0 ? '¡Importación lista!' : 'Importación completada',
      msg,
      [{
        text: imported > 0 ? 'Ver mis clientes' : 'Cerrar',
        onPress: () => {
          if (imported > 0) router.back();
        },
      }]
    );
  };

  const renderContact = ({ item }: { item: PhoneContact }) => {
    const initials = item.name.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const isSaved  = item.alreadySaved;

    return (
      <TouchableOpacity
        style={[
          s.row,
          { backgroundColor: tc.surface, borderBottomColor: tc.border },
          item.selected && { backgroundColor: isDark ? '#052E16' : '#F0FDF4' },
          isSaved && { opacity: 0.45 },
        ]}
        onPress={() => !isSaved && toggleContact(item.id)}
        activeOpacity={isSaved ? 1 : 0.7}
      >
        <View style={[s.avatar, { backgroundColor: isDark ? '#1E293B' : '#ECFDF5' }]}>
          <Text style={[s.avatarText, { color: isSaved ? tc.textMuted : '#10B981' }]}>{initials}</Text>
        </View>
        <View style={s.rowInfo}>
          <Text style={[s.rowName, { color: tc.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[s.rowPhone, { color: tc.textMuted }]}>{item.rawPhone}</Text>
        </View>
        {isSaved ? (
          <View style={s.savedBadge}>
            <MaterialIcons name="check-circle" size={16} color={tc.textMuted} />
            <Text style={[s.savedText, { color: tc.textMuted }]}>En tu lista</Text>
          </View>
        ) : (
          <View style={[
            s.checkbox,
            { borderColor: item.selected ? '#10B981' : tc.border },
            item.selected && { backgroundColor: '#10B981' },
          ]}>
            {item.selected && <MaterialIcons name="check" size={14} color="#fff" />}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Sin permiso
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
        <View style={s.centeredWrap}>
          <View style={[s.bigIcon, { backgroundColor: isDark ? '#1E293B' : '#FEF3C7' }]}>
            <MaterialIcons name="contacts" size={44} color="#F59E0B" />
          </View>
          <Text style={[s.centeredTitle, { color: tc.text }]}>Acceso a contactos requerido</Text>
          <Text style={[s.centeredDesc, { color: tc.textMuted }]}>
            VYLTA necesita acceso a tus contactos. Ve a Configuración y activa el permiso.
          </Text>
          <TouchableOpacity style={s.primaryBtn} onPress={loadContacts}>
            <Text style={s.primaryBtnText}>Volver a intentar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Cargando
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
        <View style={s.centeredWrap}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={[s.centeredDesc, { color: tc.textMuted }]}>Cargando tu agenda...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Importando
  if (importing) {
    const pct = importProgress.total > 0
      ? Math.round((importProgress.done / importProgress.total) * 100)
      : 0;
    return (
      <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <View style={s.centeredWrap}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={[s.centeredTitle, { color: tc.text }]}>Importando contactos...</Text>
          <Text style={[s.centeredDesc, { color: tc.textMuted }]}>
            {importProgress.done} de {importProgress.total} — {pct}%
          </Text>
          <View style={[s.progressBar, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
            <View style={[s.progressFill, { width: `${pct}%` as any }]} />
          </View>
          <Text style={[s.centeredDesc, { color: tc.textMuted, fontSize: 12 }]}>
            Por favor espera...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Principal
  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>

      <View style={[s.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={tc.text} />
        </TouchableOpacity>
        <View style={s.headerMid}>
          <Text style={[s.headerTitle, { color: tc.text }]}>Importar contactos</Text>
          <Text style={[s.headerSub, { color: tc.textMuted }]}>
            {newCount} nuevos · {alreadySavedCount} ya en tu lista
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

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

      <View style={[s.selectionBar, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        <TouchableOpacity
          style={s.selectAllBtn}
          onPress={toggleAll}
          disabled={eligibleFiltered.length === 0}
        >
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
            <Text style={s.selectedBadgeText}>
              {selectedCount} seleccionado{selectedCount !== 1 ? 's' : ''}
            </Text>
          </View>
        )}
      </View>

      {newCount === 0 && !search ? (
        <View style={s.centeredWrap}>
          <MaterialIcons name="check-circle" size={48} color="#10B981" />
          <Text style={[s.centeredTitle, { color: tc.text }]}>¡Todo al día!</Text>
          <Text style={[s.centeredDesc, { color: tc.textMuted }]}>
            Todos tus contactos de WhatsApp ya están en tu lista de clientes.
          </Text>
        </View>
      ) : filteredContacts.length === 0 ? (
        <View style={s.centeredWrap}>
          <MaterialIcons name="person-search" size={44} color={tc.border} />
          <Text style={[s.centeredDesc, { color: tc.textMuted }]}>
            Sin resultados para "{search}"
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredContacts}
          keyExtractor={item => item.id}
          renderItem={renderContact}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
          initialNumToRender={30}
          maxToRenderPerBatch={30}
          getItemLayout={(_, index) => ({ length: 72, offset: 72 * index, index })}
        />
      )}

      {selectedCount > 0 && (
        <View style={[s.fabWrap, { bottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={s.importBtn}
            onPress={handleImport}
            activeOpacity={0.85}
          >
            <MaterialIcons name="person-add-alt" size={20} color="#fff" />
            <Text style={s.importBtnText}>
              Agregar {selectedCount} cliente{selectedCount !== 1 ? 's' : ''} a mi lista
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:         { flex: 1 },
  header:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  backBtn:           { width: 40, padding: 4 },
  headerMid:         { flex: 1, alignItems: 'center' },
  headerTitle:       { fontSize: 17, fontWeight: '700' },
  headerSub:         { fontSize: 11, marginTop: 1 },
  searchWrap:        { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5 },
  searchBox:         { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 0.5, gap: 8 },
  searchInput:       { flex: 1, fontSize: 15 },
  selectionBar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5 },
  selectAllBtn:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectAllText:     { fontSize: 13, fontWeight: '600' },
  selectedBadge:     { backgroundColor: '#10B981', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  selectedBadgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  row:               { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, gap: 12, minHeight: 72 },
  avatar:            { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  avatarText:        { fontSize: 16, fontWeight: '800' },
  rowInfo:           { flex: 1, gap: 2 },
  rowName:           { fontSize: 15, fontWeight: '600' },
  rowPhone:          { fontSize: 12 },
  checkbox:          { width: 24, height: 24, borderRadius: 7, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  checkboxSmall:     { width: 20, height: 20, borderRadius: 6, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  savedBadge:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  savedText:         { fontSize: 11, fontWeight: '600' },
  centeredWrap:      { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 36, gap: 14 },
  centeredTitle:     { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  centeredDesc:      { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  bigIcon:           { width: 88, height: 88, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  primaryBtn:        { backgroundColor: '#10B981', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 28, marginTop: 8 },
  primaryBtnText:    { color: '#fff', fontSize: 15, fontWeight: '700' },
  progressBar:       { width: '100%', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 8 },
  progressFill:      { height: '100%', backgroundColor: '#10B981', borderRadius: 4 },
  fabWrap:           { position: 'absolute', left: 20, right: 20 },
  importBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#10B981', borderRadius: 16, paddingVertical: 16, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 6 },
  importBtnText:     { color: '#fff', fontSize: 16, fontWeight: '800' },
});
