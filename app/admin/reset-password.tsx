import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { businessName } = useLocalSearchParams();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleReset = async () => {
    if (!email.trim()) { setError('Ingresa el correo del usuario'); return; }
    setLoading(true);
    setError('');
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: 'vylta://reset-password',
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Error al enviar el correo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🔑 Restablecer contraseña</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.content}>
        {sent ? (
          <View style={styles.successCard}>
            <Text style={styles.successIcon}>✅</Text>
            <Text style={styles.successTitle}>¡Correo enviado!</Text>
            <Text style={styles.successText}>Se envió el link de recuperación a {email}</Text>
            <TouchableOpacity style={styles.btn} onPress={() => { setSent(false); setEmail(''); }}>
              <Text style={styles.btnText}>Enviar a otro usuario</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => router.back()}>
              <Text style={[styles.btnText, { color: '#94A3B8' }]}>Volver</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.label}>Correo del usuario</Text>
            <TextInput
              style={styles.input}
              placeholder="correo@ejemplo.com"
              placeholderTextColor="#475569"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={styles.hint}>Se enviará un link de recuperación al correo del usuario. El link expira en 1 hora.</Text>
            <TouchableOpacity style={styles.btn} onPress={handleReset} disabled={loading}>
              {loading ? <ActivityIndicator color="#0F172A" /> : <Text style={styles.btnText}>Enviar link de recuperación</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  back: { color: '#94A3B8', fontSize: 15, width: 60 },
  title: { fontSize: 18, fontWeight: '700', color: '#F8FAFC' },
  content: { flex: 1, padding: 24 },
  form: { gap: 12 },
  label: { fontSize: 15, fontWeight: '600', color: '#94A3B8' },
  input: { backgroundColor: '#1E293B', borderRadius: 12, padding: 14, color: '#F8FAFC', fontSize: 15 },
  error: { color: '#EF4444', fontSize: 13 },
  hint: { fontSize: 13, color: '#475569', lineHeight: 18 },
  btn: { backgroundColor: '#F59E0B', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  btnSecondary: { backgroundColor: '#1E293B' },
  btnText: { color: '#0F172A', fontWeight: '700', fontSize: 15 },
  successCard: { alignItems: 'center', gap: 16, marginTop: 40 },
  successIcon: { fontSize: 64 },
  successTitle: { fontSize: 24, fontWeight: '800', color: '#10B981' },
  successText: { fontSize: 15, color: '#94A3B8', textAlign: 'center' },
});
