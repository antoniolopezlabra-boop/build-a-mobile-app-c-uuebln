import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/utils/api';
import { getCached, setCached, invalidateCache } from '@/utils/cache';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface Service {
  id: string; name: string; description?: string | null;
  price: number; durationMinutes: number; isActive: boolean;
}

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
const durationLabel = (min: number) =>
  min < 60 ? `${min} min` : min === 60 ? '1 hora' : `${Math.floor(min/60)}h ${min%60 > 0 ? `${min%60}min` : ''}`;

export default function ServicesScreen() {
  const router = useRouter();
  const saveLockRef = useRef(false); // FIX #10: guard doble-submit
  const [loading, setLoading]               = useState(true);
  const [services, setServices]             = useState<Service[]>([]);
  const [showModal, setShowModal]           = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [saving, setSaving]                 = useState(false);
  const [deleteConfirm, setDeleteConfirm]   = useState<Service | null>(null);
  const [errorModal, setErrorModal]         = useState({ visible: false, message: '' });
  const [name, setName]                     = useState('');
  const [description, setDescription]       = useState('');
  const [price, setPrice]                   = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);

  useEffect(() => { loadServices(); }, []);

  const loadServices = async (force = false) => {
    const cached = getCached<Service[]>('services_list');
    if (!force && cached) { setServices(cached); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await apiGet<Service[]>('/api/services');
      setServices(data);
      setCached('services_list', data);
    } catch {
      setErrorModal({ visible: true, message: 'Error al cargar los servicios' });
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setEditingService(null);
    setName(''); setDescription(''); setPrice(''); setDurationMinutes(60);
    saveLockRef.current = false;
    setShowModal(true);
  };

  const openEdit = (s: Service) => {
    setEditingService(s);
    setName(s.name); setDescription(s.description || '');
    setPrice(s.price.toString()); setDurationMinutes(s.durationMinutes);
    saveLockRef.current = false;
    setShowModal(true);
  };

  // FIX #10: guard doble-submit con useRef
  const handleSave = async () => {
    if (saveLockRef.current) return;
    if (!name.trim()) { setErrorModal({ visible: true, message: 'El nombre del servicio es requerido' }); return; }
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) < 0) {
      setErrorModal({ visible: true, message: 'Ingresa un precio válido' }); return;
    }
    Keyboard.dismiss();
    saveLockRef.current = true;
    setSaving(true);
    try {
      const body = { name: name.trim(), description: description.trim() || null, price: parseFloat(price), durationMinutes };
      if (editingService) {
        const updated = await apiPatch<Service>(`/api/services/${editingService.id}`, body);
        setServices(prev => prev.map(s => s.id === editingService.id ? updated : s));
      } else {
        const created = await apiPost<Service>('/api/services', body);
        setServices(prev => [...prev, created]);
      }
      invalidateCache('services_list');
      setShowModal(false);
    } catch (e: any) {
      saveLockRef.current = false;
      setErrorModal({ visible: true, message: e?.message || 'Error al guardar el servicio' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (service: Service) => {
    try {
      await apiDelete(`/api/services/${service.id}`);
      setServices(prev => prev.filter(s => s.id !== service.id));
      invalidateCache('services_list');
    } catch (e: any) {
      setErrorModal({ visible: true, message: e?.message || 'Error al eliminar el servicio' });
    }
    setDeleteConfirm(null);
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <MaterialIcons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={s.headerMid}>
          <Text style={s.title}>Mis Servicios</Text>
          <Text style={s.subtitle}>{services.length} {services.length === 1 ? 'servicio' : 'servicios'}</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openNew}>
          <MaterialIcons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : services.length === 0 ? (
        <View style={s.empty}>
          <MaterialIcons name="content-cut" size={56} color="#CBD5E1" />
          <Text style={s.emptyTitle}>Sin servicios aún</Text>
          <Text style={s.emptyDesc}>Agrega los servicios que ofreces con su precio y duración</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={openNew}>
            <Text style={s.emptyBtnText}>+ Agregar primer servicio</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {services.map(service => (
            <TouchableOpacity key={service.id} style={s.card} onPress={() => openEdit(service)} activeOpacity={0.75}>
              <View style={s.cardLeft}>
                <View style={s.cardIcon}><MaterialIcons name="content-cut" size={20} color="#10B981" /></View>
                <View style={s.cardInfo}>
                  <Text style={s.cardName}>{service.name}</Text>
                  {service.description ? <Text style={s.cardDesc}>{service.description}</Text> : null}
                  <View style={s.cardMeta}>
                    <View style={s.metaChip}>
                      <MaterialIcons name="access-time" size={12} color="#94A3B8" />
                      <Text style={s.metaText}>{durationLabel(service.durationMinutes)}</Text>
                    </View>
                  </View>
                </View>
              </View>
              <View style={s.cardRight}>
                <Text style={s.cardPrice}>${service.price.toLocaleString('es-MX')}</Text>
                <Text style={s.cardPriceSub}>MXN</Text>
                <TouchableOpacity style={s.deleteBtn} onPress={() => setDeleteConfirm(service)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialIcons name="delete-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editingService ? 'Editar servicio' : 'Nuevo servicio'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <MaterialIcons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={s.modalScroll} keyboardShouldPersistTaps="handled">
              <Text style={s.fieldLabel}>Nombre del servicio *</Text>
              <TextInput style={s.fieldInput} value={name} onChangeText={setName} placeholder="Ej: Corte de cabello, Manicure..." placeholderTextColor="#CBD5E1" returnKeyType="next" />
              <Text style={s.fieldLabel}>Descripción (opcional)</Text>
              <TextInput style={[s.fieldInput, s.fieldTextarea]} value={description} onChangeText={setDescription} placeholder="Detalles del servicio..." placeholderTextColor="#CBD5E1" multiline numberOfLines={3} textAlignVertical="top" returnKeyType="next" />
              <Text style={s.fieldLabel}>Precio (MXN) *</Text>
              <View style={s.priceRow}>
                <Text style={s.priceCurrency}>$</Text>
                <TextInput style={[s.fieldInput, s.fieldPrice]} value={price} onChangeText={t => setPrice(t.replace(/[^0-9.]/g, ''))} placeholder="0.00" placeholderTextColor="#CBD5E1" keyboardType="decimal-pad" returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              </View>
              <Text style={s.fieldLabel}>Duración</Text>
              <View style={s.durationGrid}>
                {DURATION_OPTIONS.map(min => (
                  <TouchableOpacity key={min} style={[s.durationBtn, durationMinutes === min && s.durationBtnActive]} onPress={() => setDurationMinutes(min)}>
                    <Text style={[s.durationBtnText, durationMinutes === min && s.durationBtnTextActive]}>{durationLabel(min)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {name.trim() && price ? (
                <View style={s.preview}>
                  <Text style={s.previewLabel}>Vista previa</Text>
                  <View style={s.previewCard}>
                    <Text style={s.previewName}>{name.trim()}</Text>
                    <View style={s.previewMeta}>
                      <Text style={s.previewDuration}>{durationLabel(durationMinutes)}</Text>
                      <Text style={s.previewPrice}>${parseFloat(price || '0').toLocaleString('es-MX')} MXN</Text>
                    </View>
                  </View>
                </View>
              ) : null}
              <TouchableOpacity style={[s.saveBtn, saving && s.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>{editingService ? 'Guardar cambios' : 'Agregar servicio'}</Text>}
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ConfirmModal visible={!!deleteConfirm} title="Eliminar servicio"
        message={`¿Eliminar "${deleteConfirm?.name}"? No afecta las citas existentes.`}
        buttons={[
          { text: 'Cancelar', onPress: () => setDeleteConfirm(null), style: 'cancel' },
          { text: 'Eliminar', onPress: () => deleteConfirm && handleDelete(deleteConfirm), style: 'destructive' },
        ]}
        onDismiss={() => setDeleteConfirm(null)} />
      <ConfirmModal visible={errorModal.visible} title="Error" message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'default' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#F8FAFC' },
  loading:            { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0' },
  back:               { padding: 4 },
  headerMid:          { flex: 1, paddingHorizontal: 12 },
  title:              { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  subtitle:           { fontSize: 12, color: '#94A3B8', marginTop: 1 },
  addBtn:             { width: 36, height: 36, borderRadius: 10, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
  scroll:             { padding: 16 },
  empty:              { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  emptyTitle:         { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  emptyDesc:          { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },
  emptyBtn:           { backgroundColor: '#10B981', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 24, marginTop: 8 },
  emptyBtnText:       { color: '#fff', fontSize: 14, fontWeight: '700' },
  card:               { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  cardLeft:           { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon:           { width: 40, height: 40, borderRadius: 12, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center' },
  cardInfo:           { flex: 1 },
  cardName:           { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  cardDesc:           { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  cardMeta:           { flexDirection: 'row', gap: 8, marginTop: 5 },
  metaChip:           { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText:           { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  cardRight:          { alignItems: 'flex-end', gap: 2 },
  cardPrice:          { fontSize: 18, fontWeight: '800', color: '#10B981' },
  cardPriceSub:       { fontSize: 10, color: '#94A3B8', fontWeight: '500' },
  deleteBtn:          { marginTop: 6, padding: 2 },
  modalOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet:         { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHeader:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0' },
  modalTitle:         { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  modalScroll:        { padding: 20 },
  fieldLabel:         { fontSize: 13, fontWeight: '600', color: '#64748B', marginBottom: 6, marginTop: 14 },
  fieldInput:         { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, fontSize: 15, color: '#0F172A', borderWidth: 0.5, borderColor: '#E2E8F0' },
  fieldTextarea:      { minHeight: 80, textAlignVertical: 'top' },
  priceRow:           { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceCurrency:      { fontSize: 20, fontWeight: '700', color: '#10B981' },
  fieldPrice:         { flex: 1 },
  durationGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  durationBtn:        { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#F8FAFC', borderWidth: 0.5, borderColor: '#E2E8F0' },
  durationBtnActive:  { backgroundColor: '#10B981', borderColor: '#10B981' },
  durationBtnText:    { fontSize: 13, fontWeight: '600', color: '#64748B' },
  durationBtnTextActive: { color: '#fff' },
  preview:            { marginTop: 20, backgroundColor: '#F0FDF4', borderRadius: 14, padding: 14, borderWidth: 0.5, borderColor: '#BBF7D0' },
  previewLabel:       { fontSize: 10, fontWeight: '700', color: '#10B981', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
  previewCard:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewName:        { fontSize: 15, fontWeight: '700', color: '#065F46', flex: 1 },
  previewMeta:        { alignItems: 'flex-end' },
  previewDuration:    { fontSize: 11, color: '#10B981', fontWeight: '500' },
  previewPrice:       { fontSize: 16, fontWeight: '800', color: '#10B981', marginTop: 2 },
  saveBtn:            { backgroundColor: '#10B981', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 20 },
  saveBtnDisabled:    { opacity: 0.6 },
  saveBtnText:        { color: '#fff', fontSize: 16, fontWeight: '700' },
});
