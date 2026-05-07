
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '@/styles/commonStyles';
import { ConfirmModal } from '@/components/button';
import { supabase } from '@/services/supabase';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });

  const showError = (message: string) => {
    setErrorModal({ visible: true, message });
  };

  const handleSubmit = async () => {
    console.log('User tapped Send reset link button');

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      showError('Por favor escribe tu correo electrónico');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      showError('Por favor escribe un correo válido');
      return;
    }

    setLoading(true);

    try {
      // Use Supabase's built-in reset password flow
      // Redirects to the web reset page hosted on book.vylta.lat
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: 'https://book.vylta.lat/reset.html',
      });

      if (error) {
        console.error('[ForgotPassword] Supabase error:', error);
        // For security: don't reveal if the email exists or not.
        // Still show the success state, even if there was an error
        // (rate limit, invalid format, etc., we still treat it as "sent").
      }

      console.log('[ForgotPassword] Reset email sent (or attempted) for:', trimmedEmail);
      setSent(true);
    } catch (err: any) {
      console.error('[ForgotPassword] Unexpected error:', err);
      // Same security policy: always show success
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  // Success state — confirmation screen
  if (sent) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.successContent}>
          <View style={styles.successIconWrap}>
            <MaterialIcons name="mark-email-read" size={56} color={colors.primary} />
          </View>

          <Text style={styles.successTitle}>Revisa tu correo</Text>

          <Text style={styles.successDesc}>
            Si <Text style={styles.successEmail}>{email.trim().toLowerCase()}</Text> está
            registrado en VYLTA, recibirás un correo con un link para restablecer tu contraseña en
            unos minutos.
          </Text>

          <View style={styles.tipBox}>
            <MaterialIcons name="info-outline" size={18} color={colors.primary} />
            <Text style={styles.tipText}>
              ¿No lo ves? Revisa la carpeta de spam o correo no deseado. El link expira en 1 hora.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => {
              console.log('User tapped Back to login from success screen');
              router.replace('/auth/login');
            }}
          >
            <Text style={styles.primaryButtonText}>Volver al inicio de sesión</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              console.log('User tapped Try another email');
              setSent(false);
              setEmail('');
            }}
          >
            <Text style={styles.secondaryButtonText}>Usar otro correo</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Form state — request reset
  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ConfirmModal
        visible={errorModal.visible}
        title="Atención"
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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              console.log('User tapped back button on forgot password');
              router.back();
            }}
            disabled={loading}
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <MaterialIcons name="lock-reset" size={40} color={colors.primary} />
            </View>
            <Text style={styles.title}>Restablecer contraseña</Text>
            <Text style={styles.subtitle}>
              Escribe el correo con el que te registraste y te enviaremos un link para crear una
              contraseña nueva.
            </Text>
          </View>

          <View style={styles.form}>
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
                autoCorrect={false}
                editable={!loading}
                returnKeyType="send"
                onSubmitEditing={handleSubmit}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.loadingText}>Enviando...</Text>
                </View>
              ) : (
                <Text style={styles.buttonText}>Enviar link de recuperación</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => {
                console.log('User tapped back to login link');
                router.replace('/auth/login');
              }}
              disabled={loading}
            >
              <Text style={styles.linkText}>Volver al inicio de sesión</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  header: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  form: {
    marginTop: 8,
  },
  inputContainer: {
    marginBottom: 24,
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
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 20,
    alignItems: 'center',
    padding: 8,
  },
  linkText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '500',
  },
  // Success state
  successContent: {
    flex: 1,
    padding: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 32,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  successTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  successDesc: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  successEmail: {
    color: colors.text,
    fontWeight: '600',
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  primaryButton: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    width: '100%',
    padding: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '500',
  },
});
