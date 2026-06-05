import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, Image, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { useAuth } from '@/contexts/AuthContext';
import { apiPut } from '@/utils/api';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_OTHER,
  isCustomBusinessType,
  validateCustomBusinessType,
} from '@/constants/businessTypes';
import { MEXICO_STATES, isValidPostalCode } from '@/constants/mexicoStates';
import { supabase } from '@/lib/supabase';

// ════════════════════════════════════════════════════════════════════════
// app/settings/business.tsx — Información del negocio
//
// ⚡ FIX CRITICO (May 23 2026 - v2):
// Antonio reporto que despues de completar el wizard de onboarding, los
// datos de ubicacion (estado, ciudad, CP, calle) NO aparecian al abrir
// Ajustes -> Mi Negocio, aunque en BD si se habian guardado correctamente.
//
// CAUSA: el form leia los datos UNICAMENTE del context `businessProfile`.
// Si el context estaba stale (datos cacheados al login, antes del wizard),
// el form se mostraba vacio aunque BD tuviera los valores correctos.
//
// SOLUCION: cargar directamente de BD al montar el componente, NO depender
// exclusivamente del context. Asi el form SIEMPRE muestra la fuente de
// verdad (BD), independientemente del estado del context.
//
// Esto es defensa en profundidad: el context se sigue refrescando al
// terminar el wizard, PERO el form ya no depende de eso para funcionar.
//
// ⚡ FIX LOGO (Jun 2026):
// Usuarios en Android/iOS no podian actualizar el logo. Dos problemas:
//   1) La subida usaba fetch(uri).blob() + FileReader.readAsDataURL(), patron
//      inestable en RN. Ahora se lee con expo-file-system (readAsStringAsync
//      base64), metodo confiable y oficial para Supabase Storage en Expo.
//   2) (CAUSA RAIZ) El logo solo se persistia al tocar "Guardar cambios" y que
//      el formulario completo pasara validacion. El archivo subia al bucket
//      pero business_profiles.logo_url NO se actualizaba, por eso "subia pero
//      el logo nunca cambiaba". Ahora el logo se PERSISTE de inmediato al
//      elegir la foto (update directo a business_profiles.logo_url + refresh
//      del context), sin depender del boton Guardar ni del resto del form.
//   3) LIMPIEZA: al subir un logo nuevo se borran los anteriores del usuario
//      en el bucket, para no acumular basura. Best-effort (no rompe la subida).
//
// ⚡ FIX LOGO MIUI/Xiaomi (Jun 2026 - v2):
// Una clienta con POCO C40 (MIUI 13) podia ELEGIR la foto pero nunca le
// aparecia el boton "Usar" ni los controles de recorte, por lo que el proceso
// no concluia. CAUSA: allowsEditing:true en Android invoca la actividad de
// recorte del sistema, que en MIUI/POCO (y otras capas OEM) se renderiza rota.
// SOLUCION: allowsEditing solo en iOS (donde el recorte nativo funciona bien).
// En Android se omite el recorte y la foto elegida se usa directo. El logo se
// muestra siempre con resizeMode "cover" en un contenedor circular, asi que
// una imagen no cuadrada se ve bien igual. Esto garantiza que el flujo concluya
// en CUALQUIER Android, sin depender del recortador del fabricante.
// ════════════════════════════════════════════════════════════════════════

