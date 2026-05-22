import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '@/contexts/ThemeContext';

// ══════════════════════════════════════════════════════════════════════
// /settings/test-push — Probar notificaciones manualmente
//
// PROPÓSITO:
// Después de muchos intentos fallidos de generar el token Android
// automáticamente, esta pantalla permite al usuario disparar el flujo
// completo de registro de push tokens manualmente. Cada paso se muestra
// en pantalla con estado claro (verde si pasó, rojo si falló, gris si
// está pendiente), de forma que cualquier fallo es VISIBLE inmediatamente.
//
// VENTAJA SOBRE EL HOOK AUTOMÁTICO:
//   • Sin race conditions: cuando el usuario pulsa el botón, ya tiene
//     sesión estable
//   • Sin silent failures: errores se muestran en pantalla, no en logs
//   • Sin esperas: feedback inmediato del estado del sistema
//   • Sin dependencia del NotificationBridge ni de hooks de Auth
//
// USO:
//   Settings → SOPORTE → "🔔 Probar notificaciones"
// ══════════════════════════════════════════════════════════════════════

type StepStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped';

interface Step {
  label: string;
  status: StepStatus;
  detail?: string;
}

const INITIAL_STEPS: Step[] = [
  { label: 'Verificar dispositivo real', status: 'pending' },
  { label: 'Configurar canal Android', status: 'pending' },
  { label: 'Verificar permisos actuales', status: 'pending' },
  { label: 'Solicitar permisos al usuario', status: 'pending' },
  { label: 'Leer projectId de la app', status: 'pending' },
  { label: 'Obtener Expo Push Token', status: 'pending' },
  { label: 'Verificar sesión de Supabase', status: 'pending' },
  { label: 'Guardar token en la base de datos', status: 'pending' },
  { label: 'Confirmar token guardado', status: 'pending' },
];

