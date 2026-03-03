
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ConfirmModal } from '@/components/button';
import { useAuth } from '@/contexts/AuthContext';
import { apiGet } from '@/utils/api';

interface WhatsAppConfig {
  isConnected: boolean;
  phoneNumber?: string;
}

interface Subscription {
  planType: 'Básico' | 'Premium';
  price: string;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user, businessProfile, signOut } = useAuth();
  const [logoutModal, setLogoutModal] = useState(false);
  const [whatsappConfig, setWhatsappConfig] = useState<WhatsAppConfig | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    console.log('[Settings] Loading settings');
    setLoading(true);
    try {
      const [whatsappData, subscriptionData] = await Promise.all([
        apiGet<WhatsAppConfig | null>('/api/whatsapp-config').catch(() => null),
        apiGet<Subscription>('/api/subscription').catch(() => null),
      ]);
      
      setWhatsappConfig(whatsappData);
      setSubscription(subscriptionData);
      console.log('[Settings] Settings loaded');
    } catch (error) {
      console.error('[Settings] Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLogoutModal(false);
    console.log('User confirmed logout');
    try {
      await signOut();
    } finally {
      router.replace('/auth/onboarding');
    }
  };

  const whatsappStatusText = whatsappConfig?.isConnected ? 'Conectado' : 'No configurado';
  const whatsappStatusColor = whatsappConfig?.isConnected ? colors.primary : colors.warning;
  const currentPlan = subscription?.planType || 'Básico';
  const currentPrice = subscription?.price || '$990 MXN';

  return (
    <SafeAreaView style={styles.container}>
      <ConfirmModal
        visible={logoutModal}
        title="Cerrar sesión"
        message="¿Estás seguro de que deseas cerrar sesión?"
        buttons={[
          {
            text: 'Cerrar sesión',
            onPress: handleLogout,
            style: 'destructive',
          },
          {
            text: 'Cancelar',
            onPress: () => setLogoutModal(false),
            style: 'cancel',
          },
        ]}
        onDismiss={() => setLogoutModal(false)}
      />

      <View style={styles.header}>
        <Text style={styles.title}>Configuración</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* User info card */}
          {user ? (
            <View style={styles.userCard}>
              <View style={styles.userAvatar}>
                <Text style={styles.userAvatarText}>
                  {user.name?.charAt(0).toUpperCase() || 'U'}
                </Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{user.name}</Text>
                <Text style={styles.userEmail}>{user.email}</Text>
                {businessProfile ? (
                  <Text style={styles.userBusiness}>{businessProfile.businessName}</Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* MI NEGOCIO */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>MI NEGOCIO</Text>

            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => {
                console.log('User tapped business info');
                router.push('/settings/business');
              }}
            >
              <View style={styles.settingLeft}>
                <IconSymbol android_material_icon_name="store" size={24} color={colors.text} />
                <Text style={styles.settingText}>Información del negocio</Text>
              </View>
              <IconSymbol
                android_material_icon_name="arrow-forward"
                size={24}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => {
                console.log('User tapped schedule');
                router.push('/settings/schedule');
              }}
            >
              <View style={styles.settingLeft}>
                <IconSymbol android_material_icon_name="schedule" size={24} color={colors.text} />
                <Text style={styles.settingText}>Horarios de atención</Text>
              </View>
              <IconSymbol
                android_material_icon_name="arrow-forward"
                size={24}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* WHATSAPP BUSINESS */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>WHATSAPP BUSINESS</Text>

            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => {
                console.log('User tapped WhatsApp setup');
                router.push('/settings/whatsapp');
              }}
            >
              <View style={styles.settingLeft}>
                <IconSymbol android_material_icon_name="message" size={24} color={colors.text} />
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingText}>Configuración de WhatsApp</Text>
                  <Text style={styles.settingSubtext}>
                    {whatsappConfig?.phoneNumber || 'Sin configurar'}
                  </Text>
                </View>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: whatsappStatusColor }]}>
                <Text style={styles.statusText}>{whatsappStatusText}</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* PLAN Y SUSCRIPCIÓN */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PLAN Y SUSCRIPCIÓN</Text>

            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => {
                console.log('User tapped subscription');
                router.push('/settings/subscription');
              }}
            >
              <View style={styles.settingLeft}>
                <IconSymbol android_material_icon_name="star" size={24} color={colors.accent} />
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingText}>Plan {currentPlan}</Text>
                  <Text style={styles.settingSubtext}>{currentPrice} / mes</Text>
                </View>
              </View>
              <IconSymbol
                android_material_icon_name="arrow-forward"
                size={24}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* CUENTA */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>CUENTA</Text>

            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => {
                console.log('User tapped edit profile');
                router.push('/settings/profile');
              }}
            >
              <View style={styles.settingLeft}>
                <IconSymbol android_material_icon_name="person" size={24} color={colors.text} />
                <Text style={styles.settingText}>Editar perfil</Text>
              </View>
              <IconSymbol
                android_material_icon_name="arrow-forward"
                size={24}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => {
                console.log('User tapped change password');
                router.push('/settings/password');
              }}
            >
              <View style={styles.settingLeft}>
                <IconSymbol android_material_icon_name="lock" size={24} color={colors.text} />
                <Text style={styles.settingText}>Cambiar contraseña</Text>
              </View>
              <IconSymbol
                android_material_icon_name="arrow-forward"
                size={24}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => {
                console.log('User tapped logout');
                setLogoutModal(true);
              }}
            >
              <View style={styles.settingLeft}>
                <IconSymbol android_material_icon_name="logout" size={24} color={colors.error} />
                <Text style={[styles.settingText, styles.logoutText]}>Cerrar sesión</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>VYLTA v1.0.0</Text>
            <Text style={styles.footerSubtext}>Cada cliente regresa</Text>
          </View>
        </ScrollView>
      )}
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
    padding: 20,
    paddingTop: 48,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  userCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  userAvatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  userEmail: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  userBusiness: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  settingItem: {
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
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  settingText: {
    fontSize: 16,
    color: colors.text,
    marginLeft: 12,
  },
  settingSubtext: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  logoutText: {
    color: colors.error,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    marginTop: 32,
  },
  footerText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  footerSubtext: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
});
