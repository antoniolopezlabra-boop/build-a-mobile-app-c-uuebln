import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import { invalidateCache } from '@/utils/cache';

interface Client { id: string; name: string; phone: string; }
interface Service { id: string; name: string; price: number; durationMinutes: number; }
interface StaffMember { id: string; name: string; color: string; }

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function StaffNewAppointment() {
  const router = useRouter();
  const { staffMemberData } = useAuth();
  const { colors: tc } = useTheme();

  const orgUserId  = staffMemberData?.organizationUserId ?? '';
  const myStaffId  = staffMemberData?.id ?? '';
  const myStaffName = staffMemberData?.name ?? '';

  const [saving, setSaving] = useState(false);

  // Cliente
  const [clients, setClients]       = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  // Nuevo cliente
  const [newClientName, setNewClientName]   = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [showNewClientForm, setShowNewClientForm] = useState(false);

  // Servicio
  const [services, setServices]             = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [showServicePicker, setShowServicePicker] = useState(false);

  // Staff
  const [staffList, setStaffList]           = useState<StaffMember[]>([]);
  const [selectedStaff, setSelectedStaff]   = useState<StaffMember | null>(null);
  const [showStaffPicker, setShowStaffPicker] = useState(false);

  // Fecha y hora
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState('09:00');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [{ data: c }, { data: sv }, { data: st }] = await Promise.all([
        supabase.from('clients').select('id, name, phone').eq('user_id', orgUserId).order('name'),
        supabase.from('services').select('id, name, price, duration_minutes').eq('user_id', orgUserId).eq('is_active', true).order('name'),
        supabase.from('staff_members').select('id, name, color').eq('user_id', orgUserId).eq('is_active', true).order('sort_order'),
      ]);
      setClients(c ?? []);
      setServices((sv ?? []).map((s: any) => ({ id: s.id, name: s.name, price: s.price, durationMinutes: s.duration_minutes })));
      const list = (st ?? []) as StaffMember[];
      setStaffList(list);
      // Seleccionar el colaborador logueado por defecto
      const me = list.find(m => m.id === myStaffId);
      if (me) setSelectedStaff(me);
    } catch (e) {
      console.warn('[StaffNewAppt] loadData error:', e);
    }
  };

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.phone.includes(clientSearch)
  );

  const handleSave = async () => {
    if (!selectedClient && !showNewClientForm) {
      Alert.alert('Campo requerido', 'Selecciona o agrega un cliente.'); return;
    }
    if (showNewClientForm && !newClientName.trim()) {
      Alert.alert('Campo requerido', 'Ingresa el nombre del cliente.'); return;
    }
    if (!selectedService) {
      Alert.alert('Campo requerido', 'Selecciona un servicio.'); return;
    }

    setSaving(true);
    try {
      let clientId = selectedClient?.id ?? null;

      // Crear cliente nuevo si aplica
      if (showNewClientForm && newClientName.trim()) {
        const { data: newC, error: cErr } = await supabase
          .from('clients')
          .insert({ user_id: orgUserId, name: newClientName.trim(), phone: newClientPhone.trim() || null })
          .select('id')
          .single();
        if (cErr) throw cErr;
        clientId = newC.id;
      }

      const [h, m] = time.split(':').map(Number);
      const dur = selectedService.durationMinutes || 30;
      const endMin = h * 60 + m + dur;
      const endTime = `${Math.floor(endMin / 60).toString().padStart(2, '0')}:${(endMin % 60).toString().padStart(2, '0')}`;

      const { error } = await supabase.from('appointments').insert({
        user_id: orgUserId,
        client_id: clientId,
        service_name: selectedService.name,
        date: toDateStr(date),
        start_time: time,
        end_time: endTime,
        status: 'Pendiente',
        notes: notes.trim() || null,
        service_cost: selectedService.price ?? 0,
        staff_id: selectedStaff?.id ?? null,
        whatsapp_notification: false,
      });
      if (error) throw error;

      invalidateCache();
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo guardar la cita');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <MaterialIcons name="arrow-back" size={24} color={tc.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: tc.text }]}>Nueva cita</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={s.saveBtn}>
          {saving
            ? <ActivityIndicator size="small" color="#10B981" />
            : <Text style={s.saveBtnText}>Guardar</Text>
          }
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ── Cliente ── */}
          <Text style={[s.label, { color: tc.textMuted }]}>CLIENTE *</Text>
          {!showNewClientForm ? (
            <>
              <TouchableOpacity
                style={[s.field, { backgroundColor: tc.surface }]}
                onPress={() => setShowClientPicker(true)}
                activeOpacity={0.75}
              >
                <MaterialIcons name="person" size={18} color="#10B981" />
                <Text style={[s.fieldText, { color: selectedClient ? tc.text : tc.textMuted }]}>
                  {selectedClient ? `${selectedClient.name} · ${selectedClient.phone}` : 'Buscar cliente existente'}
                </Text>
                <MaterialIcons name="expand-more" size={18} color={tc.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity style={s.addClientLink} onPress={() => { setShowNewClientForm(true); setSelectedClient(null); }}>
                <MaterialIcons name="person-add-alt" size={14} color="#10B981" />
                <Text style={s.addClientText}>Agregar nuevo cliente</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={[s.newClientBox, { backgroundColor: tc.surface, borderColor: '#10B981' }]}>
              <TextInput
                style={[s.input, { color: tc.text, borderColor: tc.border, backgroundColor: tc.bg }]}
                placeholder="Nombre *"
                placeholderTextColor={tc.textMuted}
                value={newClientName}
                onChangeText={setNewClientName}
              />
              <TextInput
                style={[s.input, { color: tc.text, borderColor: tc.border, backgroundColor: tc.bg, marginTop: 8 }]}
                placeholder="Teléfono"
                placeholderTextColor={tc.textMuted}
                value={newClientPhone}
                onChangeText={setNewClientPhone}
                keyboardType="phone-pad"
              />
              <TouchableOpacity style={s.addClientLink} onPress={() => { setShowNewClientForm(false); setNewClientName(''); setNewClientPhone(''); }}>
                <Text style={[s.addClientText, { color: tc.textMuted }]}>Cancelar — buscar existente</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Servicio ── */}
          <Text style={[s.label, { color: tc.textMuted }]}>SERVICIO *</Text>
          <TouchableOpacity
            style={[s.field, { backgroundColor: tc.surface }]}
            onPress={() => setShowServicePicker(true)}
            activeOpacity={0.75}
          >
            <MaterialIcons name="design-services" size={18} color="#10B981" />
            <Text style={[s.fieldText, { color: selectedService ? tc.text : tc.textMuted }]}>
              {selectedService ? `${selectedService.name} · ${selectedService.durationMinutes} min` : 'Seleccionar servicio'}
            </Text>
            <MaterialIcons name="expand-more" size={18} color={tc.textMuted} />
          </TouchableOpacity>

          {/* ── Fecha ── */}
          <Text style={[s.label, { color: tc.textMuted }]}>FECHA</Text>
          <TouchableOpacity
            style={[s.field, { backgroundColor: tc.surface }]}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.75}
          >
            <MaterialIcons name="calendar-today" size={18} color="#10B981" />
            <Text style={[s.fieldText, { color: tc.text }]}>
              {date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={date}
              mode="date"
              minimumDate={new Date()}
              onChange={(_, d) => { setShowDatePicker(false); if (d) setDate(d); }}
            />
          )}

          {/* ── Hora ── */}
          <Text style={[s.label, { color: tc.textMuted }]}>HORA</Text>
          <TouchableOpacity
            style={[s.field, { backgroundColor: tc.surface }]}
            onPress={() => setShowTimePicker(true)}
            activeOpacity={0.75}
          >
            <MaterialIcons name="schedule" size={18} color="#10B981" />
            <Text style={[s.fieldText, { color: tc.text }]}>{time}</Text>
          </TouchableOpacity>

          {showTimePicker && (
            <DateTimePicker
              value={(() => { const d = new Date(); const [h, m] = time.split(':').map(Number); d.setHours(h, m); return d; })()}
              mode="time"
              is24Hour
              onChange={(_, d) => {
                setShowTimePicker(false);
                if (d) {
                  const hh = d.getHours().toString().padStart(2, '0');
                  const mm = d.getMinutes().toString().padStart(2, '0');
                  setTime(`${hh}:${mm}`);
                }
              }}
            />
          )}

          {/* ── Colaborador ── */}
          <Text style={[s.label, { color: tc.textMuted }]}>COLABORADOR</Text>
          <TouchableOpacity
            style={[s.field, { backgroundColor: tc.surface }]}
            onPress={() => setShowStaffPicker(true)}
            activeOpacity={0.75}
          >
            <View style={[s.staffDot, { backgroundColor: selectedStaff?.color ?? '#94A3B8' }]} />
            <Text style={[s.fieldText, { color: tc.text }]}>
              {selectedStaff?.name ?? 'Sin asignar'}
            </Text>
            <MaterialIcons name="expand-more" size={18} color={tc.textMuted} />
          </TouchableOpacity>

          {/* ── Notas ── */}
          <Text style={[s.label, { color: tc.textMuted }]}>NOTAS</Text>
          <TextInput
            style={[s.textArea, { backgroundColor: tc.surface, color: tc.text, borderColor: tc.border }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Notas opcionales..."
            placeholderTextColor={tc.textMuted}
            multiline
            maxLength={500}
          />

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Modal clientes ── */}
      <Modal visible={showClientPicker} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: tc.surface }]}>
            <Text style={[s.modalTitle, { color: tc.text }]}>Seleccionar cliente</Text>
            <TextInput
              style={[s.searchInput, { backgroundColor: tc.bg, color: tc.text, borderColor: tc.border }]}
              placeholder="Buscar por nombre o teléfono..."
              placeholderTextColor={tc.textMuted}
              value={clientSearch}
              onChangeText={setClientSearch}
              autoFocus
            />
            <ScrollView style={{ maxHeight: 320 }}>
              {filteredClients.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[s.pickerRow, { borderBottomColor: tc.border }]}
                  onPress={() => { setSelectedClient(c); setShowClientPicker(false); setClientSearch(''); }}
                >
                  <Text style={[s.pickerMain, { color: tc.text }]}>{c.name}</Text>
                  <Text style={[s.pickerSub, { color: tc.textMuted }]}>{c.phone}</Text>
                </TouchableOpacity>
              ))}
              {filteredClients.length === 0 && (
                <Text style={[s.pickerEmpty, { color: tc.textMuted }]}>Sin resultados</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={[s.modalCancelBtn, { borderColor: tc.border }]} onPress={() => setShowClientPicker(false)}>
              <Text style={{ color: tc.textMuted, fontWeight: '600' }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Modal servicios ── */}
      <Modal visible={showServicePicker} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: tc.surface }]}>
            <Text style={[s.modalTitle, { color: tc.text }]}>Seleccionar servicio</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {services.map(sv => (
                <TouchableOpacity
                  key={sv.id}
                  style={[s.pickerRow, { borderBottomColor: tc.border }, selectedService?.id === sv.id && { backgroundColor: '#ECFDF5' }]}
                  onPress={() => { setSelectedService(sv); setShowServicePicker(false); }}
                >
                  <Text style={[s.pickerMain, { color: tc.text }]}>{sv.name}</Text>
                  <Text style={[s.pickerSub, { color: tc.textMuted }]}>{sv.durationMinutes} min · ${sv.price?.toLocaleString('es-MX') ?? 0}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={[s.modalCancelBtn, { borderColor: tc.border }]} onPress={() => setShowServicePicker(false)}>
              <Text style={{ color: tc.textMuted, fontWeight: '600' }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Modal staff ── */}
      <Modal visible={showStaffPicker} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: tc.surface }]}>
            <Text style={[s.modalTitle, { color: tc.text }]}>Asignar colaborador</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              <TouchableOpacity
                style={[s.pickerRow, { borderBottomColor: tc.border }, !selectedStaff && { backgroundColor: '#ECFDF5' }]}
                onPress={() => { setSelectedStaff(null); setShowStaffPicker(false); }}
              >
                <Text style={[s.pickerMain, { color: tc.text }]}>Sin asignar</Text>
              </TouchableOpacity>
              {staffList.map(m => (
                <TouchableOpacity
                  key={m.id}
                  style={[s.pickerRow, { borderBottomColor: tc.border }, selectedStaff?.id === m.id && { backgroundColor: '#ECFDF5' }]}
                  onPress={() => { setSelectedStaff(m); setShowStaffPicker(false); }}
                >
                  <View style={s.staffPickerRow}>
                    <View style={[s.staffDot, { backgroundColor: m.color }]} />
                    <View>
                      <Text style={[s.pickerMain, { color: tc.text }]}>{m.name}</Text>
                      {m.id === myStaffId && <Text style={[s.pickerSub, { color: '#10B981' }]}>Tú</Text>}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={[s.modalCancelBtn, { borderColor: tc.border }]} onPress={() => setShowStaffPicker(false)}>
              <Text style={{ color: tc.textMuted, fontWeight: '600' }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1 },
  header:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  back:            { padding: 4, width: 40 },
  headerTitle:     { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  saveBtn:         { minWidth: 60, alignItems: 'flex-end' },
  saveBtnText:     { fontSize: 15, fontWeight: '700', color: '#10B981' },
  scroll:          { padding: 16 },
  label:           { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8, marginTop: 20 },
  field:           { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  fieldText:       { flex: 1, fontSize: 15 },
  addClientLink:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  addClientText:   { fontSize: 13, color: '#10B981', fontWeight: '600' },
  newClientBox:    { borderRadius: 14, borderWidth: 1, padding: 14 },
  input:           { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  textArea:        { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, minHeight: 80, textAlignVertical: 'top' },
  staffDot:        { width: 10, height: 10, borderRadius: 5 },
  staffPickerRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalTitle:      { fontSize: 17, fontWeight: '700', marginBottom: 14 },
  searchInput:     { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, marginBottom: 12 },
  pickerRow:       { paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 0.5 },
  pickerMain:      { fontSize: 15, fontWeight: '600' },
  pickerSub:       { fontSize: 12, marginTop: 2 },
  pickerEmpty:     { textAlign: 'center', paddingVertical: 20, fontSize: 14 },
  modalCancelBtn:  { borderRadius: 12, borderWidth: 1, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
});
