import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { colors } from '@/styles/commonStyles';

export default function Index() {
  const router = useRouter();
  const { user, loading, isStaffAccount } = useAuth();
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (hasNavigated.current) return;
    hasNavigated.current = true;

    console.log('[Index] Navigating. User:', user ? user.email : 'none', 'loading:', loading);

    const navigate = async () => {
      if (user) {
        const { data: { session } } = await supabase.auth.getSession();
        const authUser = session?.user;
        // ⚡ FIX (May 17 2026): si no hay sesión válida, ir a LOGIN (no onboarding).
        //
        // BUG ORIGINAL: aquí se hacía router.replace('/auth/onboarding').
        // Esto causaba que después de hacer logout (especialmente desde el
        // panel admin), el Index se re-montaba con `user` aún truthy en el
        // state de React pero la sesión de Supabase ya invalidada. La línea
        // forzaba ir al onboarding marketing aunque el usuario ya conociera
        // la app y solo quisiera volver a iniciar sesión.
        //
        // La decisión entre /auth/login y /auth/onboarding la toma el
        // NavigationGuard de _layout.tsx basándose en has_seen_onboarding.
        // Index NO debería forzar onboarding por su cuenta.
        if (!authUser) { router.replace('/auth/login'); return; }

        // Colaborador → su propia app
        if (isStaffAccount) {
          router.replace('/staff-app');
          return;
        }

        console.log('[Index] Auth UUID:', authUser.id);

        const { data: adminData } = await supabase
          .from('vylta_admins')
          .select('role')
          .eq('user_id', authUser.id)
          .eq('is_active', true)
          .single();

        console.log('[Index] Admin check:', JSON.stringify(adminData));

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
