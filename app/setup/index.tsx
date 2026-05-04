import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, Animated, Clipboard, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { colors } from '@/styles/commonStyles';
import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_OTHER,
  isCustomBusinessType,
  validateCustomBusinessType,
} from '@/constants/businessTypes';

// ═════════════════════════════════════════════════════════════════
// SETUP WIZARD — Onboarding post-registro
// 4 pasos: Negocio → Servicios → Horarios → Link de citas
// Solo aparece la primera vez que el usuario entra. Se marca en AsyncStorage
// con la key `setup_completed_<userId>` para nunca volver a mostrarse.
//
// PASO 1 (Negocio): Lista de 31 tipos + opción 'Otro' con input de texto libre.
// La lista vive en /constants/businessTypes.ts (single source of truth).
//
// PASO 2 (Servicio): Placeholder inclusivo cubre 3 sectores en 3 ejemplos:
//   - Consulta Médica (salud) → médicos, clínicas, especialistas
//   - Corte de cabello (belleza tradicional) → barberías, salones
//   - Poligel (belleza premium) → nail techs modernas
// Icono: inventory_2 (caja con productos) — universal y sin sesgo.
// ═════════════════════════════════════════════════════════════════

const DAYS_OF_WEEK = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export default function SetupWizard() {
  const router = useRouter();
  const { user, businessProfile, refreshBusinessProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // ============ PASO 1: Negocio ============
  const [businessName, setBusinessName] = useState(businessProfile?.businessName || '');
  // Inicialización inteligente del tipo de negocio:
  //   - Si el perfil tiene un valor que SI está en la lista oficial, lo usamos.
  //   - Si tiene un valor que NO está (ej: 'Especialista Parasitólogo'),
  //     ponemos selectedType = 'Otro' y el customType con ese valor.
  //   - Si no tiene nada, vacío.
  const initialType = businessProfile?.businessType || '';
  const [selectedType, setSelectedType] = useState(
    initialType ? (isCustomBusinessType(initialType) ? BUSINESS_TYPE_OTHER : initialType) : ''
  );
  const [customType, setCustomType] = useState(
    isCustomBusinessType(initialType) ? initialType : ''
  );
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [phone, setPhone] = useState(businessProfile?.phone || '');

  // ============ PASO 2: Primer servicio ============
  const [serviceName, setServiceName] = useState('');
  const [servicePrice, setServicePrice] = useState('');
  const [serviceDuration, setServiceDuration] = useState('30');

  // ============ PASO 3: Horarios ============
  const [openDays, setOpenDays] = useState<number[]>([0, 1, 2, 3, 4, 5]); // Lun-Sáb por defecto
  const [openTime, setOpenTime] = useState('09:00');
  const [closeTime, setCloseTime] = useState('19:00');

  // ============ PASO 4: Link ============
  const [bookingSlug, setBookingSlug] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);

  // Animación entre pasos
  const animateStepChange = (next: number) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setStep(next);
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    });
  };

  // Cargar slug existente cuando llegamos al paso 4
  useEffect(() => {
    if (step === 3 && user?.id) loadBookingLink();
  }, [step, user?.id]);

  const loadBookingLink = async () => {
    if (!user?.id) return;
    setLinkLoading(true);
    try {
      const { data } = await supabase
        .from('booking_links')
        .select('slug')
        .eq('user_id', user.id)
        .single();
      if (data?.slug) setBookingSlug(data.slug);
    } catch (e) {
      console.error('[Setup] Error loading booking link:', e);
    } finally {
      setLinkLoading(false);
    }
  };

  const markSetupCompleted = async () => {
    if (!user?.id) return;
    await AsyncStorage.setItem(`setup_completed_${user.id}`, 'true');
  };

  const handleSkipAll = () => {
    Alert.alert(
      '¿Saltar configuración?',
      'Puedes configurar tu negocio más tarde desde Ajustes. Pero hacerlo ahora te tomará solo 2 minutos.',
      [
        { text: 'Continuar configuración', style: 'cancel' },
        {
          text: 'Saltar por ahora',
          style: 'destructive',
          onPress: async () => {
            await markSetupCompleted();
            router.replace('/(tabs)/(home)');
          },
        },
      ]
    );
  };

  // ---------- PASO 1: Guardar negocio ----------
  // Calcula el valor final que se guarda en BD:
  //   - Si selectedType es 'Otro' → usa customType (texto libre del usuario)
  //   - Caso contrario → usa selectedType tal cual
  const getEffectiveBusinessType = (): string => {
    if (selectedType === BUSINESS_TYPE_OTHER) {
      return customType.trim();
    }
    return selectedType;
  };

  const handleSaveBusinessAndNext = async () => {
    if (!businessName.trim()) {
      Alert.alert('Falta información', 'Por favor escribe el nombre de tu negocio.');
      return;
    }
    if (!selectedType) {
      Alert.alert('Falta información', 'Por favor selecciona el tipo de negocio.');
      return;
    }
    // Validar input personalizado de 'Otro'
    if (selectedType === BUSINESS_TYPE_OTHER) {
      const v = validateCustomBusinessType(customType);
      if (!v.valid) {
        Alert.alert('Tipo de negocio', v.error || 'Escribe tu tipo de negocio.');
        return;
      }
    }
    if (!user?.id) return;
    setSaving(true);
    try {
      const finalBusinessType = getEffectiveBusinessType();
      await supabase.from('business_profiles').upsert({
        user_id: user.id,
        business_name: businessName.trim(),
        business_type: finalBusinessType,
        phone: phone.trim() || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (refreshBusinessProfile) await refreshBusinessProfile();
      animateStepChange(1);
    } catch (err: any) {
      Alert.alert('Error', 'No se pudo guardar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  // ---------- PASO 2: Guardar primer servicio ----------
  const handleSaveServiceAndNext = async () => {
    if (!user?.id) return;
    if (!serviceName.trim()) {
      animateStepChange(2);
      return;
    }
    const price = parseFloat(servicePrice);
    const duration = parseInt(serviceDuration);
    if (isNaN(price) || price < 0) {
      Alert.alert('Precio inválido', 'Escribe un precio válido o deja el campo vacío para agregar después.');
      return;
    }
    if (isNaN(duration) || duration < 5) {
      Alert.alert('Duración inválida', 'La duración mínima es de 5 minutos.');
      return;
    }
    setSaving(true);
    try {
      await supabase.from('services').insert({
        user_id: user.id,
        name: serviceName.trim(),
        price,
        duration_minutes: duration,
        is_active: true,
      });
      animateStepChange(2);
    } catch (err: any) {
      Alert.alert('Error', 'No se pudo guardar el servicio.');
    } finally {
      setSaving(false);
    }
  };

  // ---------- PASO 3: Guardar horarios ----------
  const handleSaveScheduleAndNext = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const rows = Array.from({ length: 7 }, (_, dayIdx) => ({
        user_id: user.id,
        day_of_week: dayIdx,
        start_time: openTime,
        end_time: closeTime,
        is_open: openDays.includes(dayIdx),
      }));
      await supabase.from('business_hours').delete().eq('user_id', user.id);
      await supabase.from('business_hours').insert(rows);
      animateStepChange(3);
    } catch (err: any) {
      Alert.alert('Error', 'No se pudieron guardar los horarios.');
    } finally {
      setSaving(false);
    }
  };

  // ---------- PASO 4: Finalizar ----------
  const handleFinish = async () => {
    await markSetupCompleted();
    router.replace('/(tabs)/(home)');
  };

  const handleCopyLink = () => {
    if (!bookingSlug) return;
    const url = `https://book.vylta.lat/${bookingSlug}`;
    Clipboard.setString(url);
    Alert.alert('¡Copiado!', `Tu link "${url}" se copió al portapapeles. Compártelo en tu Instagram, WhatsApp y Google Business.`);
  };

  const toggleDay = (dayIdx: number) => {
    setOpenDays(prev =>
      prev.includes(dayIdx) ? prev.filter(d => d !== dayIdx) : [...prev, dayIdx]
    );
  };

  const renderProgressBar = () => (
    <View style={s.progressContainer}>
      <View style={s.progressBarBg}>
        <View style={[s.progressBarFill, { width: `${((step + 1) / 4) * 100}%` }]} />
      </View>
      <Text style={s.progressText}>Paso {step + 1} de 4</Text>
    </View>
  );

  // Texto que se muestra en el botón del picker
  const pickerDisplayText = () => {
    if (!selectedType) return 'Seleccionar tipo de negocio';
    if (selectedType === BUSINESS_TYPE_OTHER) {
      return customType.trim() ? `Otro: ${customType.trim()}` : 'Otro (especifica)';
    }
    return selectedType;
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Configura tu negocio</Text>
          <Text style={s.headerSub}>Toma 2 minutos. Te ahorras horas después.</Text>
        </View>
        <TouchableOpacity onPress={handleSkipAll} style={s.skipBtn}>
          <Text style={s.skipText}>Saltar</Text>
        </TouchableOpacity>
      </View>

      {renderProgressBar()}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: fadeAnim }}>

            {/* ============ PASO 1: NEGOCIO ============ */}
            {step === 0 && (
              <>
                <View style={s.stepIconWrap}>
                  <View style={[s.stepIconCircle, { backgroundColor: '#ECFDF5' }]}>
                    <MaterialIcons name="store" size={40} color={colors.primary} />
                  </View>
                </View>
                <Text style={s.stepTitle}>Cuéntanos de tu negocio</Text>
                <Text style={s.stepDesc}>Esta información aparecerá en tu link público de citas.</Text>

                <Text style={s.label}>Nombre del negocio *</Text>
                <TextInput
                  style={s.input}
                  placeholder="Ej. Salón Bella, Barbería Clásica"
                  placeholderTextColor="#94A3B8"
                  value={businessName}
                  onChangeText={setBusinessName}
                  autoCapitalize="words"
                  maxLength={60}
                />

                <Text style={s.label}>Tipo de negocio *</Text>
                <TouchableOpacity
                  style={s.pickerButton}
                  onPress={() => setShowTypePicker(true)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.pickerButtonText, !selectedType && s.pickerButtonPlaceholder]} numberOfLines={1}>
                    {pickerDisplayText()}
                  </Text>
                  <MaterialIcons name="arrow-drop-down" size={24} color="#64748B" />
                </TouchableOpacity>

                {/* Input de texto libre cuando se selecciona 'Otro' */}
                {selectedType === BUSINESS_TYPE_OTHER && (
                  <View style={s.customInputWrap}>
                    <Text style={s.customInputLabel}>Especifica tu tipo de negocio o especialidad *</Text>
                    <TextInput
                      style={s.input}
                      placeholder="Ej. Especialista Parasitólogo, Acupunturista..."
                      placeholderTextColor="#94A3B8"
                      value={customType}
                      onChangeText={setCustomType}
                      autoCapitalize="words"
                      maxLength={50}
                    />
                    <Text style={s.customInputHint}>{customType.length}/50 caracteres</Text>
                  </View>
                )}

                <Text style={s.label}>Teléfono de contacto (opcional)</Text>
                <TextInput
                  style={s.input}
                  placeholder="442 123 4567"
                  placeholderTextColor="#94A3B8"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  maxLength={15}
                />
              </>
            )}

            {/* ============ PASO 2: SERVICIO ============ */}
            {step === 1 && (
              <>
                <View style={s.stepIconWrap}>
                  <View style={[s.stepIconCircle, { backgroundColor: '#FFFBEB' }]}>
                    <MaterialIcons name="inventory-2" size={40} color="#F59E0B" />
                  </View>
                </View>
                <Text style={s.stepTitle}>Agrega tu primer servicio</Text>
                <Text style={s.stepDesc}>Lo que ofreces a tus clientes. Podrás agregar más después desde Ajustes.</Text>

                <Text style={s.label}>Nombre del servicio</Text>
                <TextInput
                  style={s.input}
                  placeholder="Ej. Consulta Médica, Corte de cabello, Poligel"
                  placeholderTextColor="#94A3B8"
                  value={serviceName}
                  onChangeText={setServiceName}
                  autoCapitalize="sentences"
                  maxLength={50}
                />

                <View style={s.row2}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>Precio (MXN)</Text>
                    <TextInput
                      style={s.input}
                      placeholder="250"
                      placeholderTextColor="#94A3B8"
                      value={servicePrice}
                      onChangeText={setServicePrice}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>Duración (min)</Text>
                    <TextInput
                      style={s.input}
                      placeholder="30"
                      placeholderTextColor="#94A3B8"
                      value={serviceDuration}
                      onChangeText={setServiceDuration}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <View style={s.tipBox}>
                  <MaterialIcons name="lightbulb" size={16} color="#F59E0B" />
                  <Text style={s.tipText}>
                    Si quieres agregar después, deja los campos vacíos y toca Continuar.
                  </Text>
                </View>
              </>
            )}

            {/* ============ PASO 3: HORARIOS ============ */}
            {step === 2 && (
              <>
                <View style={s.stepIconWrap}>
                  <View style={[s.stepIconCircle, { backgroundColor: '#EFF6FF' }]}>
                    <MaterialIcons name="schedule" size={40} color="#3B82F6" />
                  </View>
                </View>
                <Text style={s.stepTitle}>¿Qué días atiendes?</Text>
                <Text style={s.stepDesc}>Toca los días que estás abierto. Podrás ajustar horarios específicos por día en Ajustes.</Text>

                <View style={s.daysRow}>
                  {DAYS_OF_WEEK.map((d, idx) => {
                    const active = openDays.includes(idx);
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[s.dayChip, active && s.dayChipActive]}
                        onPress={() => toggleDay(idx)}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.dayChipText, active && s.dayChipTextActive]}>{d}</Text>
                        <Text style={[s.dayChipSubText, active && s.dayChipSubTextActive]}>{DAY_NAMES[idx].substring(0, 3)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={s.row2}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>Hora de apertura</Text>
                    <TextInput
                      style={s.input}
                      placeholder="09:00"
                      placeholderTextColor="#94A3B8"
                      value={openTime}
                      onChangeText={setOpenTime}
                      maxLength={5}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>Hora de cierre</Text>
                    <TextInput
                      style={s.input}
                      placeholder="19:00"
                      placeholderTextColor="#94A3B8"
                      value={closeTime}
                      onChangeText={setCloseTime}
                      maxLength={5}
                    />
                  </View>
                </View>

                <View style={s.tipBox}>
                  <MaterialIcons name="info" size={16} color="#3B82F6" />
                  <Text style={s.tipText}>
                    Formato 24h. Ejemplo: 09:00 a 19:00. Estos horarios aplicarán a todos los días seleccionados.
                  </Text>
                </View>
              </>
            )}

            {/* ============ PASO 4: LINK ============ */}
            {step === 3 && (
              <>
                <View style={s.stepIconWrap}>
                  <View style={[s.stepIconCircle, { backgroundColor: '#F5F3FF' }]}>
                    <MaterialIcons name="link" size={40} color="#8B5CF6" />
                  </View>
                </View>
                <Text style={s.stepTitle}>¡Tu negocio está listo!</Text>
                <Text style={s.stepDesc}>Comparte tu link público para que tus clientes agenden citas en línea.</Text>

                {linkLoading ? (
                  <View style={s.linkLoadingBox}>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={s.linkLoadingText}>Generando tu link...</Text>
                  </View>
                ) : bookingSlug ? (
                  <>
                    <View style={s.linkBox}>
                      <MaterialIcons name="link" size={20} color={colors.primary} />
                      <Text style={s.linkText} numberOfLines={1}>
                        book.vylta.lat/{bookingSlug}
                      </Text>
                    </View>
                    <TouchableOpacity style={s.copyBtn} onPress={handleCopyLink} activeOpacity={0.8}>
                      <MaterialIcons name="content-copy" size={18} color="#fff" />
                      <Text style={s.copyBtnText}>Copiar link</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={s.linkLoadingBox}>
                    <Text style={s.linkLoadingText}>Tu link se activará cuando completes la configuración del link de citas en Ajustes.</Text>
                  </View>
                )}

                <Text style={s.shareTitle}>Dónde compartirlo:</Text>
                {[
                  ['camera-alt', 'Bio de Instagram', '#E1306C'],
                  ['phone-android', 'Estado de WhatsApp', '#25D366'],
                  ['public', 'Google Business', '#4285F4'],
                  ['facebook', 'Página de Facebook', '#1877F2'],
                ].map(([icon, label, color]) => (
                  <View key={label} style={s.shareRow}>
                    <View style={[s.shareIconBox, { backgroundColor: `${color}15` }]}>
                      <MaterialIcons name={icon as any} size={18} color={color as string} />
                    </View>
                    <Text style={s.shareText}>{label}</Text>
                  </View>
                ))}
              </>
            )}

          </Animated.View>
        </ScrollView>

        {/* Footer con botones */}
        <View style={s.footer}>
          {step > 0 && (
            <TouchableOpacity
              style={s.backBtn}
              onPress={() => animateStepChange(step - 1)}
              disabled={saving}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={20} color="#64748B" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.nextBtn, saving && s.nextBtnDisabled]}
            onPress={
              step === 0 ? handleSaveBusinessAndNext :
              step === 1 ? handleSaveServiceAndNext :
              step === 2 ? handleSaveScheduleAndNext :
              handleFinish
            }
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={s.nextBtnText}>
                  {step === 3 ? 'Comenzar a usar VYLTA' : 'Continuar'}
                </Text>
                <MaterialIcons name={step === 3 ? 'check' : 'arrow-forward'} size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* MODAL: Selector de tipo de negocio */}
      <Modal
        visible={showTypePicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowTypePicker(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.pickerContainer}>
            <View style={s.pickerHeader}>
              <Text style={s.pickerTitle}>Tipo de negocio</Text>
              <TouchableOpacity onPress={() => setShowTypePicker(false)} style={s.pickerCloseBtn}>
                <MaterialIcons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>
            <Text style={s.pickerSubtitle}>
              Selecciona el que mejor describe tu negocio. Si no aparece, elige “Otro”.
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {BUSINESS_TYPES.map(type => {
                const isSelected = selectedType === type;
                const isOther = type === BUSINESS_TYPE_OTHER;
                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      s.typeOption,
                      isSelected && s.typeOptionSelected,
                      isOther && s.typeOptionOther,
                    ]}
                    onPress={() => {
                      setSelectedType(type);
                      setShowTypePicker(false);
                      // Si selecciona algo que no es 'Otro', limpiamos el customType
                      if (type !== BUSINESS_TYPE_OTHER) setCustomType('');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.typeOptionText, isSelected && s.typeOptionTextSelected]}>{type}</Text>
                    {isSelected && <MaterialIcons name="check" size={20} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  skipBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  skipText: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },

  progressContainer: { paddingHorizontal: 24, marginBottom: 16 },
  progressBarBg: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  progressText: { fontSize: 11, color: '#94A3B8', marginTop: 6, fontWeight: '600' },

  scroll: { padding: 24, paddingBottom: 40 },
  stepIconWrap: { alignItems: 'center', marginBottom: 20 },
  stepIconCircle: { width: 80, height: 80, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  stepTitle: { fontSize: 24, fontWeight: '800', color: '#0F172A', textAlign: 'center', marginBottom: 8, letterSpacing: -0.5 },
  stepDesc: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: 28, paddingHorizontal: 8 },

  label: { fontSize: 12, fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  input: { backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 16, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 16 },
  row2: { flexDirection: 'row', gap: 12 },

  // Botón picker (reemplaza el typeGrid de chips)
  pickerButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 8 },
  pickerButtonText: { flex: 1, fontSize: 16, color: '#0F172A', fontWeight: '500' },
  pickerButtonPlaceholder: { color: '#94A3B8', fontWeight: '400' },

  // Input de texto libre cuando es 'Otro'
  customInputWrap: { backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginTop: 4, marginBottom: 12, borderWidth: 1, borderColor: '#FDE68A' },
  customInputLabel: { fontSize: 12, fontWeight: '700', color: '#92400E', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  customInputHint: { fontSize: 11, color: '#A16207', marginTop: -8, marginBottom: 4, textAlign: 'right' },

  daysRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, gap: 6 },
  dayChip: { flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#fff' },
  dayChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipText: { fontSize: 16, fontWeight: '800', color: '#94A3B8' },
  dayChipTextActive: { color: '#fff' },
  dayChipSubText: { fontSize: 9, color: '#CBD5E1', marginTop: 2, fontWeight: '600' },
  dayChipSubTextActive: { color: '#D1FAE5' },

  tipBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12, marginTop: 8, borderWidth: 1, borderColor: '#FDE68A' },
  tipText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },

  linkBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  linkText: { flex: 1, fontSize: 14, color: '#0F172A', fontWeight: '600' },
  copyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, marginBottom: 24 },
  copyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  linkLoadingBox: { padding: 24, alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, marginBottom: 24, gap: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  linkLoadingText: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 18 },

  shareTitle: { fontSize: 12, fontWeight: '800', color: '#475569', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12, marginTop: 8 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  shareIconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  shareText: { fontSize: 14, color: '#334155', fontWeight: '500' },

  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#fff' },
  backBtn: { width: 48, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff' },
  nextBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 14, height: 52 },
  nextBtnDisabled: { backgroundColor: '#9CA3AF' },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Modal selector
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerContainer: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', paddingBottom: 32 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 },
  pickerTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  pickerCloseBtn: { padding: 4 },
  pickerSubtitle: { paddingHorizontal: 24, paddingBottom: 16, fontSize: 13, color: '#64748B', lineHeight: 18 },
  typeOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  typeOptionSelected: { backgroundColor: '#ECFDF5' },
  typeOptionOther: { borderTopWidth: 4, borderTopColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  typeOptionText: { fontSize: 16, color: '#0F172A', fontWeight: '500' },
  typeOptionTextSelected: { color: colors.primary, fontWeight: '700' },
});
