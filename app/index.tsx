import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { colors } from '@/styles/commonStyles';

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (hasNavigated.current) return;
    hasNavigated.current = true;

    console.log('[Index] Navigating. User:', user ? user.email : 'none', 'loading:', loading);

    const navigate = async () => {
      if (user) {
        // Esperar a que la sesión de Supabase esté activa
        let authUser = null;
        for (let i = 0; i < 10; i++) {
          const { data } = await supabase.auth.getUser();
          if (data?.user) { authUser = data.user; break; }
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        if (!authUser) { router.replace('/auth/onboarding'); return; }

        console.log('[Index] Auth UUID:', authUser.id);

        const { data: adminData } = await supabase
          .from('vylta_admins')
          .select('role')
          .eq('user_id', authUser.id)
          .eq('is_active', true)
          .single();

        console.log('[Index] Admin check:', JSON.stringify(adminData));
        console.log('[Index] Auth UUID:', authUser.id);

        if (adminData) {
          router.replace('/admin');
        } else {
          router.replace('/(tabs)/(home)');
        }
      } else {
        router.replace('/auth/login');
      }
    };
    navigate();
  }, [loading, user]);

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Text style={styles.logoText}>VYLTA</Text>
        <Text style={styles.tagline}>Cada cliente regresa</Text>
      </View>
      <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      <Text style={styles.loadingText}>Cargando...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#10B981',
    letterSpacing: 4,
  },
  tagline: {
    fontSize: 16,
    color: '#FFFFFF',
    marginTop: 8,
    fontStyle: 'italic',
  },
  loader: {
    marginTop: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#FFFFFF',
  },
});
