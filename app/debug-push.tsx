import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

// ══════════════════════════════════════════════════════════════════════
// /debug-push — Pantalla de diagnóstico para push notifications.
//
// PROPÓSITO:
// Cuando las push notifications no funcionan, los hooks fallan silenciosamente
// en producción (logger.warn se silencia por SEC-003). Esta pantalla ejecuta
// los mismos pasos que usePushToken.ts pero MUESTRA los resultados en pantalla,
// no en logs, permitiendo diagnosticar el problema en cualquier dispositivo.
//
// USO:
// Navegar a /debug-push desde el navegador in-app de Expo Router.
// El usuario debe estar logueado para que aparezca el user.id.
//
// QUÉ MUESTRA:
// 1. Si el dispositivo es real (Device.isDevice)
// 2. Si la plataforma es Android/iOS
// 3. El estado actual del permiso de notificaciones
// 4. El projectId que se está usando para getExpoPushTokenAsync
// 5. Si se generó el token correctamente (y cuál es)
// 6. Si se guardó en la BD (y cuántos tokens hay para el user actual)
// 7. Botón para reintentar todo el flujo manualmente
// ══════════════════════════════════════════════════════════════════════

type StepStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped';

interface DebugStep {
  name: string;
  status: StepStatus;
  result?: string;
  error?: string;
}

