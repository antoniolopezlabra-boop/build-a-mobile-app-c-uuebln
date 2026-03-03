
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { colors } from '@/styles/commonStyles';

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    // Only navigate ONCE when loading is complete
    // Do NOT re-trigger on user state changes to prevent loops
    if (!loading) {
      console.log('[Index] Auth loaded, user:', user ? user.email : 'not authenticated');
      
      if (user) {
        console.log('[Index] User is authenticated, redirecting to home');
        router.replace('/(tabs)/(home)');
      } else {
        console.log('[Index] User is not authenticated, redirecting to onboarding');
        router.replace('/auth/onboarding');
      }
    }
  }, [loading]); // ONLY depend on loading, NOT on user

  // Show loading screen while determining auth state
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
    backgroundColor: '#0F172A', // VYLTA dark blue
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#10B981', // VYLTA green
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
