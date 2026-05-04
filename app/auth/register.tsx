import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '@/styles/commonStyles';
import { ConfirmModal } from '@/components/button';
import { useAuth } from '@/contexts/AuthContext';

// ═════════════════════════════════════════════════════════════════
// REGISTER — Pantalla de creación de cuenta (ULTRA simplificada)
//
// FLUJO DE ONBOARDING (May 2026 — limpieza UX):
//   1. Aquí: solo 3 campos mínimos (nombre, email, password) → 30 seg
//   2. Setup wizard (4 pasos guiados): negocio, servicios, horarios, link
//
// Por qué NO pedir aquí nombre/tipo de negocio:
//   - Pedirlo aquí Y otra vez en el wizard era redundante (mala UX)
//   - Reducir fricción en el momento más crítico (registro)
//   - El wizard tiene contexto visual (iconos, progress, animaciones)
//   - Patrón estándar de SaaS modernos (Slack, Notion, Calendly)
// ═════════════════════════════════════════════════════════════════

export default function RegisterScreen() {
  const router = useRouter();
  const { register, authLoading } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });

  const showError = (message: string) => {
    setErrorModal({ visible: true, message });
  };

  const handleRegister = async () => {
    console.log('User tapped Register button');

    if (!name.trim() || !email.trim() || !password) {
      showError('Por favor completa todos los campos');
      return;
    }

    if (password.length < 6) {
      showError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    // Validación mínima de email (debe tener @)
    if (!email.includes('@') || !email.includes('.')) {
      showError('Ingresa un correo electrónico válido');
      return;
    }

    console.log('Submitting registration:', { name, email });

    try {
      const result: any = await register({
        email: email.trim().toLowerCase(),
        password,
        name: name.trim(),
      });
      console.log('[Register] Registration successful, redirecting to setup wizard');

      // IMPORTANTE: el setup wizard se encarga de capturar nombre y tipo del negocio
      // (Paso 1 del wizard). Aquí solo creamos la cuenta.
      const newUserId = result?.user?.id;
      if (newUserId) {
        // Borrar cualquier flag stale para garantizar que el wizard aparezca
        await AsyncStorage.removeItem(`setup_completed_${newUserId}`);
      }

      router.replace('/setup');
    } catch (error: any) {
      console.error('Registration failed:', error);
      const message = error?.message?.includes('already exists') || error?.message?.includes('409')
        ? 'Ya existe una cuenta con este correo electrónico'
        : error?.message || 'Error al registrarse. Intenta de nuevo.';
      showError(message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.logo}>VYLTA</Text>
            <Text style={styles.tagline}>Cada cliente regresa</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.title}>Crear cuenta</Text>
            <Text style={styles.subtitle}>
              Empecemos con lo básico. Configurarás tu negocio en el siguiente paso.
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Tu nombre</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Ej. María López"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="words"
                autoComplete="name"
                editable={!authLoading}
                maxLength={60}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Correo electrónico</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="tu@email.com"
                placeholderTextColor={colors.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                editable={!authLoading}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Contraseña</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry
                autoComplete="new-password"
                editable={!authLoading}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, authLoading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={authLoading}
            >
              {authLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.loadingText}>Creando cuenta...</Text>
                </View>
              ) : (
                <Text style={styles.buttonText}>Continuar</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.disclaimer}>
              Al continuar aceptas nuestros{' '}
              <Text style={styles.disclaimerLink}>Términos</Text> y{' '}
              <Text style={styles.disclaimerLink}>Aviso de Privacidad</Text>.
            </Text>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => {
                console.log('User tapped login link');
                router.push('/auth/login');
              }}
              disabled={authLoading}
            >
              <Text style={styles.linkText}>¿Ya tienes cuenta? Inicia sesión</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={errorModal.visible}
        title="Error"
        message={errorModal.message}
        buttons={[
          {
            text: 'Aceptar',
            onPress: () => setErrorModal({ visible: false, message: '' }),
            style: 'cancel',
          },
        ]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 40,
  },
  logo: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  form: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 28,
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  disclaimerLink: {
    color: colors.primary,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    color: colors.primary,
    fontSize: 16,
  },
});