export default function DebugPushScreen() {
  const { user } = useAuth();
  const [steps, setSteps] = useState<DebugStep[]>([]);
  const [running, setRunning] = useState(false);
  const [tokensInDb, setTokensInDb] = useState<any[]>([]);

  const updateStep = (index: number, patch: Partial<DebugStep>) => {
    setSteps(prev => prev.map((s, i) => i === index ? { ...s, ...patch } : s));
  };

  const checkDbTokens = async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from('notification_tokens')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (!error && data) setTokensInDb(data);
  };

  useEffect(() => {
    checkDbTokens();
  }, [user?.id]);

  async function runDiagnostic() {
    if (!user?.id) {
      Alert.alert('Sin sesión', 'Necesitas estar logueado para correr el diagnóstico');
      return;
    }

    setRunning(true);
    const newSteps: DebugStep[] = [
      { name: '1. Verificar dispositivo real', status: 'pending' },
      { name: '2. Detectar plataforma', status: 'pending' },
      { name: '3. Crear canal Android (si aplica)', status: 'pending' },
      { name: '4. Verificar permiso existente', status: 'pending' },
      { name: '5. Solicitar permiso si falta', status: 'pending' },
      { name: '6. Leer projectId desde Constants', status: 'pending' },
      { name: '7. Obtener Expo Push Token', status: 'pending' },
      { name: '8. Guardar token en Supabase', status: 'pending' },
      { name: '9. Verificar token en BD', status: 'pending' },
    ];
    setSteps(newSteps);

    try {
      // STEP 1: Device.isDevice
      updateStep(0, { status: 'running' });
      const isReal = Device.isDevice;
      updateStep(0, {
        status: isReal ? 'success' : 'error',
        result: `Device.isDevice = ${isReal}`,
        error: isReal ? undefined : 'No es dispositivo físico (emulador?). expo-device puede no estar instalado.',
      });
      if (!isReal) { setRunning(false); return; }

      // STEP 2: Platform
      updateStep(1, { status: 'running' });
      const platformOS = Platform.OS;
      updateStep(1, {
        status: 'success',
        result: `Platform.OS = ${platformOS}, Version: ${Platform.Version}`,
      });

      // STEP 3: Crear canal Android
      updateStep(2, { status: 'running' });
      if (platformOS === 'android') {
        try {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Notificaciones VYLTA',
            description: 'Recordatorios de citas y avisos importantes',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#10B981',
            sound: 'default',
            enableVibrate: true,
            enableLights: true,
            showBadge: true,
          });
          updateStep(2, { status: 'success', result: 'Canal "default" creado/actualizado OK' });
        } catch (e: any) {
          updateStep(2, { status: 'error', error: String(e?.message || e) });
          setRunning(false);
          return;
        }
      } else {
        updateStep(2, { status: 'skipped', result: 'No es Android' });
      }

      // STEP 4: Verificar permiso existente
      updateStep(3, { status: 'running' });
      const existingPerm = await Notifications.getPermissionsAsync();
      updateStep(3, {
        status: 'success',
        result: `status: ${existingPerm.status}, canAskAgain: ${existingPerm.canAskAgain}, granted: ${existingPerm.granted}`,
      });

      // STEP 5: Solicitar permiso si falta
      updateStep(4, { status: 'running' });
      let finalPerm = existingPerm;
      if (existingPerm.status !== 'granted') {
        if (!existingPerm.canAskAgain) {
          updateStep(4, {
            status: 'error',
            error: 'canAskAgain=false. El usuario ya rechazó permiso. Hay que ir manualmente a Settings de Android.',
          });
          setRunning(false);
          return;
        }
        finalPerm = await Notifications.requestPermissionsAsync();
        updateStep(4, {
          status: finalPerm.status === 'granted' ? 'success' : 'error',
          result: `Nuevo status tras request: ${finalPerm.status}`,
          error: finalPerm.status !== 'granted' ? `Permiso NO concedido (${finalPerm.status})` : undefined,
        });
      } else {
        updateStep(4, { status: 'skipped', result: 'Permiso ya concedido' });
      }
      if (finalPerm.status !== 'granted') { setRunning(false); return; }

      // STEP 6: Leer projectId
      updateStep(5, { status: 'running' });
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        (Constants as any)?.easConfig?.projectId;
      updateStep(5, {
        status: projectId ? 'success' : 'error',
        result: projectId ? `projectId = ${projectId}` : undefined,
        error: projectId ? undefined : 'No se encontró projectId. Falla crítica.',
      });
      if (!projectId) { setRunning(false); return; }

      // STEP 7: Obtener Expo Push Token
      updateStep(6, { status: 'running' });
      let token = '';
      try {
        const result = await Notifications.getExpoPushTokenAsync({ projectId });
        token = result.data;
        updateStep(6, { status: 'success', result: token });
      } catch (e: any) {
        updateStep(6, {
          status: 'error',
          error: `Tipo: ${e?.name || 'Error'} | Mensaje: ${String(e?.message || e)} | Code: ${e?.code || 'none'}`,
        });
        setRunning(false);
        return;
      }

      // STEP 8: Guardar en Supabase
      updateStep(7, { status: 'running' });
      const platformForDb = platformOS === 'ios' ? 'ios' : 'android';
      const { error: upsertError, data: upsertData } = await supabase
        .from('notification_tokens')
        .upsert(
          {
            user_id: user.id,
            expo_push_token: token,
            platform: platformForDb,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,expo_push_token',
            ignoreDuplicates: false,
          }
        )
        .select();
      if (upsertError) {
        updateStep(7, {
          status: 'error',
          error: `Code: ${upsertError.code} | Message: ${upsertError.message} | Details: ${upsertError.details || 'n/a'} | Hint: ${upsertError.hint || 'n/a'}`,
        });
        setRunning(false);
        return;
      }
      updateStep(7, {
        status: 'success',
        result: `Upsert OK. Rows: ${upsertData?.length || 0}`,
      });

      // STEP 9: Releer de BD
      updateStep(8, { status: 'running' });
      const { data: dbCheck, error: dbCheckError } = await supabase
        .from('notification_tokens')
        .select('*')
        .eq('user_id', user.id);
      if (dbCheckError) {
        updateStep(8, { status: 'error', error: dbCheckError.message });
      } else {
        const myToken = dbCheck?.find(t => t.expo_push_token === token);
        updateStep(8, {
          status: myToken ? 'success' : 'error',
          result: `Tokens del usuario en BD: ${dbCheck?.length || 0}. Plataformas: ${dbCheck?.map(t => t.platform).join(', ')}`,
          error: myToken ? undefined : 'El token no se ve en BD aunque el upsert dijo OK. Probable RLS bloqueando.',
        });
        setTokensInDb(dbCheck || []);
      }
    } catch (e: any) {
      Alert.alert('Error inesperado', String(e?.message || e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Debug Push' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.heading}>⚠️ Diagnóstico de Push Notifications</Text>
        <Text style={styles.subtext}>Pantalla temporal para diagnosticar por qué las push no funcionan en Android.</Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>Usuario actual:</Text>
          <Text style={styles.infoValue}>{user?.email || 'NO logueado'}</Text>
          <Text style={styles.infoLabel}>User ID:</Text>
          <Text style={styles.infoValue}>{user?.id || 'n/a'}</Text>
          <Text style={styles.infoLabel}>Plataforma:</Text>
          <Text style={styles.infoValue}>{Platform.OS} {Platform.Version}</Text>
          <Text style={styles.infoLabel}>Tokens en BD ahora:</Text>
          <Text style={styles.infoValue}>
            {tokensInDb.length === 0
              ? '0 (vacío)'
              : tokensInDb.map(t => `${t.platform}: ${t.expo_push_token.substring(0, 30)}...`).join('\n')}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.button, running && styles.buttonDisabled]}
          onPress={runDiagnostic}
          disabled={running}
        >
          <Text style={styles.buttonText}>
            {running ? 'Ejecutando...' : '▶️ Ejecutar diagnóstico paso a paso'}
          </Text>
        </TouchableOpacity>

        {steps.length > 0 && (
          <View style={styles.stepsContainer}>
            <Text style={styles.stepsTitle}>Resultados:</Text>
            {steps.map((step, i) => (
              <View key={i} style={[styles.step, getStepStyle(step.status)]}>
                <Text style={styles.stepName}>
                  {getStepIcon(step.status)} {step.name}
                </Text>
                {step.result && <Text style={styles.stepResult}>➜ {step.result}</Text>}
                {step.error && <Text style={styles.stepError}>⚠️ {step.error}</Text>}
              </View>
            ))}
          </View>
        )}

        <Text style={styles.note}>
          💡 Tip: si el paso 7 (Obtener Expo Push Token) falla con un error tipo "DEVICE_NOT_REGISTERED" o "FCM_NOT_CONFIGURED", significa que falta configuración en EAS/Firebase. Si el paso 8 falla, es RLS de Supabase. Si todos pasan pero la BD sigue vacía al reabrir, hay un problema de Realtime/cache.
        </Text>
      </ScrollView>
    </>
  );
}

