
import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { colors } from '@/styles/commonStyles';

export default function Index() {
  const router = useRouter();
  const segments = useSegments();
  const { user, loading } = useAuth();

  useEffect(() => {
    // Wrap navigation logic in try/catch to prevent silent crashes
    const handleNavigation = async () => {
      try {
        if (loading) {
          console.log('[Index] Auth still loading, waiting...');
          return;
        }

        console.log('[Index] Auth loaded, user:', user ? user.email : 'not authenticated');
        console.log('[Index] Current segments:', segments);

        if (user) {
          console.log('[Index] User is authenticated, redirecting to home');
          // Use replace to prevent back navigation to index
          router.replace('/(tabs)/(home)');
        } else {
          console.log('[Index] User is not authenticated, redirecting to onboarding');
          router.replace('/auth/onboarding');
        }
      } catch (error) {
        console.error('[Index] Navigation error:', error);
        // Fallback: try to navigate to onboarding if there's an error
        try {
          router.replace('/auth/onboarding');
        } catch (fallbackError) {
          console.error('[Index] Fallback navigation failed:', fallbackError);
        }
      }
    };

    handleNavigation();
  }, [user, loading]);

  // Show loading screen while determining auth state
  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Text style={styles.logoText}>VYLTA</Text>
        <Text style={styles.tagline}>Cada cliente regresa</Text>
      </View>
      <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
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
});
