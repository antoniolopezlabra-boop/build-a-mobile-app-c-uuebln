
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Switch,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { apiGet, apiPut, apiPost } from '@/utils/api';

interface WhatsAppConfig {
  apiKey?: string;
  phoneNumber?: string;
  isConnected: boolean;
  reminder24h: boolean;
  reminder2h: boolean;
  confirmationOnBooking: boolean;
  waitlistNotification: boolean;
}

export default function WhatsAppSettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });
  const [successModal, setSuccessModal] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    console.log('[WhatsAppSettings] Loading config');
    setLoading(true);
    try {
      const data = await apiGet<WhatsAppConfig | null>('/api/whatsapp-config');
      if (data) {
        setConfig(data);
        setApiKey(data.apiKey || '');
        setPhoneNumber(data.phoneNumber || '');
        console.log('[WhatsAppSettings] Config loaded');
      } else {
        // No config yet - use defaults
        setConfig({
          isConnected: false,
          reminder24h: false,
          reminder2h: false,
          confirmationOnBooking: false,
          waitlistNotification: false,
        });
        console.log('[WhatsAppSettings] No config found, using defaults');
      }
    } catch (error) {
      console.error('[WhatsAppSettings] Failed to load config:', error);
      setConfig({
        isConnected: false,
        reminder24h: false,
        reminder2h: false,
        confirmationOnBooking: false,
        waitlistNotification: false,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyConnection = async () => {
    if (!apiKey.trim() || !phoneNumber.trim()) {
      setErrorModal({
        visible: true,
        message: 'Por favor ingresa tu API Key y número de WhatsApp',
      });
      return;
    }

    setVerifying(true);
    try {
      console.log('[WhatsAppSettings] Verifying connection');
      const result = await apiPost<{ success: boolean; message: string }>(
        '/api/whatsapp-config/verify',
        {
          apiKey: apiKey.trim(),
          phoneNumber: phoneNumber.trim(),
        }
      );

      if (result.success) {
        await saveConfig(true);
        setSuccessModal({
          visible: true,
          message: '¡Conexión exitosa! WhatsApp Business está configurado.',
        });
      } else {
        setErrorModal({ visible: true, message: result.message });
      }
    } catch (error: any) {
      console.error('[WhatsAppSettings] Verification failed:', error);
      setErrorModal({
        visible: true,
        message: error?.message || 'Error al verificar la conexión',
      });
    } finally {
      setVerifying(false);
    }
  };

  const saveConfig = async (isConnected?: boolean) => {
    setSaving(true);
    try {
      console.log('[WhatsAppSettings] Saving config');
      const updatedConfig = await apiPut<WhatsAppConfig>('/api/whatsapp-config', {
        apiKey: apiKey.trim() || undefined,
        phoneNumber: phoneNumber.trim() || undefined,
        isConnected: isConnected !== undefined ? isConnected : config?.isConnected,
        reminder24h: config?.reminder24h,
        reminder2h: config?.reminder2h,
        confirmationOnBooking: config?.confirmationOnBooking,
        waitlistNotification: config?.waitlistNotification,
      });
      setConfig(updatedConfig);
      console.log('[WhatsAppSettings] Config saved');
    } catch (error: any) {
      console.error('[WhatsAppSettings] Failed to save config:', error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const updateAutomation = async (field: keyof WhatsAppConfig, value: boolean) => {
    if (!config) return;

    const updatedConfig = { ...config, [field]: value };
    setConfig(updatedConfig);

    try {
      await apiPut('/api/whatsapp-config', {
        [field]: value,
      });
      console.log('[WhatsAppSettings] Automation updated:', field, value);
    } catch (error) {
      console.error('[WhatsAppSettings] Failed to update automation:', error);
      setConfig(config);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const isConnected = config?.isConnected || false;

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

      <ConfirmModal
        visible={successModal.visible}
        title="¡Éxito!"
        message={successModal.message}
        buttons={[
          {
            text: 'Aceptar',
            onPress: () => setSuccessModal({ visible: false, message: '' }),
            style: 'default',
          },
        ]}
        onDismiss={() => setSuccessModal({ visible: false, message: '' })}
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>WhatsApp Business</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Step 1 */}
        <View style={styles.stepCard}>
          <View style={styles.stepHeader}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <Text style={styles.stepTitle}>Crea tu cuenta en 360dialog</Text>
          </View>
          <Text style={styles.stepDescription}>
            360dialog es el proveedor oficial de WhatsApp Business API. Necesitas crear una cuenta
            para poder enviar mensajes automatizados.
          </Text>
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => {
              console.log('User tapped 360dialog link');
              Linking.openURL('https://www.360dialog.com');
            }}
          >
            <Text style={styles.linkButtonText}>Ir a 360dialog</Text>
            <IconSymbol
              android_material_icon_name="open-in-new"
              size={16}
              color={colors.primary}
            />
          </TouchableOpacity>
        </View>

        {/* Step 2 */}
        <View style={styles.stepCard}>
          <View style={styles.stepHeader}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <Text style={styles.stepTitle}>Registra tu número</Text>
          </View>
          <Text style={styles.stepDescription}>
            Sigue las instrucciones de 360dialog para registrar tu número de WhatsApp Business.
            Este proceso incluye verificación de tu número.
          </Text>
          <View style={styles.iconRow}>
            <IconSymbol android_material_icon_name="phone" size={32} color={colors.primary} />
            <IconSymbol
              android_material_icon_name="arrow-forward"
              size={24}
              color={colors.textSecondary}
            />
            <IconSymbol
              android_material_icon_name="verified"
              size={32}
              color={colors.primary}
            />
          </View>
        </View>

        {/* Step 3 */}
        <View style={styles.stepCard}>
          <View style={styles.stepHeader}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <Text style={styles.stepTitle}>Obtén tu API Key</Text>
          </View>
          <Text style={styles.stepDescription}>
            Una vez registrado, 360dialog te proporcionará una API Key. Ingrésala aquí junto con tu
            número de WhatsApp.
          </Text>

          <Text style={styles.fieldLabel}>API Key</Text>
          <TextInput
            style={styles.input}
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="Ingresa tu API Key de 360dialog"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            secureTextEntry
          />

          <Text style={styles.fieldLabel}>Número de WhatsApp</Text>
          <TextInput
            style={styles.input}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="+52 55 1234 5678"
            placeholderTextColor={colors.textSecondary}
            keyboardType="phone-pad"
          />
        </View>

        {/* Step 4 */}
        <View style={styles.stepCard}>
          <View style={styles.stepHeader}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>4</Text>
            </View>
            <Text style={styles.stepTitle}>¡Listo!</Text>
          </View>
          <Text style={styles.stepDescription}>
            Verifica tu conexión para comenzar a enviar mensajes automatizados a tus clientes.
          </Text>

          {isConnected ? (
            <View style={styles.connectedCard}>
              <IconSymbol
                android_material_icon_name="check-circle"
                size={48}
                color={colors.primary}
              />
              <Text style={styles.connectedText}>Conexión exitosa</Text>
              <Text style={styles.connectedSubtext}>WhatsApp Business está configurado</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.verifyButton, verifying && styles.verifyButtonDisabled]}
              onPress={handleVerifyConnection}
              disabled={verifying}
            >
              {verifying ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <IconSymbol android_material_icon_name="check" size={20} color="#FFFFFF" />
                  <Text style={styles.verifyButtonText}>Verificar conexión</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Automation settings */}
        {isConnected && (
          <View style={styles.automationSection}>
            <Text style={styles.sectionTitle}>AUTOMATIZACIÓN DE MENSAJES</Text>

            <View style={styles.automationItem}>
              <View style={styles.automationLeft}>
                <IconSymbol
                  android_material_icon_name="schedule"
                  size={24}
                  color={colors.text}
                />
                <View style={styles.automationText}>
                  <Text style={styles.automationTitle}>Recordatorio 24 horas</Text>
                  <Text style={styles.automationSubtitle}>
                    Enviar recordatorio 1 día antes de la cita
                  </Text>
                </View>
              </View>
              <Switch
                value={config?.reminder24h || false}
                onValueChange={(value) => updateAutomation('reminder24h', value)}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.automationItem}>
              <View style={styles.automationLeft}>
                <IconSymbol
                  android_material_icon_name="schedule"
                  size={24}
                  color={colors.text}
                />
                <View style={styles.automationText}>
                  <Text style={styles.automationTitle}>Recordatorio 2 horas</Text>
                  <Text style={styles.automationSubtitle}>
                    Enviar recordatorio 2 horas antes de la cita
                  </Text>
                </View>
              </View>
              <Switch
                value={config?.reminder2h || false}
                onValueChange={(value) => updateAutomation('reminder2h', value)}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.automationItem}>
              <View style={styles.automationLeft}>
                <IconSymbol
                  android_material_icon_name="check-circle"
                  size={24}
                  color={colors.text}
                />
                <View style={styles.automationText}>
                  <Text style={styles.automationTitle}>Confirmación de cita</Text>
                  <Text style={styles.automationSubtitle}>
                    Enviar confirmación al agendar una cita
                  </Text>
                </View>
              </View>
              <Switch
                value={config?.confirmationOnBooking || false}
                onValueChange={(value) => updateAutomation('confirmationOnBooking', value)}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.automationItem}>
              <View style={styles.automationLeft}>
                <IconSymbol
                  android_material_icon_name="notifications"
                  size={24}
                  color={colors.text}
                />
                <View style={styles.automationText}>
                  <Text style={styles.automationTitle}>Notificación de lista de espera</Text>
                  <Text style={styles.automationSubtitle}>
                    Avisar cuando se libere un espacio
                  </Text>
                </View>
              </View>
              <Switch
                value={config?.waitlistNotification || false}
                onValueChange={(value) => updateAutomation('waitlistNotification', value)}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 48,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  placeholder: {
    width: 32,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  stepCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    flex: 1,
  },
  stepDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkButtonText: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: '600',
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 12,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  connectedCard: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  connectedText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
    marginTop: 12,
  },
  connectedSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  verifyButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  automationSection: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  automationItem: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  automationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  automationText: {
    marginLeft: 12,
    flex: 1,
  },
  automationTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  automationSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
