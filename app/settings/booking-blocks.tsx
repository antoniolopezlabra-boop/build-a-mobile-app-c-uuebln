import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Switch, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { usePlan } from '@/contexts/PlanContext';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import TimePickerModal from '@/components/TimePickerModal';
import { supabase } from '@/lib/supabase';

// ⚡ Jun 2026: Recepción por bloques (modo alternativo del link público).
// Cuando se activa, el link público (book.vylta.lat) deja de mostrar la
// rejilla de 30 min y solo ofrece las ventanas fijas definidas aquí.
// La cita ocupa todo el bloque. Capacidad vía colaboradores (Luxury).
// Solo gobierna el link público; el dueño sigue creando citas libremente
// desde la app/CRM.
//
// IMPORTANTE: day_of_week se guarda en convención del PROYECTO (0=Lun..6=Dom),
// igual que el CRM y que buildBlocks() en book.html. NO usar la convención
// JS de schedule.tsx (que pasa por la capa API y traduce aparte).
//
// Tablas (Supabase directo, mismo patrón que la pantalla de equipo):
//   • booking_links.booking_mode ('normal' | 'bloques')
//   • booking_blocks (delete + insert al guardar)

const DAYS = [
  { value: 0, name: 'Lunes' },
  { value: 1, name: 'Martes' },
  { value: 2, name: 'Miércoles' },
  { value: 3, name: 'Jueves' },
  { value: 4, name: 'Viernes' },
  { value: 5, name: 'Sábado' },
  { value: 6, name: 'Domingo' },
];

interface Block { uid: string; day: number; start: string; end: string; }

let _uid = 0;
function newUid() { _uid += 1; return `b${Date.now()}_${_uid}`; }

function addMinStr(t: string, mins: number): string {
  const [h, m] = (t || '00:00').split(':').map(Number);
  let tot = h * 60 + m + mins;
  if (tot > 23 * 60 + 59) tot = 23 * 60 + 59;
  return String(Math.floor(tot / 60)).padStart(2, '0') + ':' + String(tot % 60).padStart(2, '0');
}

function fmt12(t: string): string {
  const [hh, mm] = (t || '00:00').split(':');
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const dh = h % 12 || 12;
  return `${dh}:${mm} ${ampm}`;
}

