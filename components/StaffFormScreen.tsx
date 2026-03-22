import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Switch, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import TimePickerModal from '@/components/TimePickerModal';

const DAYS = [
  { label: 'Lunes',     value: 1 },
  { label: 'Martes',    value: 2 },
  { label: 'Miércoles', value: 3 },
  { label: 'Jueves',    value: 4 },
  { label: 'Viernes',   value: 5 },
  { label: 'Sábado',    value: 6 },
  { label: 'Domingo',   value: 0 },
];

const PALETTE = [
  '#10B981','#3B82F6','#F59E0B','#EF4444','#8B5CF6',
  '#EC4899','#06B6D4','#F97316','#84CC16','#6366F1',
];

const ROLES = ['Peluquero','Estilista','Barbero','Esteticista','Masajista','Médico','Asistente','Otro'];

interface DayHour {
  day_of_week: number;
  is_open: boolean;
  start_time: string;
  end_time: string;
}

interface Props {
  mode: 'create' | 'edit';
  staffId?: string;
  onSaved: () => void;
  onCancel: () => void;
}

export default function StaffFormScreen({ mode, staffId, onSaved, onCancel }: Props) {
  const { user } = useAuth();
  const { colors: tc } = useTheme();

  const [loading, setLoading]   = useState(mode === 'edit');
  const [saving, setSaving]     = useState(false);
  const [name, setName]         = useState('');
  const [role, setRole]         = useState('');
  const [color, setColor]       = useState(PALETTE[0]);
  const [isActive, setIsActive] = useState(true);
  const [hours, setHours]       = useState<DayHour[]>(
    DAYS.map(d => ({ day_of_week: d.value, is_open: d.value >= 1 && d.value <= 5, start_time: '09:00', end_time: '18:00' }))
  );
  const [timePicker, setTimePicker] = useState<{ day: number; field: 'start_time'|'end_time' } | null>(null);
  const [showRoles, setShowRoles] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && staffId) loadStaff();
    else loadBusinessHours(); // heredar horario del negocio
  }, []);

  const loadBusinessHours = async () => {
    try {
      const { data } = await supabase
        .from('business_hours')
        .select('day_of_week, is_open, start_time, end_time')
        .eq('user_id', user?.id);
      if (data && data.length > 0) {
        setHours(DAYS.map(d => {
          const bh = data.find(h => h.day_of_week === d.value);
          return bh
            ? { day_of_week: d.value, is_open: bh.is_open, start_time: bh.start_time, end_time: bh.end_time }
            : { day_of_week: d.value, is_open: d.value >= 1 && d.value <= 5, start_time: '09:00', end_time: '18:00' };
        }));
      }
    } catch {}
  };

  const loadStaff = async () => {
    setLoading(true);
    try {
      const [{ data: sm }, { data: sh }] = await Promise.all([
        supabase.from('staff_members').select('*').eq('id', staffId).single(),
        supabase.from('staff_hours').select('*').eq('staff_id', staffId),
      ]);
      if (sm) {
        setName(sm.name); setRole(sm.role || ''); setColor(sm.color); setIsActive(sm.is_active);
      }
      if (sh && sh.length > 0) {
        setHours(DAYS.map(d => {
          const h = sh.find(x => x.day_of_week === d.value);
          return h
            ? { day_of_week: d.value, is_open: h.is_open, start_time: h.start_time, end_time: h.end_time }
            : { day_of_week: d.value, is_open: false, start_time: '09:00', end_time: '18:00' };
        }));
      }
    } catch (e) { console.error('[StaffForm]', e); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Campo requerido', 'El nombre del colaborador es obligatorio.'); return; }
    setSaving(true);
    try {
      let sid = staffId;
      if (mode === 'create') {
        const { data, error } = await supabase.from('staff_members').insert({
          user_id: user?.id, name: name.trim(), role: role.trim() || null, color, is_active: isActive,
        }).select('id').single();
        if (error) throw error;
        sid = data.id;
      } else {
        const { error } = await supabase.from('staff_members')
          .update({ name: name.trim(), role: role.trim() || null, color, is_active: isActive })
          .eq('id', sid);
        if (error) throw error;
        // Borrar horarios existentes para re-insertar
        await supabase.from('staff_hours').delete().eq('staff_id', sid);
      }
      // Insertar horarios
      const hoursToInsert = hours.map(h => ({ staff_id: sid, ...h }));
      const { error: he } = await supabase.from('staff_hours').insert(hoursToInsert);
      if (he) throw he;
      onSaved();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo guardar el colaborador.');
    } finally { setSaving(false); }
  };

  const handleDelete = () => {
    Alert.alert(
      'Eliminar colaborador',
      `¿Eliminar a ${name}? Sus citas quedarán sin asignar.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: async () => {
          await supabase.from('staff_members').delete().eq('id', staffId);
          onSaved();
        }},
      ]
    );
  };

  const toggleDay = (dow: number) =>
    setHours(h => h.map(d => d.day_of_week === dow ? { ...d, is_open: !d.is_open } : d));

  const updateHour = (dow: number, field: 'start_time'|'end_time', val: string) =>
    setHours(h => h.map(d => d.day_of_week === dow ? { ...d, [field]: val } : d));

  const getHour = (dow: number) => hours.find(h => h.day_of_week === dow)!;

  const fmt = (t: string) => {
    const [hh, mm] = t.split(':'); const h = parseInt(hh);
    return `${h % 12 || 12}:${mm} ${h >= 12 ? 'PM' : 'AM'}`;
  };

  const initials = name.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase() || '?';

  if (loading) return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]}>
      <View style={s.centered}><ActivityIndicator size="large" color="#10B981" /></View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>

      {/* Header */}
      <View style={[s.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        <TouchableOpacity onPress={onCancel} style={s.back}>
          <MaterialIcons name="arrow-back" size={24} color={tc.text} />
        </TouchableOpacity>
        <Text style={[s.title, { color: tc.text }]}>
          {mode === 'create' ? 'Nuevo colaborador' : 'Editar colaborador'}
        </Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={s.saveBtn}>
          {saving ? <ActivityIndicator size="small" color="#10B981" /> : <Text style={s.saveBtnText}>Guardar</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Preview avatar */}
        <View style={s.previewRow}>
          <View style={[s.previewAvatar, { backgroundColor: color + '20', borderColor: color }]}>
            <Text style={[s.previewInitials, { color }]}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.previewName, { color: tc.text }]}>{name || 'Nombre del colaborador'}</Text>
            <Text style={[s.previewRole, { color: tc.textMuted }]}>{role || 'Rol no definido'}</Text>
          </View>
        </View>

        {/* Nombre */}
        <Text style={[s.label, { color: tc.textMuted }]}>NOMBRE *</Text>
        <View style={[s.inputWrap, { backgroundColor: tc.surface }]}>
          <TextInput
            style={[s.input, { color: tc.text }]}
            value={name}
            onChangeText={setName}
            placeholder="Ej: Juan Pérez"
            placeholderTextColor={tc.textMuted}
          />
        </View>

        {/* Rol */}
        <Text style={[s.label, { color: tc.textMuted }]}>ROL</Text>
        <TouchableOpacity
          style={[s.inputWrap, { backgroundColor: tc.surface }]}
          onPress={() => setShowRoles(!showRoles)}
        >
          <Text style={[s.input, { color: role ? tc.text : tc.textMuted }]}>
            {role || 'Selecciona un rol'}
          </Text>
          <MaterialIcons name={showRoles ? 'expand-less' : 'expand-more'} size={20} color={tc.textMuted} />
        </TouchableOpacity>
        {showRoles && (
          <View style={[s.rolesDropdown, { backgroundColor: tc.surface }]}>
            {ROLES.map(r => (
              <TouchableOpacity
                key={r}
                style={[s.roleOption, role === r && { backgroundColor: '#ECFDF5' }]}
                onPress={() => { setRole(r); setShowRoles(false); }}
              >
                <Text style={[s.roleText, { color: role === r ? '#10B981' : tc.text }]}>{r}</Text>
                {role === r && <MaterialIcons name="check" size={16} color="#10B981" />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Color identificador */}
        <Text style={[s.label, { color: tc.textMuted }]}>COLOR IDENTIFICADOR</Text>
        <View style={[s.colorCard, { backgroundColor: tc.surface }]}>
          <Text style={[s.colorHint, { color: tc.textMuted }]}>Este color aparece en el calendario para identificar a cada colaborador.</Text>
          <View style={s.colorGrid}>
            {PALETTE.map(c => (
              <TouchableOpacity
                key={c}
                style={[s.colorSwatch, { backgroundColor: c }, color === c && s.colorSwatchActive]}
                onPress={() => setColor(c)}
              >
                {color === c && <MaterialIcons name="check" size={16} color="#fff" />}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Estado activo */}
        {mode === 'edit' && (
          <>
            <Text style={[s.label, { color: tc.textMuted }]}>ESTADO</Text>
            <View style={[s.toggleCard, { backgroundColor: tc.surface }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.toggleTitle, { color: tc.text }]}>Colaborador activo</Text>
                <Text style={[s.toggleSub, { color: tc.textMuted }]}>
                  {isActive ? 'Aparece en el calendario y en el link de citas' : 'Oculto del calendario y del link de citas'}
                </Text>
              </View>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                trackColor={{ false: '#E2E8F0', true: '#10B981' }}
                thumbColor="#fff"
              />
            </View>
          </>
        )}

        {/* Horario propio */}
        <Text style={[s.label, { color: tc.textMuted }]}>HORARIO PROPIO</Text>
        <View style={[s.scheduleNote, { backgroundColor: '#FFFBEB' }]}>
          <MaterialIcons name="info-outline" size={14} color="#F59E0B" />
          <Text style={s.scheduleNoteText}>Cada colaborador puede tener su propio horario independiente del negocio.</Text>
        </View>

        {DAYS.map(d => {
          const dh = getHour(d.value);
          return (
            <View key={d.value} style={[s.dayCard, { backgroundColor: tc.surface }]}>
              <View style={s.dayHeader}>
                <Text style={[s.dayName, { color: tc.text }]}>{d.label}</Text>
                <Switch
                  value={dh.is_open}
                  onValueChange={() => toggleDay(d.value)}
                  trackColor={{ false: '#E2E8F0', true: '#10B981' }}
                  thumbColor="#fff"
                />
              </View>
              {dh.is_open && (
                <View style={s.timeRow}>
                  <TouchableOpacity
                    style={[s.timeBtn, { backgroundColor: tc.bg }]}
                    onPress={() => setTimePicker({ day: d.value, field: 'start_time' })}
                  >
                    <MaterialIcons name="schedule" size={16} color="#10B981" />
                    <Text style={[s.timeText, { color: tc.text }]}>{fmt(dh.start_time)}</Text>
                  </TouchableOpacity>
                  <Text style={[s.timeSep, { color: tc.textMuted }]}>—</Text>
                  <TouchableOpacity
                    style={[s.timeBtn, { backgroundColor: tc.bg }]}
                    onPress={() => setTimePicker({ day: d.value, field: 'end_time' })}
                  >
                    <MaterialIcons name="schedule" size={16} color="#10B981" />
                    <Text style={[s.timeText, { color: tc.text }]}>{fmt(dh.end_time)}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

        {/* Eliminar — solo en edit */}
        {mode === 'edit' && (
          <TouchableOpacity style={s.deleteBtn} onPress={handleDelete}>
            <MaterialIcons name="delete-outline" size={18} color="#EF4444" />
            <Text style={s.deleteBtnText}>Eliminar colaborador</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {timePicker && (
        <TimePickerModal
          visible
          title={timePicker.field === 'start_time' ? 'Hora de entrada' : 'Hora de salida'}
          value={getHour(timePicker.day)[timePicker.field]}
          onConfirm={t => { updateHour(timePicker.day, timePicker.field, t); setTimePicker(null); }}
          onCancel={() => setTimePicker(null)}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1 },
  centered:         { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  back:             { padding: 4 },
  title:            { flex: 1, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  saveBtn:          { minWidth: 60, alignItems: 'flex-end' },
  saveBtnText:      { fontSize: 15, fontWeight: '700', color: '#10B981' },
  scroll:           { padding: 16 },
  label:            { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8, marginTop: 20 },
  previewRow:       { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 8, padding: 16, backgroundColor: '#F8FAFC', borderRadius: 16 },
  previewAvatar:    { width: 60, height: 60, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  previewInitials:  { fontSize: 20, fontWeight: '800' },
  previewName:      { fontSize: 17, fontWeight: '700' },
  previewRole:      { fontSize: 13, marginTop: 2 },
  inputWrap:        { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  input:            { flex: 1, fontSize: 15 },
  rolesDropdown:    { borderRadius: 12, marginTop: 4, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  roleOption:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: '#F1F5F9' },
  roleText:         { fontSize: 14, fontWeight: '500' },
  colorCard:        { borderRadius: 14, padding: 14, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  colorHint:        { fontSize: 12, marginBottom: 12, lineHeight: 18 },
  colorGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorSwatch:      { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  colorSwatchActive:{ transform: [{ scale: 1.15 }], shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  toggleCard:       { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  toggleTitle:      { fontSize: 14, fontWeight: '600' },
  toggleSub:        { fontSize: 12, marginTop: 2 },
  scheduleNote:     { flexDirection: 'row', gap: 8, borderRadius: 10, padding: 10, marginBottom: 8, alignItems: 'center' },
  scheduleNoteText: { flex: 1, fontSize: 12, color: '#92400E' },
  dayCard:          { borderRadius: 14, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  dayHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayName:          { fontSize: 15, fontWeight: '600' },
  timeRow:          { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  timeBtn:          { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  timeText:         { fontSize: 14, fontWeight: '500' },
  timeSep:          { fontSize: 16 },
  deleteBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 14, paddingVertical: 14, marginTop: 24 },
  deleteBtnText:    { color: '#EF4444', fontWeight: '600', fontSize: 14 },
});
