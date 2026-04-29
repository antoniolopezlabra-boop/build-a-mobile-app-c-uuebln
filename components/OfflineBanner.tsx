import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useNetwork } from '@/contexts/NetworkContext';

// ══════════════════════════════════════════════════════════════════
// OfflineBanner — Banner global que aparece arriba cuando no hay internet
// También muestra brevemente "Conexión restablecida" cuando se recupera.
// ══════════════════════════════════════════════════════════════════

export function OfflineBanner() {
  const { isConnected, justReconnected } = useNetwork();
  const slideAnim = useRef(new Animated.Value(-60)).current;

  // Mostrar banner si está offline O si acaba de reconectar
  const shouldShow = !isConnected || justReconnected;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: shouldShow ? 0 : -60,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [shouldShow]);

  if (!shouldShow) return null;

  // Estado visual según situación
  const isReconnected = isConnected && justReconnected;
  const bgColor = isReconnected ? '#10B981' : '#EF4444';
  const icon = isReconnected ? 'cloud-done' : 'cloud-off';
  const message = isReconnected
    ? 'Conexión restablecida'
    : 'Sin conexión a internet';
  const subMessage = isReconnected
    ? 'Datos sincronizados'
    : 'Algunas funciones pueden no estar disponibles';

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: bgColor, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <SafeAreaView edges={['top']}>
        <View style={styles.content}>
          <MaterialIcons name={icon as any} size={18} color="#fff" />
          <View style={styles.textWrap}>
            <Text style={styles.message}>{message}</Text>
            <Text style={styles.subMessage}>{subMessage}</Text>
          </View>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  textWrap: {
    flex: 1,
  },
  message: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  subMessage: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 1,
  },
});
