import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';

export default function HomeScreen() {
  const { user, businessProfile } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>¡VYLTA funciona! 🎉</Text>
        <Text style={styles.text}>Usuario: {user?.name}</Text>
        <Text style={styles.text}>Negocio: {businessProfile?.businessName}</Text>
        <Text style={styles.text}>Email: {user?.email}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#10B981',
    marginBottom: 24,
  },
  text: {
    fontSize: 18,
    color: '#0F172A',
    marginBottom: 12,
  },
});