export default function BusinessSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { businessProfile, refreshBusinessProfile } = useAuth();
  const [saving, setSaving]                         = useState(false);
  const [loading, setLoading]                       = useState(true);
  const [showTypePicker, setShowTypePicker]         = useState(false);
  const [showStatePicker, setShowStatePicker]       = useState(false);
  const [uploadingLogo, setUploadingLogo]           = useState(false);
  const [errorModal, setErrorModal]                 = useState({ visible: false, message: '' });
  const [successModal, setSuccessModal]             = useState(false);

  // Campos de identidad del negocio
  const [businessName, setBusinessName] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [customType, setCustomType]     = useState('');
  const [logoUrl, setLogoUrl]           = useState('');
  const [phone, setPhone]               = useState('');
  const [alternativePhone, setAlternativePhone] = useState('');

  // Campos de ubicación
  const [state, setState]             = useState('');
  const [city, setCity]               = useState('');
  const [postalCode, setPostalCode]   = useState('');
  const [street, setStreet]           = useState('');

  const safeBottom = Math.max(insets.bottom, 16);

  // ⚡ FIX v2: cargar datos directamente de BD al montar.
  // Esto garantiza que el form SIEMPRE muestra la fuente de verdad,
  // independientemente del estado del context. Cubre el caso donde el
  // usuario completa el wizard de onboarding y abre este form pero el
  // context todavia no se ha refrescado.
  useEffect(() => {
    let cancelled = false;

    async function loadFreshFromDB() {
      try {
        const { data: { user }, error: userErr } = await supabase.auth.getUser();
        if (userErr || !user) {
          if (!cancelled) setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('business_profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          console.error('[BusinessSettings] Error cargando perfil:', error);
          setLoading(false);
          return;
        }

        if (data) {
          // Aplicar los valores de BD al state local
          setBusinessName(data.business_name || '');

          const currentType = data.business_type || '';
          if (currentType && isCustomBusinessType(currentType)) {
            setSelectedType(BUSINESS_TYPE_OTHER);
            setCustomType(currentType);
          } else {
            setSelectedType(currentType);
            setCustomType('');
          }

          setPhone(data.phone || '');
          setAlternativePhone(data.alternative_phone || '');
          setLogoUrl(data.logo_url || '');

          // Campos de ubicación
          setState(data.state || '');
          setCity(data.city || '');
          setPostalCode(data.postal_code || '');
          setStreet(data.street || data.address || '');
        }

        // Re-sincronizar context para que otras pantallas vean los datos frescos
        try {
          if (refreshBusinessProfile) await refreshBusinessProfile();
        } catch {}

        setLoading(false);
      } catch (e) {
        console.error('[BusinessSettings] Excepcion cargando perfil:', e);
        if (!cancelled) setLoading(false);
      }
    }

    loadFreshFromDB();

    return () => { cancelled = true; };
    // Solo se ejecuta una vez al montar. Si el usuario cambia de cuenta,
    // el componente se desmonta y vuelve a montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fallback: si el context tiene datos y los del state local estan vacios,
  // usarlos como respaldo (caso raro pero defensivo).
  useEffect(() => {
    if (!businessProfile) return;
    if (!businessName && businessProfile.businessName) setBusinessName(businessProfile.businessName);
    if (!phone && businessProfile.phone) setPhone(businessProfile.phone);
    if (!state && (businessProfile as any).state) setState((businessProfile as any).state);
    if (!city && (businessProfile as any).city) setCity((businessProfile as any).city);
    if (!postalCode && (businessProfile as any).postalCode) setPostalCode((businessProfile as any).postalCode);
    if (!street && (businessProfile as any).street) setStreet((businessProfile as any).street);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessProfile?.id, (businessProfile as any)?.state]);

  const handlePickLogo = async () => {
    // Pedir permiso explicito de galeria (en Android es necesario; si no se
    // concede, expo lo maneja, pero damos un mensaje claro por si acaso).
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setErrorModal({ visible: true, message: 'Necesitamos permiso para acceder a tus fotos y poder seleccionar el logo. Actívalo desde los ajustes de tu teléfono.' });
        return;
      }
    } catch {}

    // ⚡ FIX MIUI: allowsEditing SOLO en iOS. En Android el recorte del sistema
    // se rompe en MIUI/POCO (no aparece "Usar"), dejando al usuario atascado.
    // Sin recorte, la foto se usa directo y el contenedor circular la recorta
    // visualmente con resizeMode "cover".
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: Platform.OS === 'ios',
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets && result.assets[0]) {
      await uploadLogo(result.assets[0].uri);
    }
  };

  const uploadLogo = async (uri: string) => {
    setUploadingLogo(true);
    try {
      const { getCurrentUserId } = await import('@/utils/api');
      const userId = await getCurrentUserId();

      // Leer el archivo local como base64 de forma CONFIABLE en React Native.
      // (fetch(uri).blob() + FileReader.readAsDataURL es inestable en Expo.)
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      if (!base64) throw new Error('No se pudo leer la imagen seleccionada.');

      // base64 -> bytes (atob disponible en el runtime de RN/Hermes)
      const binary = atob(base64);
      const arr = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
      if (arr.length === 0) throw new Error('La imagen seleccionada esta vacia.');

      const fileName = `${userId}/logo_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(fileName, arr, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      // ⚡ CAUSA RAIZ DEL BUG: persistir el logo INMEDIATAMENTE en la BD.
      // Antes el logo solo se guardaba al tocar "Guardar cambios" (y si el form
      // completo pasaba validacion). El archivo subia al bucket pero logo_url
      // nunca se actualizaba -> "subia pero el logo nunca cambiaba". Ahora se
      // guarda al instante, sin depender del boton Guardar ni del resto del form.
      const { error: updateError } = await supabase
        .from('business_profiles')
        .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (updateError) throw updateError;

      setLogoUrl(publicUrl);

      // LIMPIEZA: borrar los logos anteriores del usuario para no acumular basura
      // en el Storage. Solo se conserva el recien subido. Es best-effort: si falla
      // (p.ej. por RLS) NO rompe la actualizacion del logo (que ya quedo guardada
      // arriba). public_business_profiles es una VIEW de business_profiles, asi que
      // ningun otro registro referencia los archivos viejos: borrarlos es seguro.
      try {
        const keepName = fileName.split('/').pop();
        const { data: files } = await supabase.storage.from('logos').list(userId, { limit: 100 });
        if (files && files.length) {
          const toRemove = files
            .filter((f) => f.name !== keepName && f.name !== '.emptyFolderPlaceholder')
            .map((f) => `${userId}/${f.name}`);
          if (toRemove.length) {
            await supabase.storage.from('logos').remove(toRemove);
          }
        }
      } catch (cleanupErr) {
        console.warn('[BusinessSettings] No se pudieron limpiar logos anteriores:', cleanupErr);
      }

      // Refrescar el context para que Inicio y otras pantallas vean el nuevo logo.
      try { if (refreshBusinessProfile) await refreshBusinessProfile(); } catch {}
    } catch (e: any) {
      console.error('[BusinessSettings] Error subiendo logo:', e);
      setErrorModal({
        visible: true,
        message: e?.message ? `No se pudo subir el logo: ${e.message}` : 'No se pudo subir el logo. Intenta de nuevo.',
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  const getEffectiveBusinessType = (): string => {
    if (selectedType === BUSINESS_TYPE_OTHER) {
      return customType.trim();
    }
    return selectedType;
  };

  const handleSave = async () => {
    // ─── Validaciones obligatorias ───
    if (!businessName.trim()) {
      setErrorModal({ visible: true, message: 'El nombre del negocio es requerido' });
      return;
    }
    if (!selectedType) {
      setErrorModal({ visible: true, message: 'El tipo de negocio es requerido' });
      return;
    }
    if (selectedType === BUSINESS_TYPE_OTHER) {
      const v = validateCustomBusinessType(customType);
      if (!v.valid) {
        setErrorModal({ visible: true, message: v.error || 'Escribe tu tipo de negocio' });
        return;
      }
    }
    if (!phone.trim()) {
      setErrorModal({ visible: true, message: 'El teléfono del negocio es requerido para contacto y verificación' });
      return;
    }
    if (!state) {
      setErrorModal({ visible: true, message: 'Selecciona el estado donde se ubica tu negocio' });
      return;
    }
    if (!city.trim()) {
      setErrorModal({ visible: true, message: 'Captura el municipio o ciudad de tu negocio' });
      return;
    }
    if (!isValidPostalCode(postalCode)) {
      setErrorModal({ visible: true, message: 'El código postal debe tener 5 dígitos numéricos' });
      return;
    }
    if (!street.trim()) {
      setErrorModal({ visible: true, message: 'Captura la calle y número de tu local' });
      return;
    }

    setSaving(true);
    try {
      await apiPut('/api/business-profile', {
        businessName:      businessName.trim(),
        businessType:      getEffectiveBusinessType(),
        phone:             phone.trim(),
        alternativePhone:  alternativePhone.trim() || undefined,
        logoUrl:           logoUrl || undefined,
        state:             state,
        city:              city.trim(),
        postalCode:        postalCode.trim(),
        street:            street.trim(),
        address: `${street.trim()}, ${city.trim()}, ${state}, C.P. ${postalCode.trim()}`,
      });
      await refreshBusinessProfile();
      setSuccessModal(true);
    } catch (error: any) {
      setErrorModal({ visible: true, message: error?.message || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  const pickerDisplayText = () => {
    if (!selectedType) return 'Seleccionar tipo';
    if (selectedType === BUSINESS_TYPE_OTHER) {
      return customType.trim() ? `Otro: ${customType.trim()}` : 'Otro (especifica)';
    }
    return selectedType;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol android_material_icon_name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Mi Negocio</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Cargando tu información...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ConfirmModal visible={errorModal.visible} title="Falta información" message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'cancel' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })} />
      <ConfirmModal visible={successModal} title="¡Guardado!" message="La información de tu negocio se actualizó correctamente."
        buttons={[{ text: 'Aceptar', onPress: () => { setSuccessModal(false); router.back(); }, style: 'default' }]}
        onDismiss={() => { setSuccessModal(false); router.back(); }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Mi Negocio</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: safeBottom }]}>
        {/* ─── Sección de identidad del negocio ─── */}
        <View style={styles.logoSection}>
          <Text style={styles.fieldLabel}>Logo del negocio</Text>
          <TouchableOpacity style={styles.logoContainer} onPress={handlePickLogo} disabled={uploadingLogo}>
            {logoUrl
              ? <Image source={{ uri: logoUrl }} style={styles.logoImage} />
              : <View style={styles.logoPlaceholder}><IconSymbol android_material_icon_name="store" size={40} color={colors.textSecondary} /></View>
            }
            {uploadingLogo && (
              <View style={styles.logoOverlay}><ActivityIndicator color="#FFFFFF" /></View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.changeLogoButton} onPress={handlePickLogo} disabled={uploadingLogo}>
            <Text style={styles.changeLogoText}>{uploadingLogo ? 'Subiendo...' : 'Cambiar logo'}</Text>
          </TouchableOpacity>
          <Text style={styles.fieldHint}>Se guarda automáticamente al elegir la foto.</Text>
        </View>

        <Text style={styles.fieldLabel}>Nombre del negocio *</Text>
        <TextInput style={styles.input} value={businessName} onChangeText={setBusinessName} placeholder="Nombre de tu negocio" placeholderTextColor={colors.textSecondary} />

        <Text style={styles.fieldLabel}>Tipo de negocio *</Text>
        <TouchableOpacity style={styles.pickerButton} onPress={() => setShowTypePicker(true)}>
          <Text style={[styles.pickerText, !selectedType && styles.pickerPlaceholder]} numberOfLines={1}>
            {pickerDisplayText()}
          </Text>
          <IconSymbol android_material_icon_name="arrow-drop-down" size={24} color={colors.textSecondary} />
        </TouchableOpacity>

        {selectedType === BUSINESS_TYPE_OTHER && (
          <View style={styles.customInputWrap}>
            <Text style={styles.customInputLabel}>Especifica tu tipo de negocio o especialidad *</Text>
            <TextInput
              style={styles.input}
              value={customType}
              onChangeText={setCustomType}
              placeholder="Ej. Especialista Parasitólogo, Acupunturista..."
              placeholderTextColor={colors.textSecondary}
              maxLength={50}
              autoCapitalize="words"
            />
            <Text style={styles.customInputHint}>{customType.length}/50 caracteres</Text>
          </View>
        )}

        {/* ─── Sección de contacto ─── */}
        <View style={styles.sectionDivider}>
          <Text style={styles.sectionLabel}>📞 CONTACTO</Text>
        </View>

        <Text style={styles.fieldLabel}>Teléfono del negocio *</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="+52 55 1234 5678" placeholderTextColor={colors.textSecondary} keyboardType="phone-pad" />
        <Text style={styles.fieldHint}>Este teléfono se mostrará a tus clientes en el link público de citas.</Text>

        <Text style={styles.fieldLabel}>Teléfono alternativo (opcional)</Text>
        <TextInput style={styles.input} value={alternativePhone} onChangeText={setAlternativePhone} placeholder="+52 55 8765 4321" placeholderTextColor={colors.textSecondary} keyboardType="phone-pad" />

        {/* ─── Sección de ubicación ─── */}
        <View style={styles.sectionDivider}>
          <Text style={styles.sectionLabel}>📍 UBICACIÓN</Text>
        </View>

        <Text style={styles.fieldLabel}>Estado *</Text>
        <TouchableOpacity style={styles.pickerButton} onPress={() => setShowStatePicker(true)}>
          <Text style={[styles.pickerText, !state && styles.pickerPlaceholder]} numberOfLines={1}>
            {state || 'Seleccionar estado'}
          </Text>
          <IconSymbol android_material_icon_name="arrow-drop-down" size={24} color={colors.textSecondary} />
        </TouchableOpacity>

        <Text style={styles.fieldLabel}>Municipio / Ciudad *</Text>
        <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="Ej. Santiago de Querétaro" placeholderTextColor={colors.textSecondary} autoCapitalize="words" />

        <Text style={styles.fieldLabel}>Código postal *</Text>
        <TextInput
          style={styles.input}
          value={postalCode}
          onChangeText={(v) => setPostalCode(v.replace(/[^0-9]/g, '').slice(0, 5))}
          placeholder="76000"
          placeholderTextColor={colors.textSecondary}
          keyboardType="numeric"
          maxLength={5}
        />

        <Text style={styles.fieldLabel}>Calle y número *</Text>
        <TextInput style={styles.input} value={street} onChangeText={setStreet} placeholder="Av. Ejemplo 1234, Col. Centro" placeholderTextColor={colors.textSecondary} />
        <Text style={styles.fieldHint}>Incluye colonia y referencias si lo deseas.</Text>

        <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Guardar cambios</Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* ─── Modal selector de tipo de negocio ─── */}
      <Modal visible={showTypePicker} animationType="slide" transparent onRequestClose={() => setShowTypePicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Tipo de negocio</Text>
              <TouchableOpacity onPress={() => setShowTypePicker(false)}>
                <IconSymbol android_material_icon_name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.pickerSubtitle}>
              Selecciona el que mejor describe tu negocio. Si no aparece, elige "Otro".
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {BUSINESS_TYPES.map(type => {
                const isSelected = selectedType === type;
                const isOther = type === BUSINESS_TYPE_OTHER;
                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeOption,
                      isSelected && styles.typeOptionSelected,
                      isOther && styles.typeOptionOther,
                    ]}
                    onPress={() => {
                      setSelectedType(type);
                      setShowTypePicker(false);
                      if (type !== BUSINESS_TYPE_OTHER) setCustomType('');
                    }}
                  >
                    <Text style={[styles.typeText, isSelected && styles.typeTextSelected]}>{type}</Text>
                    {isSelected && <IconSymbol android_material_icon_name="check" size={20} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── Modal selector de estado de México ─── */}
      <Modal visible={showStatePicker} animationType="slide" transparent onRequestClose={() => setShowStatePicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Estado de la República</Text>
              <TouchableOpacity onPress={() => setShowStatePicker(false)}>
                <IconSymbol android_material_icon_name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.pickerSubtitle}>
              Selecciona el estado donde se ubica tu negocio.
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {MEXICO_STATES.map(st => {
                const isSelected = state === st.name;
                return (
                  <TouchableOpacity
                    key={st.iso}
                    style={[styles.typeOption, isSelected && styles.typeOptionSelected]}
                    onPress={() => {
                      setState(st.name);
                      if (!city.trim()) setCity(st.capital);
                      setShowStatePicker(false);
                    }}
                  >
                    <Text style={[styles.typeText, isSelected && styles.typeTextSelected]}>{st.name}</Text>
                    {isSelected && <IconSymbol android_material_icon_name="check" size={20} color={colors.primary} />}
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

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: colors.background },
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingVertical: 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton:         { padding: 4 },
  title:              { fontSize: 20, fontWeight: 'bold', color: colors.text },
  placeholder:        { width: 32 },
  loadingContainer:   { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText:        { fontSize: 14, color: colors.textSecondary },
  scrollContent:      { padding: 20 },
  logoSection:        { alignItems: 'center', marginBottom: 24 },
  logoContainer:      { width: 120, height: 120, borderRadius: 60, overflow: 'hidden', marginBottom: 12 },
  logoImage:          { width: '100%', height: '100%' },
  logoPlaceholder:    { width: '100%', height: '100%', backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed' },
  logoOverlay:        { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  changeLogoButton:   { paddingVertical: 8, paddingHorizontal: 16 },
  changeLogoText:     { fontSize: 14, color: colors.primary, fontWeight: '600' },
  fieldLabel:         { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8, marginTop: 16 },
  fieldHint:          { fontSize: 12, color: colors.textSecondary, marginTop: 6, marginLeft: 4 },
  input:              { backgroundColor: colors.card, borderRadius: 12, padding: 14, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border },
  pickerButton:       { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerText:         { flex: 1, fontSize: 16, color: colors.text },
  pickerPlaceholder:  { color: colors.textSecondary },
  customInputWrap:    { backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginTop: 8, borderWidth: 1, borderColor: '#FDE68A' },
  customInputLabel:   { fontSize: 12, fontWeight: '700', color: '#92400E', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  customInputHint:    { fontSize: 11, color: '#A16207', marginTop: 4, textAlign: 'right' },
  sectionDivider:     { marginTop: 28, marginBottom: 4, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  sectionLabel:       { fontSize: 12, fontWeight: '800', color: colors.primary, letterSpacing: 1.2 },
  saveButton:         { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 32 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText:     { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
  modalOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerContainer:    { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', paddingBottom: 32 },
  pickerHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 8 },
  pickerTitle:        { fontSize: 20, fontWeight: 'bold', color: colors.text },
  pickerSubtitle:     { paddingHorizontal: 20, paddingBottom: 16, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  typeOption:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderTopWidth: 1, borderTopColor: colors.border },
  typeOptionSelected: { backgroundColor: '#ECFDF5' },
  typeOptionOther:    { borderTopWidth: 4, borderTopColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  typeText:           { fontSize: 16, color: colors.text, fontWeight: '500' },
  typeTextSelected:   { color: colors.primary, fontWeight: '700' },
});
