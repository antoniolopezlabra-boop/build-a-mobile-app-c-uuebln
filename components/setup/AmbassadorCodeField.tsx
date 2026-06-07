import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/styles/commonStyles';
import { logger } from '@/utils/logger';

// ══════════════════════════════════════════════════
// AmbassadorCodeField — campo opcional de codigo de embajador (onboarding).
//
// Autocontenido: valida el codigo en vivo (RPC validar_codigo_embajador) y lo
// aplica al negocio del usuario actual (RPC aplicar_codigo_embajador). El enlace
// es set-once + anti-autorreferido en el backend; este componente solo lo dispara
// con un boton explicito "Aplicar" para que el usuario confirme al embajador
// correcto antes de quedar enlazado. Si falla, no bloquea el onboarding.
//
// Requiere que el row de business_profiles ya exista (lo crea auth-callback al
// registrarse, y el Paso 1 del wizard lo asegura). Se renderiza en el Paso 1.
// ══════════════════════════════════════════════════

type Status = 'idle' | 'checking' | 'found' | 'notfound' | 'applied' | 'error';

export default function AmbassadorCodeField() {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [nombre, setNombre] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [applying, setApplying] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onChange = (v: string) => {
    const c = v.toUpperCase().replace(/\s/g, '');
    setCode(c);
    setNombre('');
    setErrorMsg('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!c) {
      setStatus('idle');
      return;
    }
    setStatus('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('validar_codigo_embajador', { p_code: c });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (row?.valido) {
          setNombre(row.embajador_nombre);
          setStatus('found');
        } else {
          setStatus('notfound');
        }
      } catch (e: any) {
        logger.warn('[Onboarding] validar codigo embajador:', e?.message ?? e);
        setStatus('notfound');
      }
    }, 600);
  };

  const aplicar = async () => {
    if (!code || status !== 'found' || applying) return;
    setApplying(true);
    setErrorMsg('');
    try {
      const { data, error } = await supabase.rpc('aplicar_codigo_embajador', { p_code: code });
      if (error) throw error;
      if (data?.ok) {
        setNombre(data.embajador_nombre ?? nombre);
        setStatus('applied');
      } else {
        setErrorMsg(data?.error ?? 'No se pudo aplicar el código.');
        setStatus('error');
      }
    } catch (e: any) {
      logger.warn('[Onboarding] aplicar codigo embajador:', e?.message ?? e);
      setErrorMsg('No se pudo aplicar el código. Intenta de nuevo.');
      setStatus('error');
    } finally {
      setApplying(false);
    }
  };

  // Estado final: ya quedo enlazado.
  if (status === 'applied') {
    return (
      <View style={st.appliedBox}>
        <MaterialIcons name="verified" size={20} color={colors.primary} />
        <Text style={st.appliedText}>
          Te refirió: <Text style={st.appliedName}>{nombre}</Text>
        </Text>
      </View>
    );
  }

  return (
    <View style={st.wrap}>
      <Text style={st.label}>Código de embajador (opcional)</Text>
      <View style={st.row}>
        <TextInput
          style={st.input}
          placeholder="Ej. KAREN10"
          placeholderTextColor="#94A3B8"
          value={code}
          onChangeText={onChange}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={20}
        />
        <TouchableOpacity
          style={[st.applyBtn, status !== 'found' && st.applyBtnDisabled]}
          onPress={aplicar}
          disabled={status !== 'found' || applying}
          activeOpacity={0.85}
        >
          {applying ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={st.applyBtnText}>Aplicar</Text>
          )}
        </TouchableOpacity>
      </View>

      {status === 'checking' && <Text style={st.hint}>Validando código...</Text>}

      {status === 'found' && (
        <View style={st.foundRow}>
          <MaterialIcons name="check-circle" size={15} color={colors.primary} />
          <Text style={st.foundText}>Te refirió: {nombre} — toca “Aplicar” para confirmar.</Text>
        </View>
      )}

      {status === 'notfound' && (
        <Text style={st.hintWarn}>No encontramos ese código. Puedes dejarlo vacío.</Text>
      )}

      {status === 'error' && <Text style={st.hintWarn}>{errorMsg}</Text>}

      {(status === 'idle' || status === 'checking') && (
        <Text style={st.subHint}>
          Si alguien de VYLTA te invitó, escribe su código. Si no, déjalo vacío y continúa.
        </Text>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { marginTop: 4 },
  label: { fontSize: 12, fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  input: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 16, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0' },
  applyBtn: { paddingHorizontal: 18, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', minWidth: 92 },
  applyBtnDisabled: { backgroundColor: '#CBD5E1' },
  applyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  hint: { fontSize: 12, color: '#64748B', marginTop: 8, marginLeft: 4 },
  subHint: { fontSize: 12, color: '#64748B', marginTop: 8, marginLeft: 4, lineHeight: 17 },
  hintWarn: { fontSize: 12, color: '#B45309', marginTop: 8, marginLeft: 4 },
  foundRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginLeft: 2 },
  foundText: { flex: 1, fontSize: 12, color: '#047857', fontWeight: '600' },
  appliedBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ECFDF5', borderRadius: 12, padding: 14, marginTop: 4, borderWidth: 1, borderColor: '#A7F3D0' },
  appliedText: { fontSize: 14, color: '#065F46', fontWeight: '600' },
  appliedName: { fontWeight: '800', color: '#047857' },
});