export default function BookingBlocksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isBasico, isPremium } = usePlan();
  const canUseBlocks = isBasico || isPremium;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [linkExists, setLinkExists] = useState(true);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [picker, setPicker] = useState<{ uid: string; field: 'start' | 'end' } | null>(null);
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });
  const [successModal, setSuccessModal] = useState(false);

  const safeBottom = Math.max(insets.bottom, 16);

  useEffect(() => { if (canUseBlocks) load(); else setLoading(false); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [linkRes, blocksRes] = await Promise.all([
        supabase.from('booking_links').select('booking_mode').eq('user_id', user?.id).maybeSingle(),
        supabase.from('booking_blocks').select('day_of_week, start_time, end_time').eq('user_id', user?.id).order('day_of_week').order('sort_order'),
      ]);
      if (linkRes.error || !linkRes.data) {
        setLinkExists(false);
      } else {
        setLinkExists(true);
        setEnabled((((linkRes.data as any).booking_mode) || 'normal') === 'bloques');
      }
      if (!blocksRes.error && blocksRes.data) {
        setBlocks((blocksRes.data as any[]).map((b) => ({
          uid: newUid(),
          day: b.day_of_week,
          start: (b.start_time || '10:00').slice(0, 5),
          end: (b.end_time || '12:00').slice(0, 5),
        })));
      }
    } catch (e) {
      // fallback silencioso: queda en normal sin bloques
    } finally {
      setLoading(false);
    }
  };

  const addBlock = (day: number) => {
    setBlocks((prev) => {
      const db = prev.filter((b) => b.day === day);
      let start = '10:00', end = '12:00';
      if (db.length) { start = db[db.length - 1].end; end = addMinStr(start, 120); }
      return [...prev, { uid: newUid(), day, start, end }];
    });
  };
  const removeBlock = (uid: string) => setBlocks((prev) => prev.filter((b) => b.uid !== uid));
  const updateBlock = (uid: string, field: 'start' | 'end', time: string) =>
    setBlocks((prev) => prev.map((b) => (b.uid === uid ? { ...b, [field]: time } : b)));

  const validate = (): string | null => {
    for (const b of blocks) {
      if (b.start >= b.end) {
        const d = DAYS.find((x) => x.value === b.day)?.name;
        return `En ${d}: un bloque tiene la hora de inicio igual o posterior al fin.`;
      }
    }
    for (const d of DAYS) {
      const db = blocks.filter((b) => b.day === d.value).slice().sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 1; i < db.length; i++) {
        if (db[i].start < db[i - 1].end) return `En ${d.name}: hay bloques que se enciman. Ajústalos para que no se traslapen.`;
      }
    }
    if (enabled && blocks.length === 0) return 'Agrega al menos un bloque antes de activar la recepción por bloques.';
    return null;
  };

  const handleSave = async () => {
    if (!linkExists) {
      setErrorModal({ visible: true, message: 'Primero activa tu link de cita pública para poder usar este modo.' });
      return;
    }
    const err = validate();
    if (err) { setErrorModal({ visible: true, message: err }); return; }

    setSaving(true);
    try {
      const { error: modeErr } = await supabase
        .from('booking_links')
        .update({ booking_mode: enabled ? 'bloques' : 'normal', updated_at: new Date().toISOString() })
        .eq('user_id', user?.id);
      if (modeErr) throw modeErr;

      const { error: delErr } = await supabase.from('booking_blocks').delete().eq('user_id', user?.id);
      if (delErr) throw delErr;

      if (blocks.length > 0) {
        const perDay: Record<number, number> = {};
        const rows = blocks
          .slice()
          .sort((a, b) => (a.day - b.day) || a.start.localeCompare(b.start))
          .map((b) => {
            const order = perDay[b.day] = (perDay[b.day] ?? -1) + 1;
            return { user_id: user?.id, day_of_week: b.day, start_time: b.start, end_time: b.end, is_active: true, sort_order: order };
          });
        const { error: insErr } = await supabase.from('booking_blocks').insert(rows);
        if (insErr) throw insErr;
      }
      setSuccessModal(true);
    } catch (e: any) {
      setErrorModal({ visible: true, message: e?.message || 'No pudimos guardar los cambios.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <IconSymbol android_material_icon_name="arrow-back" size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.title}>Recepción por bloques</Text>
      <View style={styles.placeholder} />
    </View>
  );

  if (!canUseBlocks) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <View style={styles.paywall}>
          <View style={styles.paywallIcon}><IconSymbol android_material_icon_name="view-week" size={40} color="#6366F1" /></View>
          <Text style={styles.paywallTitle}>Recepción por bloques</Text>
          {/* iOS (Guideline 3.1.1): texto neutro y sin CTA de venta */}
          <Text style={styles.paywallDesc}>{Platform.OS === 'ios'
            ? 'Recibe citas solo en ventanas de tiempo fijas (ej. 10–12, 12–14), sin horarios intermedios. No incluido en tu plan actual.'
            : 'Recibe citas solo en ventanas de tiempo fijas (ej. 10–12, 12–14), sin horarios intermedios. Disponible en los planes Premium y Luxury.'}</Text>
          {Platform.OS !== 'ios' && (
            <TouchableOpacity style={styles.paywallBtn} onPress={() => router.push('/settings/subscription')}>
              <IconSymbol android_material_icon_name="star" size={18} color="#fff" />
              <Text style={styles.paywallBtnText}>Ver planes</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ConfirmModal visible={errorModal.visible} title="Aviso" message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'cancel' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })} />
      <ConfirmModal visible={successModal} title="¡Guardado!"
        message={enabled ? 'La recepción por bloques está activa. Tus clientes verán solo los bloques que definiste.' : 'Cambios guardados. La recepción por bloques está desactivada.'}
        buttons={[{ text: 'Aceptar', onPress: () => setSuccessModal(false), style: 'default' }]}
        onDismiss={() => setSuccessModal(false)} />

      {header}

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: safeBottom }]}>
        <Text style={styles.description}>
          Cuando activas este modo, tu link de cita pública deja de mostrar la rejilla de horarios normal y solo ofrece las ventanas que definas aquí. No afecta cómo creas citas tú dentro de la app.
        </Text>

        {/* Toggle */}
        <View style={styles.toggleCard}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleTitle}>Recepción por bloques</Text>
            <Text style={styles.toggleSub}>{enabled ? 'Activa' : 'Inactiva'}</Text>
          </View>
          <Switch value={enabled} onValueChange={setEnabled} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" disabled={saving || !linkExists} />
        </View>

        {!linkExists && (
          <View style={styles.warnBox}>
            <IconSymbol android_material_icon_name="info" size={18} color="#92400E" />
            <Text style={styles.warnText}>Primero activa tu link de cita pública (en Ajustes → Link de cita pública) para usar este modo.</Text>
          </View>
        )}

        {enabled && (
          <>
            <View style={styles.infoBox}>
              <IconSymbol android_material_icon_name="info-outline" size={18} color="#3B82F6" />
              <Text style={styles.infoText}>Define los bloques de cada día. La cita ocupará todo el bloque. Si tienes colaboradores (Luxury), cada bloque acepta una reserva por colaborador.</Text>
            </View>

            {DAYS.map((d) => {
              const db = blocks.filter((b) => b.day === d.value);
              return (
                <View key={d.value} style={styles.dayCard}>
                  <View style={styles.dayHeader}>
                    <Text style={styles.dayName}>{d.name}</Text>
                    <TouchableOpacity style={styles.addBtn} onPress={() => addBlock(d.value)} disabled={saving}>
                      <IconSymbol android_material_icon_name="add" size={18} color={colors.primary} />
                      <Text style={styles.addBtnText}>Añadir</Text>
                    </TouchableOpacity>
                  </View>
                  {db.length === 0 ? (
                    <Text style={styles.emptyDay}>Sin bloques. Este día no recibirá citas en el link.</Text>
                  ) : (
                    db.map((b) => (
                      <View key={b.uid} style={styles.blockRow}>
                        <TouchableOpacity style={styles.timeButton} onPress={() => setPicker({ uid: b.uid, field: 'start' })} disabled={saving}>
                          <IconSymbol android_material_icon_name="schedule" size={18} color={colors.textSecondary} />
                          <Text style={styles.timeText}>{fmt12(b.start)}</Text>
                        </TouchableOpacity>
                        <Text style={styles.timeSeparator}>-</Text>
                        <TouchableOpacity style={styles.timeButton} onPress={() => setPicker({ uid: b.uid, field: 'end' })} disabled={saving}>
                          <IconSymbol android_material_icon_name="schedule" size={18} color={colors.textSecondary} />
                          <Text style={styles.timeText}>{fmt12(b.end)}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.removeBtn} onPress={() => removeBlock(b.uid)} disabled={saving}>
                          <IconSymbol android_material_icon_name="delete-outline" size={20} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </View>
              );
            })}
          </>
        )}

        <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Guardar cambios</Text>}
        </TouchableOpacity>
      </ScrollView>

      {picker && (() => {
        const b = blocks.find((x) => x.uid === picker.uid);
        return (
          <TimePickerModal
            visible={true}
            title={picker.field === 'start' ? 'Inicio del bloque' : 'Fin del bloque'}
            value={b ? b[picker.field] : '10:00'}
            onConfirm={(time: string) => { updateBlock(picker.uid, picker.field, time); setPicker(null); }}
            onCancel={() => setPicker(null)}
          />
        );
      })()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: colors.background },
  loadingContainer:   { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingVertical: 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton:         { padding: 4 },
  title:              { fontSize: 20, fontWeight: 'bold', color: colors.text },
  placeholder:        { width: 32 },
  scrollContent:      { padding: 20 },
  description:        { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 20 },
  toggleCard:         { backgroundColor: colors.card, borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  toggleInfo:         { flex: 1, paddingRight: 12 },
  toggleTitle:        { fontSize: 16, fontWeight: '600', color: colors.text },
  toggleSub:          { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  warnBox:            { flexDirection: 'row', gap: 10, backgroundColor: '#FFFBEB', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#FCD34D', marginBottom: 16 },
  warnText:           { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 18 },
  infoBox:            { flexDirection: 'row', gap: 10, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#BFDBFE', marginBottom: 16 },
  infoText:           { flex: 1, fontSize: 12, color: '#1E40AF', lineHeight: 18 },
  dayCard:            { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  dayHeader:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayName:            { fontSize: 16, fontWeight: '600', color: colors.text },
  addBtn:             { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.primary },
  addBtnText:         { fontSize: 13, fontWeight: '600', color: colors.primary },
  emptyDay:           { fontSize: 12, color: colors.textSecondary, marginTop: 10 },
  blockRow:           { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 },
  timeButton:         { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: 8, padding: 12, gap: 8 },
  timeText:           { fontSize: 15, color: colors.text, fontWeight: '500' },
  timeSeparator:      { fontSize: 16, color: colors.textSecondary },
  removeBtn:          { width: 40, height: 40, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FEF2F2' },
  saveButton:         { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText:     { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
  paywall:            { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36, gap: 14 },
  paywallIcon:        { width: 80, height: 80, borderRadius: 22, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  paywallTitle:       { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  paywallDesc:        { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  paywallBtn:         { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#6366F1', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 8 },
  paywallBtnText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
});
