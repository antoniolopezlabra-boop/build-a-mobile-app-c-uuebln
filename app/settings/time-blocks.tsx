import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '@/contexts/AuthContext';
import { usePlan } from '@/contexts/PlanContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTimeBlocks, type TimeBlock, type TimeBlockInput } from '@/contexts/useTimeBlocks';
import { supabase } from '@/lib/supabase';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

// ════════════════════════════════════════════════════════════════════
// Pantalla: Bloqueos de tiempo (horario de comida, descansos, etc.)
// - Plan Básico/Premium: bloqueos del negocio completo (staff_id = NULL)
// - Plan Luxury: bloqueos por colaborador o del negocio entero
// ════════════════════════════════════════════════════════════════════

const DAYS_LABEL = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAYS_FULL  = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

interface StaffMember {
  id: string;
  name: string;
  color: string;
}

export default function TimeBlocksScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { isPremium, canUseCollaborators } = usePlan();
  const { colors: tc } = useTheme();
  const { blocks, loading, create, update, remove } = useTimeBlocks();

  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);

  useEffect(() => {
    if (user?.id && canUseCollaborators) loadStaff();
  }, [user?.id, canUseCollaborators]);

  const loadStaff = async () => {
    const { data } = await supabase
      .from('staff_members')
      .select('id, name, color')
      .eq('user_id', user?.id)
      .eq('is_active', true)
      .order('sort_order');
    setStaffMembers(data || []);
  };

  // Mapa de id staff → datos
  const staffMap = useMemo(() => {
    const m: Record<string, StaffMember> = {};
    staffMembers.forEach(s => { m[s.id] = s; });
    return m;
  }, [staffMembers]);

  // Agrupar bloqueos por categoría:
  //   1. Generales del negocio (staff_id NULL)
  //   2. Por colaborador (staff_id no nulo)
  const groupedBlocks = useMemo(() => {
    const general = blocks.filter(b => !b.staff_id);
    const byStaff: Record<string, TimeBlock[]> = {};
    blocks.filter(b => b.staff_id).forEach(b => {
      if (!byStaff[b.staff_id!]) byStaff[b.staff_id!] = [];
      byStaff[b.staff_id!].push(b);
    });
    return { general, byStaff };
  }, [blocks]);

  const openCreate = () => {
    setEditingBlock(null);
    setEditorVisible(true);
  };

  const openEdit = (block: TimeBlock) => {
    setEditingBlock(block);
    setEditorVisible(true);
  };

  const handleDelete = (block: TimeBlock) => {
    Alert.alert(
      'Eliminar bloqueo',
      `¿Eliminar el bloqueo "${block.label}" (${block.start_time.slice(0,5)}-${block.end_time.slice(0,5)})?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await remove(block.id);
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'No se pudo eliminar');
            }
          },
        },
      ]
    );
  };

  const renderBlockCard = (block: TimeBlock) => {
    const dayLabel = block.is_recurring && block.day_of_week !== null
      ? DAYS_FULL[block.day_of_week]
      : block.specific_date
        ? new Date(block.specific_date + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
        : '';

    return (
      <View key={block.id} style={[s.blockCard, { backgroundColor: tc.surface, borderColor: tc.border }]}>
        <View style={s.blockIconWrap}>
          <MaterialIcons name={block.label.toLowerCase().includes('comida') ? 'restaurant' : 'block'} size={20} color="#F59E0B" />
        </View>
        <View style={s.blockInfo}>
          <Text style={[s.blockLabel, { color: tc.text }]}>{block.label}</Text>
          <Text style={[s.blockMeta, { color: tc.textMuted }]}>
            {dayLabel} · {block.start_time.slice(0,5)} - {block.end_time.slice(0,5)}
            {!block.is_recurring && ' (único)'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => openEdit(block)} style={s.blockAction}>
          <MaterialIcons name="edit" size={18} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(block)} style={s.blockAction}>
          <MaterialIcons name="delete-outline" size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]}>
        <View style={s.loadingWrap}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const useCollaborators = isPremium && canUseCollaborators && staffMembers.length > 0;

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>
      <View style={[s.header, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <IconSymbol android_material_icon_name="arrow-back" size={24} color={tc.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: tc.text }]}>Bloqueos de tiempo</Text>
        <TouchableOpacity onPress={openCreate} style={s.addBtn}>
          <MaterialIcons name="add" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={[s.infoCard, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
          <MaterialIcons name="info" size={18} color="#92400E" />
          <Text style={s.infoText}>
            Crea bloqueos para horarios de comida, descansos o juntas. Las citas no podrán agendarse en estos horarios.
          </Text>
        </View>

        {/* Bloqueos generales del negocio */}
        <View style={s.sectionHeader}>
          <Text style={[s.sectionTitle, { color: tc.textMuted }]}>DEL NEGOCIO</Text>
          <Text style={[s.sectionHint, { color: tc.textMuted }]}>
            {useCollaborators ? 'Aplica a todos los colaboradores' : 'Aplica a todas las citas'}
          </Text>
        </View>
        {groupedBlocks.general.length === 0 ? (
          <View style={[s.emptyCard, { backgroundColor: tc.surface, borderColor: tc.border }]}>
            <Text style={[s.emptyText, { color: tc.textMuted }]}>Sin bloqueos del negocio</Text>
          </View>
        ) : (
          groupedBlocks.general.map(renderBlockCard)
        )}

        {/* Bloqueos por colaborador (solo Luxury) */}
        {useCollaborators && (
          <>
            {staffMembers.map(staff => (
              <View key={staff.id}>
                <View style={s.sectionHeader}>
                  <View style={[s.staffDot, { backgroundColor: staff.color }]} />
                  <Text style={[s.sectionTitle, { color: tc.textMuted }]}>{staff.name.toUpperCase()}</Text>
                </View>
                {(groupedBlocks.byStaff[staff.id] || []).length === 0 ? (
                  <View style={[s.emptyCard, { backgroundColor: tc.surface, borderColor: tc.border }]}>
                    <Text style={[s.emptyText, { color: tc.textMuted }]}>Sin bloqueos individuales</Text>
                  </View>
                ) : (
                  (groupedBlocks.byStaff[staff.id] || []).map(renderBlockCard)
                )}
              </View>
            ))}
          </>
        )}

        {/* Botón crear */}
        <TouchableOpacity style={s.createBtn} onPress={openCreate} activeOpacity={0.85}>
          <MaterialIcons name="add" size={22} color="#fff" />
          <Text style={s.createBtnText}>Crear bloqueo</Text>
        </TouchableOpacity>
      </ScrollView>

      <BlockEditorModal
        visible={editorVisible}
        block={editingBlock}
        staffMembers={useCollaborators ? staffMembers : []}
        onClose={() => setEditorVisible(false)}
        onSave={async (input) => {
          try {
            if (editingBlock) {
              await update(editingBlock.id, input);
            } else {
              await create(input);
            }
            setEditorVisible(false);
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'No se pudo guardar el bloqueo');
          }
        }}
      />
    </SafeAreaView>
  );
}

// ════════════════════════════════════════════════════════════════════
// Modal editor de bloqueo
// ════════════════════════════════════════════════════════════════════

function BlockEditorModal({ visible, block, staffMembers, onClose, onSave }: {
  visible: boolean;
  block: TimeBlock | null;
  staffMembers: StaffMember[];
  onClose: () => void;
  onSave: (input: TimeBlockInput) => Promise<void>;
}) {
  const { colors: tc } = useTheme();
  const [label, setLabel] = useState('');
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('15:00');
  const [days, setDays] = useState<number[]>([]);  // múltiples días recurrentes a la vez
  const [staffId, setStaffId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Inicializar form al abrir
  useEffect(() => {
    if (visible) {
      if (block) {
        setLabel(block.label);
        setStartTime(block.start_time.slice(0,5));
        setEndTime(block.end_time.slice(0,5));
        setDays(block.is_recurring && block.day_of_week !== null ? [block.day_of_week] : []);
        setStaffId(block.staff_id);
      } else {
        setLabel('Comida');
        setStartTime('14:00');
        setEndTime('15:00');
        setDays([0, 1, 2, 3, 4]); // Lun-Vie por defecto
        setStaffId(null);
      }
    }
  }, [visible, block?.id]);

  const toggleDay = (idx: number) => {
    setDays(prev => prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx].sort());
  };

  const validateTimes = (): string | null => {
    const re = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!re.test(startTime)) return 'Hora de inicio inválida (HH:MM)';
    if (!re.test(endTime)) return 'Hora de fin inválida (HH:MM)';
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if (sh*60+sm >= eh*60+em) return 'La hora de fin debe ser mayor que la de inicio';
    return null;
  };

  const handleSave = async () => {
    if (!label.trim()) { Alert.alert('Falta nombre', 'Ponle un nombre al bloqueo (ej. "Comida")'); return; }
    const timeErr = validateTimes();
    if (timeErr) { Alert.alert('Horario inválido', timeErr); return; }
    if (days.length === 0) { Alert.alert('Faltan días', 'Selecciona al menos un día'); return; }

    setSaving(true);
    try {
      // Si seleccionó múltiples días Y es nuevo bloqueo, crear uno por día.
      // Si es edición, solo se permite editar uno (el original).
      if (block) {
        // Edición: solo se permite cambiar 1 día
        await onSave({
          label: label.trim(),
          start_time: startTime,
          end_time: endTime,
          is_recurring: true,
          day_of_week: days[0],
          specific_date: null,
          staff_id: staffId,
        });
      } else {
        // Creación: crea uno por cada día seleccionado
        for (const dayIdx of days) {
          await onSave({
            label: label.trim(),
            start_time: startTime,
            end_time: endTime,
            is_recurring: true,
            day_of_week: dayIdx,
            specific_date: null,
            staff_id: staffId,
          });
        }
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={mod.overlay}>
        <View style={[mod.content, { backgroundColor: tc.surface }]}>
          <View style={mod.header}>
            <Text style={[mod.title, { color: tc.text }]}>
              {block ? 'Editar bloqueo' : 'Nuevo bloqueo'}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialIcons name="close" size={24} color={tc.text} />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={mod.body} keyboardShouldPersistTaps="handled">
              {/* Nombre */}
              <Text style={[mod.label, { color: tc.textMuted }]}>NOMBRE</Text>
              <TextInput
                style={[mod.input, { backgroundColor: tc.bg, color: tc.text, borderColor: tc.border }]}
                value={label}
                onChangeText={setLabel}
                placeholder="Comida, Junta, Descanso..."
                placeholderTextColor={tc.textMuted}
                maxLength={40}
              />

              {/* Días */}
              <Text style={[mod.label, { color: tc.textMuted, marginTop: 16 }]}>
                {block ? 'DÍA' : 'DÍAS DE LA SEMANA'}
              </Text>
              <View style={mod.daysRow}>
                {DAYS_LABEL.map((d, idx) => {
                  const active = days.includes(idx);
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[mod.dayChip, active && mod.dayChipActive]}
                      onPress={() => {
                        if (block) {
                          // En edición solo se permite seleccionar 1 día
                          setDays([idx]);
                        } else {
                          toggleDay(idx);
                        }
                      }}
                    >
                      <Text style={[mod.dayChipText, active && mod.dayChipTextActive]}>{d}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {!block && (
                <Text style={[mod.hint, { color: tc.textMuted }]}>
                  Se creará un bloqueo por cada día seleccionado
                </Text>
              )}

              {/* Horario */}
              <Text style={[mod.label, { color: tc.textMuted, marginTop: 16 }]}>HORARIO</Text>
              <View style={mod.timeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[mod.timeLabel, { color: tc.textMuted }]}>Inicio</Text>
                  <TextInput
                    style={[mod.input, { backgroundColor: tc.bg, color: tc.text, borderColor: tc.border, textAlign: 'center', fontSize: 18, fontWeight: '700' }]}
                    value={startTime}
                    onChangeText={setStartTime}
                    placeholder="14:00"
                    placeholderTextColor={tc.textMuted}
                    maxLength={5}
                  />
                </View>
                <Text style={[mod.timeArrow, { color: tc.textMuted }]}>→</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[mod.timeLabel, { color: tc.textMuted }]}>Fin</Text>
                  <TextInput
                    style={[mod.input, { backgroundColor: tc.bg, color: tc.text, borderColor: tc.border, textAlign: 'center', fontSize: 18, fontWeight: '700' }]}
                    value={endTime}
                    onChangeText={setEndTime}
                    placeholder="15:00"
                    placeholderTextColor={tc.textMuted}
                    maxLength={5}
                  />
                </View>
              </View>
              <Text style={[mod.hint, { color: tc.textMuted }]}>Formato 24h. Ejemplo: 14:00 a 15:00</Text>

              {/* Aplica a (solo Luxury con staff) */}
              {staffMembers.length > 0 && (
                <>
                  <Text style={[mod.label, { color: tc.textMuted, marginTop: 16 }]}>APLICA A</Text>
                  <TouchableOpacity
                    style={[mod.staffOption, !staffId && mod.staffOptionActive, { backgroundColor: tc.bg, borderColor: tc.border }]}
                    onPress={() => setStaffId(null)}
                  >
                    <View style={[mod.staffIconWrap, { backgroundColor: '#F1F5F9' }]}>
                      <MaterialIcons name="store" size={18} color="#64748B" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[mod.staffName, { color: tc.text }]}>Todo el negocio</Text>
                      <Text style={[mod.staffDesc, { color: tc.textMuted }]}>
                        Bloquea las citas para todos los colaboradores
                      </Text>
                    </View>
                    {!staffId && <MaterialIcons name="check-circle" size={20} color={colors.primary} />}
                  </TouchableOpacity>
                  {staffMembers.map(staff => (
                    <TouchableOpacity
                      key={staff.id}
                      style={[mod.staffOption, staffId === staff.id && mod.staffOptionActive, { backgroundColor: tc.bg, borderColor: tc.border }]}
                      onPress={() => setStaffId(staff.id)}
                    >
                      <View style={[mod.staffIconWrap, { backgroundColor: staff.color + '22' }]}>
                        <Text style={[mod.staffInitials, { color: staff.color }]}>
                          {staff.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[mod.staffName, { color: tc.text }]}>{staff.name}</Text>
                        <Text style={[mod.staffDesc, { color: tc.textMuted }]}>
                          Solo bloquea citas de este colaborador
                        </Text>
                      </View>
                      {staffId === staff.id && <MaterialIcons name="check-circle" size={20} color={colors.primary} />}
                    </TouchableOpacity>
                  ))}
                </>
              )}

              <TouchableOpacity
                style={[mod.saveBtn, saving && mod.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={mod.saveBtnText}>{block ? 'Guardar cambios' : 'Crear bloqueo'}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </View>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════
// Estilos
// ════════════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  container: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn: { padding: 4 },
  addBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 40 },

  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 20 },
  infoText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  sectionHint: { fontSize: 10, marginLeft: 'auto' },

  staffDot: { width: 8, height: 8, borderRadius: 4 },

  emptyCard: { borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed' },
  emptyText: { fontSize: 13 },

  blockCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  blockIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FFFBEB', justifyContent: 'center', alignItems: 'center' },
  blockInfo: { flex: 1 },
  blockLabel: { fontSize: 14, fontWeight: '700' },
  blockMeta: { fontSize: 12, marginTop: 2 },
  blockAction: { padding: 6 },

  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, marginTop: 24 },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

const mod = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  content: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', minHeight: '70%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0' },
  title: { fontSize: 18, fontWeight: '700' },
  body: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  input: { borderRadius: 12, padding: 14, fontSize: 15, borderWidth: 1 },
  hint: { fontSize: 11, marginTop: 6 },
  daysRow: { flexDirection: 'row', gap: 6 },
  dayChip: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#fff' },
  dayChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipText: { fontSize: 13, fontWeight: '700', color: '#94A3B8' },
  dayChipTextActive: { color: '#fff' },
  timeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  timeLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  timeArrow: { fontSize: 18, paddingBottom: 14 },
  staffOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  staffOptionActive: { borderColor: colors.primary, borderWidth: 2 },
  staffIconWrap: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  staffInitials: { fontSize: 14, fontWeight: '800' },
  staffName: { fontSize: 14, fontWeight: '700' },
  staffDesc: { fontSize: 11, marginTop: 1 },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 24 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
