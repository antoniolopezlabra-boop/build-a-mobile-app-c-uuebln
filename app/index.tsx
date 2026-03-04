
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { colors } from '@/styles/commonStyles';

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (loading) {
      hasNavigated.current = false;
      return;
    }
    if (hasNavigated.current) return;
    hasNavigated.current = true;

    if (user) {
      router.replace('/(tabs)/(home)');
    } else {
      router.replace('/auth/onboarding');
    }
  }, [loading, user, router]);

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
