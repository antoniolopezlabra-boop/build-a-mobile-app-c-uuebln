import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { AppState, AppStateStatus, View, Text, ActivityIndicator, StyleSheet, Animated } from 'react-native';
import { supabase } from '@/lib/supabase';
import { invalidateCache } from '@/utils/cache';
import { logger } from '@/utils/logger';

// ═════════════════════════════════════════════════════════════════
// AppStateContext — Manejo profesional del retorno desde background
//
// PROBLEMA QUE RESUELVE:
//   Cuando el usuario minimiza la app y vuelve después de un rato:
//   - Los WebSockets de Supabase se mueren silenciosamente (iOS/Android los suspende)
//   - Los queries quedan colgados esperando respuesta que nunca llega
//   - El cache muestra datos viejos
//   - La UI se ve "cargando infinito"
//
// SOLUCIÓN (estrategia de refresh inteligente):
//   < 5 min en background  → nada (mejor performance/batería)
//   5-30 min               → invalidar caches + refresh token
//   > 30 min               → refresh completo (token + caches + reabrir realtime)
//
// INDICADOR VISUAL:
//   Solo aparece si el refresh tarda >3 seg (evita ruido visual innecesario).
//   Es un loader sutil arriba que se desvanece automáticamente.
//
// IMPLEMENTADO:
//   - Listener de AppState (RN built-in)
//   - Defensivo: try/catch en cada paso, nunca crashea
//   - Logs para debugging si algo falla
// ═════════════════════════════════════════════════════════════════

const MINUTES = 60 * 1000;
const LIGHT_REFRESH_THRESHOLD = 5 * MINUTES;   // > 5 min: invalidar caches
const FULL_REFRESH_THRESHOLD = 30 * MINUTES;   // > 30 min: refresh completo
const SHOW_INDICATOR_AFTER_MS = 3000;          // mostrar loader solo si tarda >3 seg

interface AppStateContextType {
  /** Trigger manual de refresh (útil para pull-to-refresh u otros casos) */
  forceRefresh: () => Promise<void>;
  /** Si está actualmente refrescando datos */
  isRefreshing: boolean;
}

const AppStateCtx = createContext<AppStateContextType | undefined>(undefined);