function getStepIcon(status: StepStatus): string {
  switch (status) {
    case 'success': return '✅';
    case 'error': return '❌';
    case 'running': return '⏳';
    case 'skipped': return '⏭️';
    default: return '⚪️';
  }
}

function getStepStyle(status: StepStatus) {
  switch (status) {
    case 'success': return styles.stepSuccess;
    case 'error': return styles.stepError_;
    case 'running': return styles.stepRunning;
    case 'skipped': return styles.stepSkipped;
    default: return null;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 48 },
  heading: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  subtext: { fontSize: 13, color: '#64748B', marginBottom: 16 },
  infoBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  infoLabel: { fontSize: 11, color: '#64748B', fontWeight: '600', marginTop: 8, textTransform: 'uppercase' },
  infoValue: { fontSize: 13, color: '#0F172A', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  button: {
    backgroundColor: '#10B981',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  stepsContainer: { marginTop: 8 },
  stepsTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  step: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 6,
    borderLeftWidth: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  stepSuccess: { borderLeftColor: '#10B981' },
  stepError_: { borderLeftColor: '#EF4444' },
  stepRunning: { borderLeftColor: '#F59E0B' },
  stepSkipped: { borderLeftColor: '#94A3B8' },
  stepName: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  stepResult: {
    fontSize: 11,
    color: '#10B981',
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  stepError: {
    fontSize: 11,
    color: '#EF4444',
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  note: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 16,
    padding: 12,
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCD34D',
    lineHeight: 16,
  },
});
