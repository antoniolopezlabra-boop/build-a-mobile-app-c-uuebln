
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Eye, EyeOff } from 'lucide-react-native';
import { colors } from '@/styles/commonStyles';
import { ConfirmModal } from '@/components/button';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/utils/logger';

export default function LoginScreen() {
  const router = useRouter();
  const { login, authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // ⚡ FIX UX (May 19 2026): toggle para mostrar/ocultar contraseña.
  // Usuarios reportaron que no podían ver si escribían mal su password.
  // Patrón estándar: ojito al lado derecho del input. Por defecto oculto.
  const [showPassword, setShowPassword] = useState(false);
  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });

  const showError = (message: string) => {
    setErrorModal({ visible: true, message });
  };

  const handleLogin = async () => {
    logger.log('User tapped Login button');

    if (!email || !password) {
      showError('Por favor completa todos los campos');
      return;
    }

    logger.log('Submitting login:', { email });

    try {
      await login(email, password);
      logger.log('[Login] Login successful, navigating to home with reset');
      await AsyncStorage.setItem('has_seen_onboarding', 'true');
      
      // Use router.replace to clear navigation stack
      // This prevents going back to auth screens
      router.replace('/');
    } catch (error: any) {
      // logger.error siempre imprime (incluso en producción) — pero como
      // está envuelto en logger, en el futuro Sentry lo capturará automático.
      logger.error('Login failed:', error);
      const message = error?.message?.includes('401') || error?.message?.includes('Invalid')
        ? 'Correo o contraseña incorrectos'
        : error?.message || 'Error al iniciar sesión. Intenta de nuevo.';
      showError(message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
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
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.logo}>VYLTA</Text>
          <Text style={styles.tagline}>Cada cliente regresa</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>Iniciar sesión</Text>

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
              editable={!authLoading}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Contraseña</Text>
            {/* ⚡ FIX UX (May 19 2026): TextInput envuelto en wrapper con
                ícono Eye/EyeOff al lado derecho. paddingRight extra al
                input asegura que el texto no quede tapado por el ícono. */}
            <View style={styles.passwordWrapper}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder="Tu contraseña"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry={!showPassword}
                editable={!authLoading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(s => !s)}
                disabled={authLoading}
                // hitSlop genera un área de toque mayor que el ícono visible.
                // Sin esto, el botón se sentiría "duro de presionar" porque
                // los íconos de 20px son blanco fácil de fallar.
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                accessibilityRole="button"
              >
                {showPassword ? (
                  <EyeOff size={20} color={colors.textSecondary} />
                ) : (
                  <Eye size={20} color={colors.textSecondary} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.forgotButton}
            onPress={() => {
              logger.log('User tapped forgot password link');
              router.push('/auth/forgot-password');
            }}
            disabled={authLoading}
          >
            <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, authLoading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={authLoading}
          >
            {authLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.loadingText}>Iniciando sesión...</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>Iniciar sesión</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => {
              logger.log('User tapped register link');
              router.push('/auth/register');
            }}
            disabled={authLoading}
          >
            <Text style={styles.linkText}>¿No tienes cuenta? Regístrate</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
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
    maxHeight: 440,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 24,
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
  // ⚡ FIX UX (May 19 2026): estilos para el toggle de mostrar/ocultar contraseña.
  passwordWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    // paddingRight extra para que el texto del password no quede tapado
    // por el ícono del ojito (16 base + 32 espacio del ícono = 48).
    paddingRight: 48,
  },
  eyeButton: {
    position: 'absolute',
    right: 14,
    height: 28,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginTop: -8,
    marginBottom: 16,
    padding: 4,
  },
  forgotText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
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
  linkButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color: colors.primary,
    fontSize: 16,
  },
});