export function AppStateProvider({ children }: { children: ReactNode }) {
  // Cuándo se fue la app a background por última vez
  const lastBackgroundedAtRef = useRef<number | null>(null);
  // Estado anterior (para saber si veniamos de active → background)
  const lastAppStateRef = useRef<AppStateStatus>(AppState.currentState);
  // Si está refrescando ahora
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Si mostrar el indicador visual (solo si tarda más de SHOW_INDICATOR_AFTER_MS)
  const [showIndicator, setShowIndicator] = useState(false);
  // Animación del indicador
  const indicatorOpacity = useRef(new Animated.Value(0)).current;

  // ————————————————————————————————————————————————————————
  // Lógica del refresh
  // ————————————————————————————————————————————————————————

  /**
   * Refresh ligero: invalidar caches + verificar sesión.
   * Para cuando el usuario estuvo 5-30 min en background.
   */
  const lightRefresh = async () => {
    try {
      logger.log('[AppState] Light refresh: invalidating caches');
      invalidateCache();
      // Asegurarse que la sesión sigue válida (Supabase auto-renueva el token internamente)
      await supabase.auth.getSession();
    } catch (error) {
      logger.warn('[AppState] Light refresh failed:', error);
    }
  };

  /**
   * Refresh completo: refresh explícito del token + invalidar caches + reabrir realtime.
   * Para cuando el usuario estuvo más de 30 min en background.
   */
  const fullRefresh = async () => {
    try {
      logger.log('[AppState] Full refresh: token + caches + realtime');

      // 1. Invalidar todos los caches
      invalidateCache();

      // 2. Refresh explícito del token (no sólo verificar)
      try {
        await supabase.auth.refreshSession();
      } catch (tokenError) {
        // Si falla el refresh del token, al menos verificar que haya sesión
        logger.warn('[AppState] Token refresh failed, falling back to getSession:', tokenError);
        await supabase.auth.getSession();
      }

      // 3. Reabrir conexiones realtime (los WebSockets se mueren en background)
      try {
        // Disconnect + connect para reabrir todas las suscripciones activas
        const channels = supabase.getChannels();
        if (channels.length > 0) {
          logger.log(`[AppState] Reconnecting ${channels.length} realtime channels`);
          // Forzar reconnection del cliente realtime
          supabase.realtime.disconnect();
          supabase.realtime.connect();
        }
      } catch (realtimeError) {
        logger.warn('[AppState] Realtime reconnect failed:', realtimeError);
      }
    } catch (error) {
      logger.warn('[AppState] Full refresh failed:', error);
    }
  };

  /**
   * Decide qué tipo de refresh hacer según tiempo en background.
   */
  const performRefresh = async (backgroundDurationMs: number) => {
    // Programar el indicador visual: solo aparece si el refresh tarda más de 3 seg
    const indicatorTimer = setTimeout(() => {
      setShowIndicator(true);
      Animated.timing(indicatorOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }, SHOW_INDICATOR_AFTER_MS);

    setIsRefreshing(true);
    try {
      if (backgroundDurationMs > FULL_REFRESH_THRESHOLD) {
        await fullRefresh();
      } else if (backgroundDurationMs > LIGHT_REFRESH_THRESHOLD) {
        await lightRefresh();
      }
      // Si es < 5 min, no hacemos nada (mejor performance)
    } finally {
      clearTimeout(indicatorTimer);
      setIsRefreshing(false);
      // Si el indicador ya se mostró, ocultarlo con animación
      Animated.timing(indicatorOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        setShowIndicator(false);
      });
    }
  };

  /**
   * Trigger manual desde fuera (ej. pull-to-refresh)
   */
  const forceRefresh = async () => {
    await fullRefresh();
  };

  // ————————————————————————————————————————————————————————
  // Listener de AppState
  // ————————————————————————————————————————————————————————
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      const prevState = lastAppStateRef.current;
      lastAppStateRef.current = nextState;

      logger.log(`[AppState] ${prevState} → ${nextState}`);

      // active → background/inactive: registrar cuándo se fue
      if (prevState === 'active' && (nextState === 'background' || nextState === 'inactive')) {
        lastBackgroundedAtRef.current = Date.now();
        return;
      }

      // background/inactive → active: refresh inteligente
      if (
        (prevState === 'background' || prevState === 'inactive') &&
        nextState === 'active' &&
        lastBackgroundedAtRef.current !== null
      ) {
        const backgroundDurationMs = Date.now() - lastBackgroundedAtRef.current;
        const minutes = Math.round(backgroundDurationMs / MINUTES);
        logger.log(`[AppState] Returned from background after ~${minutes} min`);
        lastBackgroundedAtRef.current = null;
        // No await: que se ejecute en background sin bloquear
        performRefresh(backgroundDurationMs);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <AppStateCtx.Provider value={{ forceRefresh, isRefreshing }}>
      {children}
      {/* Indicador visual sutil arriba (solo aparece si el refresh tarda >3 seg) */}
      {showIndicator && (
        <Animated.View
          style={[styles.indicator, { opacity: indicatorOpacity }]}
          pointerEvents="none"
        >
          <View style={styles.indicatorInner}>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text style={styles.indicatorText}>Actualizando...</Text>
          </View>
        </Animated.View>
      )}
    </AppStateCtx.Provider>
  );
}

export function useAppStateRefresh() {
  const ctx = useContext(AppStateCtx);
  if (!ctx) throw new Error('useAppStateRefresh must be used within AppStateProvider');
  return ctx;
}

const styles = StyleSheet.create({
  indicator: {
    position: 'absolute',
    top: 60, // debajo del notch / SafeArea
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    pointerEvents: 'none',
  },
  indicatorInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.92)', // dark slate semi-transparente
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  indicatorText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
