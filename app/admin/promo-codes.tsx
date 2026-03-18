import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

interface PromoCode {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  durationMonths: number | null;
  maxUses: number;
  currentUses: number;
  isActive: boolean;
  notes: string;
  stripePromoCodeId?: string;
  createdAt: string;
}

export default function PromoCodesScreen() {
  const router = useRouter();
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form state
  const [code, setCode] = useState('');
  const [notes, setNotes] = useState('');
  const [isFree, setIsFree] = useState(true);
  const [discountValue, setDiscountValue] = useState('50');
  const [isPermanent, setIsPermanent] = useState(false); // default: no permanente
  const [durationMonths, setDurationMonths] = useState('1'); // default: 1 mes
  const [maxUses, setMaxUses] = useState('1');

  useEffect(() => { loadCodes(); }, []);

  const loadCodes = async () => {
    try {
      const { data } = await supabase
        .from('promo_codes')
        .select('*')
        .order('created_at', { ascending: false });

      setCodes((data || []).map((c: any) => ({
        id: c.id,
        code: c.code,
        discountType: c.discount_type,
        discountValue: c.discount_value,
        // duration_days en BD se interpreta ahora como meses
        durationMonths: c.duration_days,
        maxUses: c.max_uses,
        currentUses: c.current_uses,
        isActive: c.is_active,
        notes: c.notes || '',
        stripePromoCodeId: c.stripe_promo_code_id,
        createdAt: c.created_at,
      })));
    } catch (error) {
      console.error('[PromoCodes] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const result = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    setCode(`VYLTA-${result}`);
    setErrorMsg('');
  };

  const handleSave = async () => {
    if (!code.trim()) { setErrorMsg('El código es requerido'); return; }
    const months = parseInt(durationMonths);
    if (!isPermanent && (!months || months < 1 || months > 12)) {
      setErrorMsg('La duración debe ser entre 1 y 12 meses'); return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.functions.invoke('create-promo-code', {
        body: {
          code: code.trim().toUpperCase(),
          discountType: isFree ? 'full' : 'percent',
          discountValue: isFree ? 100 : parseInt(discountValue),
          durationMonths: isPermanent ? null : months,
          maxUses: parseInt(maxUses),
          notes: notes.trim(),
          createdBy: user?.id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setShowForm(false);
      setCode(''); setNotes(''); setIsFree(true); setIsPermanent(false);
      setDurationMonths('1'); setMaxUses('1');
      loadCodes();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al crear el código');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from('promo_codes').update({ is_active: !current }).eq('id', id);
    loadCodes();
  };

  const getDurationLabel = (months: number | null) => {
    if (!months) return '♾️ Permanente';
    if (months === 1) return '1 mes';
    return `${months} meses`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🎟️ Códigos Promo</Text>
        <TouchableOpacity onPress={() => { setShowForm(!showForm); setErrorMsg(''); }}>
          <Text style={styles.addBtn}>{showForm ? 'Cancelar' : '+ Nuevo'}</Text>
        </TouchableOpacity>
      </View>

      {!showForm && (
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>
            ✅ Los códigos se crean automáticamente en <Text style={{ fontWeight: '700' }}>Stripe</Text>.
            Funcionarán directamente en la ventana de pago.
          </Text>
        </View>
      )}

      {showForm && (
        <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.form}>
            <Text style={styles.formTitle}>Nuevo código promocional</Text>
            <Text style={styles.formSubtitle}>Se creará en Stripe y estará listo para usar inmediatamente.</Text>

            <Text style={styles.fieldLabel}>Código</Text>
            <View style={styles.codeRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="VYLTA-XXXXXXXX"
                placeholderTextColor="#475569"
                value={code}
                onChangeText={t => { setCode(t.toUpperCase()); setErrorMsg(''); }}
                autoCapitalize="characters"
              />
              <TouchableOpacity style={styles.generateBtn} onPress={generateCode}>
                <Text style={styles.generateBtnText}>🎲 Auto</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Para quién es / motivo (interno)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: Beta tester, cliente especial..."
              placeholderTextColor="#475569"
              value={notes}
              onChangeText={setNotes}
            />

            <View style={styles.switchRow}>
              <View>
                <Text style={styles.fieldLabel}>100% Gratis</Text>
                <Text style={styles.fieldHint}>El usuario no paga durante la duración</Text>
              </View>
              <Switch value={isFree} onValueChange={setIsFree} trackColor={{ true: '#10B981' }} />
            </View>

            {!isFree && (
              <>
                <Text style={styles.fieldLabel}>% de descuento (ej: 50 = 50% off)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="50"
                  placeholderTextColor="#475569"
                  value={discountValue}
                  onChangeText={setDiscountValue}
                  keyboardType="numeric"
                />
              </>
            )}

            <View style={styles.switchRow}>
              <View>
                <Text style={styles.fieldLabel}>Descuento permanente</Text>
                <Text style={styles.fieldHint}>Aplica en todos los meses sin límite</Text>
              </View>
              <Switch value={isPermanent} onValueChange={setIsPermanent} trackColor={{ true: '#F59E0B' }} />
            </View>

            {!isPermanent && (
              <>
                <Text style={styles.fieldLabel}>Duración en meses (1–12)</Text>
                <Text style={styles.fieldHint}>Ej: 1 = primer mes gratis, 3 = tres meses con descuento</Text>
                <View style={styles.monthsRow}>
                  {['1','2','3','6','12'].map(m => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.monthBtn, durationMonths === m && styles.monthBtnActive]}
                      onPress={() => setDurationMonths(m)}
                    >
                      <Text style={[styles.monthBtnText, durationMonths === m && styles.monthBtnTextActive]}>
                        {m === '1' ? '1 mes' : m === '12' ? '1 año' : `${m} meses`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.fieldLabel}>Número máximo de usos</Text>
            <Text style={styles.fieldHint}>Cuántos usuarios pueden usar este código</Text>
            <TextInput
              style={styles.input}
              placeholder="1"
              placeholderTextColor="#475569"
              value={maxUses}
              onChangeText={setMaxUses}
              keyboardType="numeric"
            />

            {/* Resumen */}
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>Resumen del código</Text>
              <Text style={styles.summaryText}>
                {isFree ? '100% gratis' : `${discountValue}% de descuento`}
                {' · '}
                {isPermanent ? 'permanente' : `${durationMonths === '1' ? '1 mes' : durationMonths === '12' ? '1 año' : `${durationMonths} meses`}`}
                {' · '}
                máx {maxUses} {parseInt(maxUses) === 1 ? 'uso' : 'usos'}
              </Text>
            </View>

            {errorMsg ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>❌ {errorMsg}</Text>
              </View>
            ) : null}

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>✅ Crear código en Stripe</Text>
              }
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {!showForm && (
        loading ? (
          <ActivityIndicator size="large" color="#F59E0B" style={{ flex: 1 }} />
        ) : (
          <ScrollView contentContainerStyle={styles.scroll}>
            {codes.length === 0 ? (
              <Text style={styles.empty}>No hay códigos promocionales aún</Text>
            ) : (
              codes.map((c) => (
                <View key={c.id} style={[styles.card, !c.isActive && styles.cardInactive]}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.codeText}>{c.code}</Text>
                      <Text style={styles.notesText}>{c.notes || 'Sin descripción'}</Text>
                      <View style={[styles.stripeBadge, { backgroundColor: c.stripePromoCodeId ? '#0D9488' : '#EF4444' }]}>
                        <Text style={styles.stripeBadgeText}>
                          {c.stripePromoCodeId ? '✅ En Stripe' : '⚠️ Solo en BD'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.cardBadges}>
                      <View style={[styles.badge, { backgroundColor: c.discountValue >= 100 ? '#10B981' : '#F59E0B' }]}>
                        <Text style={styles.badgeText}>{c.discountValue >= 100 ? '🆓 Gratis' : `${c.discountValue}% off`}</Text>
                      </View>
                      <View style={[styles.badge, { backgroundColor: c.durationMonths ? '#6366F1' : '#0F172A' }]}>
                        <Text style={styles.badgeText}>{getDurationLabel(c.durationMonths)}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.cardBottom}>
                    <Text style={styles.usesText}>Usos: {c.currentUses}/{c.maxUses === 999 ? '∞' : c.maxUses}</Text>
                    <Text style={styles.dateText}>{new Date(c.createdAt).toLocaleDateString('es-MX')}</Text>
                    <TouchableOpacity
                      style={[styles.toggleBtn, { backgroundColor: c.isActive ? '#EF4444' : '#10B981' }]}
                      onPress={() => toggleActive(c.id, c.isActive)}
                    >
                      <Text style={styles.toggleText}>{c.isActive ? 'Desactivar' : 'Activar'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  back: { color: '#94A3B8', fontSize: 15 },
  title: { fontSize: 18, fontWeight: '700', color: '#F8FAFC' },
  addBtn: { color: '#F59E0B', fontWeight: '700', fontSize: 15 },
  infoBanner: { backgroundColor: '#0D2B2B', margin: 16, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#0D9488' },
  infoBannerText: { color: '#5EEAD4', fontSize: 13, lineHeight: 20 },
  formScroll: { flex: 1 },
  form: { backgroundColor: '#1E293B', margin: 16, borderRadius: 16, padding: 16, gap: 12 },
  formTitle: { fontSize: 16, fontWeight: '700', color: '#F8FAFC', marginBottom: 2 },
  formSubtitle: { fontSize: 12, color: '#64748B', marginBottom: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
  fieldHint: { fontSize: 11, color: '#475569', marginTop: 2 },
  input: { backgroundColor: '#0F172A', borderRadius: 10, padding: 12, color: '#F8FAFC', fontSize: 14 },
  codeRow: { flexDirection: 'row', gap: 8 },
  generateBtn: { backgroundColor: '#3B82F6', borderRadius: 10, padding: 12, justifyContent: 'center' },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  // Selector de meses
  monthsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  monthBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155' },
  monthBtnActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  monthBtnText: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  monthBtnTextActive: { color: '#fff' },
  // Resumen
  summaryBox: { backgroundColor: '#0F172A', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#10B981' },
  summaryTitle: { fontSize: 11, fontWeight: '700', color: '#10B981', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryText: { fontSize: 13, color: '#F8FAFC', fontWeight: '500' },
  errorBox: { backgroundColor: '#2D1515', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#EF4444' },
  errorText: { color: '#F87171', fontSize: 13 },
  saveBtn: { backgroundColor: '#10B981', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  scroll: { padding: 16, paddingBottom: 100 },
  empty: { textAlign: 'center', color: '#475569', marginTop: 40, fontSize: 15 },
  card: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 12, gap: 10 },
  cardInactive: { opacity: 0.5 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  codeText: { fontSize: 18, fontWeight: '800', color: '#F59E0B', letterSpacing: 1 },
  notesText: { fontSize: 12, color: '#64748B', marginTop: 4 },
  stripeBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 6 },
  stripeBadgeText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  cardBadges: { gap: 4, alignItems: 'flex-end' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  usesText: { fontSize: 12, color: '#94A3B8' },
  dateText: { fontSize: 12, color: '#475569' },
  toggleBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  toggleText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