export default function TestPushScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors: tc } = useTheme();
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [running, setRunning] = useState(false);
  const [finalToken, setFinalToken] = useState<string | null>(null);
  const [tokensInDb, setTokensInDb] = useState<any[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(true);

  useEffect(() => {
    loadTokens();
  }, [user?.id]);

  async function loadTokens() {
    if (!user?.id) {
      setLoadingTokens(false);
      return;
    }
    setLoadingTokens(true);
    try {
      const { data, error } = await supabase
        .from('notification_tokens')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      if (!error && data) setTokensInDb(data);
    } catch (e) {
      console.error('Error loading tokens:', e);
    } finally {
      setLoadingTokens(false);
    }
  }

  function updateStep(index: number, status: StepStatus, detail?: string) {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, status, detail } : s))
    );
  }

  async function runTest() {
    if (!user?.id) {
      Alert.alert('Sin sesión', 'Necesitas iniciar sesión primero');
      return;
    }

    setRunning(true);
    setFinalToken(null);
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: 'pending' as StepStatus, detail: undefined })));

    // ──── Paso 1: Verificar dispositivo ────
    updateStep(0, 'running');
    await sleep(300);
    const isReal = Device.isDevice;
    if (!isReal) {
      updateStep(0, 'error', 'No es un dispositivo físico (emulador). Las notificaciones no funcionan en emuladores.');
      setRunning(false);
      return;
    }
    updateStep(0, 'success', `Dispositivo OK — ${Platform.OS} ${Platform.Version}`);

    // ──── Paso 2: Configurar canal Android ────
    updateStep(1, 'running');
    await sleep(300);
    if (Platform.OS === 'android') {
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
        updateStep(1, 'success', 'Canal "default" creado correctamente');
      } catch (e: any) {
        updateStep(1, 'error', `Error creando canal: ${e?.message || e}`);
        // No abortamos, seguimos
      }
    } else {
      updateStep(1, 'skipped', 'No aplica en iOS');
    }

    // ──── Paso 3: Verificar permisos ────
    updateStep(2, 'running');
    await sleep(300);
    let permStatus: string;
    let canAskAgain: boolean;
    try {
      const result = await Notifications.getPermissionsAsync();
      permStatus = result.status;
      canAskAgain = result.canAskAgain;
      updateStep(2, 'success', `Estado: ${permStatus} (puede preguntar de nuevo: ${canAskAgain ? 'Sí' : 'No'})`);
    } catch (e: any) {
      updateStep(2, 'error', `Error: ${e?.message || e}`);
      setRunning(false);
      return;
    }

    // ──── Paso 4: Pedir permisos si falta ────
    updateStep(3, 'running');
    await sleep(300);
    if (permStatus !== 'granted') {
      if (!canAskAgain) {
        updateStep(3, 'error', 'Permisos denegados. Ve a Ajustes del cel → Apps → VYLTA → Notificaciones para activarlos.');
        setRunning(false);
        return;
      }
      try {
        const result = await Notifications.requestPermissionsAsync();
        if (result.status !== 'granted') {
          updateStep(3, 'error', `Usuario rechazó permisos. Estado final: ${result.status}`);
          setRunning(false);
          return;
        }
        permStatus = result.status;
        updateStep(3, 'success', `Permisos concedidos: ${result.status}`);
      } catch (e: any) {
        updateStep(3, 'error', `Error solicitando permisos: ${e?.message || e}`);
        setRunning(false);
        return;
      }
    } else {
      updateStep(3, 'skipped', 'Permisos ya estaban concedidos');
    }

    // ──── Paso 5: Leer projectId ────
    updateStep(4, 'running');
    await sleep(300);
    const projectId =
      (Constants as any)?.expoConfig?.extra?.eas?.projectId ??
      (Constants as any)?.easConfig?.projectId;
    if (!projectId) {
      updateStep(4, 'error', 'No se encontró projectId en la configuración de la app');
      setRunning(false);
      return;
    }
    updateStep(4, 'success', `projectId: ${projectId}`);

    // ──── Paso 6: Obtener Expo Push Token ────
    updateStep(5, 'running');
    await sleep(300);
    let token: string;
    try {
      const result = await Notifications.getExpoPushTokenAsync({ projectId });
      token = result.data;
      updateStep(5, 'success', `Token obtenido: ${token.substring(0, 45)}...`);
      setFinalToken(token);
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      const errorCode = e?.code || 'unknown';
      updateStep(
        5,
        'error',
        `❌ FALLÓ AQUÍ — código: ${errorCode}\nmensaje: ${errorMsg}\n\nEsto suele significar que FCM (Firebase) no está configurado correctamente en EAS, o que el package name no coincide.`
      );
      setRunning(false);
      return;
    }

    // ──── Paso 7: Verificar sesión Supabase ────
    updateStep(6, 'running');
    await sleep(300);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        updateStep(6, 'error', 'No hay sesión activa de Supabase. Cierra sesión e inicia sesión de nuevo.');
        setRunning(false);
        return;
      }
      if (session.user.id !== user.id) {
        updateStep(6, 'error', `Sesión no coincide con usuario actual. session: ${session.user.id}, user: ${user.id}`);
        setRunning(false);
        return;
      }
      updateStep(6, 'success', `Sesión válida para ${session.user.email}`);
    } catch (e: any) {
      updateStep(6, 'error', `Error: ${e?.message || e}`);
      setRunning(false);
      return;
    }

    // ──── Paso 8: Guardar en Supabase ────
    updateStep(7, 'running');
    await sleep(300);
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    try {
      const { error, data } = await supabase
        .from('notification_tokens')
        .upsert(
          {
            user_id: user.id,
            expo_push_token: token,
            platform,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,expo_push_token',
            ignoreDuplicates: false,
          }
        )
        .select();

      if (error) {
        updateStep(
          7,
          'error',
          `Error de BD:\ncódigo: ${error.code}\nmensaje: ${error.message}\ndetalles: ${error.details || 'ninguno'}\nhint: ${error.hint || 'ninguno'}`
        );
        setRunning(false);
        return;
      }
      updateStep(7, 'success', `Token guardado. Filas afectadas: ${data?.length || 0}`);
    } catch (e: any) {
      updateStep(7, 'error', `Excepción: ${e?.message || e}`);
      setRunning(false);
      return;
    }

    // ──── Paso 9: Confirmar en BD ────
    updateStep(8, 'running');
    await sleep(500);
    try {
      const { data, error } = await supabase
        .from('notification_tokens')
        .select('*')
        .eq('user_id', user.id)
        .eq('expo_push_token', token);

      if (error) {
        updateStep(8, 'error', `No se pudo leer de la BD: ${error.message}`);
        setRunning(false);
        return;
      }
      if (!data || data.length === 0) {
        updateStep(
          8,
          'error',
          'El upsert dijo OK pero no encuentro el token al releer. Probable: RLS bloqueando el SELECT después del INSERT.'
        );
        setRunning(false);
        return;
      }
      updateStep(8, 'success', `✅ Confirmado en BD. Plataforma: ${data[0].platform}`);
      setTokensInDb(data);
    } catch (e: any) {
      updateStep(8, 'error', `Excepción: ${e?.message || e}`);
    }

    setRunning(false);
    await loadTokens();
  }

  async function sendTestPush() {
    if (!finalToken) {
      Alert.alert('Sin token', 'Primero registra el token con el botón de arriba');
      return;
    }
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: finalToken,
          sound: 'default',
          title: '🔔 VYLTA Funciona',
          body: '¡Las notificaciones están activas! Te avisaremos de tus citas.',
        }),
      });
      const result = await response.json();
      if (result?.data?.status === 'ok') {
        Alert.alert(
          '✅ Push enviado',
          'Debe llegarte la notificación en segundos. Si la app está abierta, la verás en pantalla; si está cerrada, te llegará en el shade de notificaciones.'
        );
      } else {
        Alert.alert('❌ Error de Expo', JSON.stringify(result, null, 2));
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || String(e));
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Probar notificaciones',
          headerBackTitle: 'Atrás',
        }}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: tc.surface, shadowColor: tc.shadow }]}>
          <View style={styles.heroIconBox}>
            <MaterialIcons name="notifications-active" size={32} color="#10B981" />
          </View>
          <Text style={[styles.heroTitle, { color: tc.text }]}>Diagnóstico de notificaciones</Text>
          <Text style={[styles.heroDesc, { color: tc.textMuted }]}>
            Si las notificaciones no te están llegando, pulsa el botón de abajo para registrarlas manualmente y diagnosticar cualquier problema.
          </Text>
        </View>

        {/* Info usuario */}
        <View style={[styles.infoCard, { backgroundColor: tc.surface, shadowColor: tc.shadow }]}>
          <Text style={[styles.infoLabel, { color: tc.textMuted }]}>USUARIO</Text>
          <Text style={[styles.infoValue, { color: tc.text }]}>{user?.email || 'No autenticado'}</Text>

          <Text style={[styles.infoLabel, { color: tc.textMuted, marginTop: 12 }]}>PLATAFORMA</Text>
          <Text style={[styles.infoValue, { color: tc.text }]}>{Platform.OS} · v{Platform.Version}</Text>

          <Text style={[styles.infoLabel, { color: tc.textMuted, marginTop: 12 }]}>TOKENS GUARDADOS EN BD</Text>
          {loadingTokens ? (
            <ActivityIndicator size="small" color={tc.text} />
          ) : tokensInDb.length === 0 ? (
            <Text style={[styles.infoValue, { color: '#EF4444' }]}>❌ Ninguno (vacío)</Text>
          ) : (
            tokensInDb.map((t, i) => (
              <Text key={i} style={[styles.infoValue, { color: '#10B981', fontSize: 12 }]}>
                ✅ {t.platform}: {t.expo_push_token.substring(0, 35)}...
              </Text>
            ))
          )}
        </View>

        {/* Botón principal */}
        <TouchableOpacity
          style={[styles.runButton, running && styles.runButtonDisabled]}
          onPress={runTest}
          disabled={running}
          activeOpacity={0.85}
        >
          {running ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialIcons name="play-arrow" size={24} color="#fff" />
              <Text style={styles.runButtonText}>Registrar mis notificaciones ahora</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Pasos */}
        <View style={styles.stepsBox}>
          <Text style={[styles.stepsTitle, { color: tc.textMuted }]}>RESULTADO PASO A PASO</Text>
          {steps.map((step, i) => (
            <StepRow key={i} number={i + 1} step={step} tc={tc} />
          ))}
        </View>

        {/* Botón de prueba de push */}
        {finalToken && (
          <TouchableOpacity
            style={styles.testPushButton}
            onPress={sendTestPush}
            activeOpacity={0.85}
          >
            <MaterialIcons name="send" size={20} color="#10B981" />
            <Text style={styles.testPushButtonText}>Enviarme una notificación de prueba</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StepRow({ number, step, tc }: { number: number; step: Step; tc: any }) {
  const color =
    step.status === 'success' ? '#10B981' :
    step.status === 'error' ? '#EF4444' :
    step.status === 'running' ? '#F59E0B' :
    step.status === 'skipped' ? '#94A3B8' :
    '#CBD5E1';
  const icon =
    step.status === 'success' ? 'check-circle' :
    step.status === 'error' ? 'error' :
    step.status === 'running' ? 'sync' :
    step.status === 'skipped' ? 'skip-next' :
    'radio-button-unchecked';
  return (
    <View style={[styles.stepRow, { backgroundColor: tc.surface, borderLeftColor: color }]}>
      <View style={styles.stepRowHeader}>
        <View style={[styles.stepNumber, { backgroundColor: color }]}>
          <Text style={styles.stepNumberText}>{number}</Text>
        </View>
        <Text style={[styles.stepLabel, { color: tc.text }]}>{step.label}</Text>
        <MaterialIcons name={icon as any} size={20} color={color} />
      </View>
      {step.detail && (
        <Text style={[styles.stepDetail, { color: step.status === 'error' ? '#EF4444' : tc.textMuted }]}>
          {step.detail}
        </Text>
      )}
    </View>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16 },
  hero: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  heroIconBox: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  heroTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  heroDesc: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  infoCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  infoLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 4 },
  infoValue: { fontSize: 14, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  runButton: {
    backgroundColor: '#10B981',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
    shadowColor: '#10B981',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  runButtonDisabled: { opacity: 0.6 },
  runButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  stepsBox: { marginBottom: 24 },
  stepsTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 10 },
  stepRow: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderLeftWidth: 4,
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  stepRowHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  stepLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  stepDetail: {
    fontSize: 11,
    marginTop: 6,
    marginLeft: 32,
    lineHeight: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  testPushButton: {
    backgroundColor: '#ECFDF5',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  testPushButtonText: { color: '#10B981', fontSize: 14, fontWeight: '700' },
});
