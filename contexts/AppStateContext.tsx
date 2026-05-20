import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { AppState, AppStateStatus, View, Text, ActivityIndicator, StyleSheet, Animated, Image } from 'react-native';
import { supabase } from '@/lib/supabase';
import { invalidateCache } from '@/utils/cache';
import { logger } from '@/utils/logger';

// ═════════════════════════════════════════════════════════════════
// AppStateContext — Manejo profesional del retorno desde background
//
// PROBLEMA QUE RESUELVE:
//   Cuando el usuario minimiza la app y vuelve después de un rato:
//   - Los WebSockets de Supabase se mueren silenciosamente
//   - Los queries quedan colgados esperando respuesta que nunca llega
//   - El cache muestra datos viejos
//   - La UI se ve "cargando infinito" o "pantalla blanca"
//
// SOLUCIÓN (estrategia de refresh inteligente + splash visual):
//   < 5 min en background  → nada (mejor performance/batería)
//   5-30 min               → invalidar caches + refresh token + AVISAR a pantallas
//   > 30 min               → refresh completo (token + caches + reabrir realtime + AVISAR)
//
// SPLASH DE RECONEXIÓN (May 19 2026):
//   Cuando se ejecuta un light/full refresh, se muestra un splash visual
//   SOBRE la UI para que el usuario sepa que estamos trabajando. Sin esto,
//   los usuarios reportaban "pantalla blanca/bugeada" porque la app se veía
//   muerta mientras se hacían las operaciones de refresh.
//
// TIMEOUT HARD (May 19 2026):
//   El refresh completo tiene un timeout de 10 segundos. Si tarda más,
//   forzamos la salida del splash para no bloquear al usuario, aunque
//   sea con datos potencialmente viejos. Mejor que pantalla blanca infinita.
//
// SISTEMA DE LISTENERS (May 19 2026):
//   Cuando el refresh termina, emitimos un evento que las pantallas pueden
//   escuchar vía useAppRefreshListener() para refetchear sus datos.
//   Esto resuelve el problema de invalidateCache(): el cache se borra,
//   pero los componentes activos no se enteran automáticamente.
// ═════════════════════════════════════════════════════════════════

const MINUTES = 60 * 1000;
const LIGHT_REFRESH_THRESHOLD = 5 * MINUTES;   // > 5 min: invalidar caches
const FULL_REFRESH_THRESHOLD = 30 * MINUTES;   // > 30 min: refresh completo
const FULL_REFRESH_TIMEOUT_MS = 10000;          // hard timeout: 10 seg max

// ──────────────────────────────────────────────────────────────────
// Sistema de listeners para que pantallas escuchen el evento de refresh
// ──────────────────────────────────────────────────────────────────
type RefreshListener = () => void;
const refreshListeners = new Set<RefreshListener>();

/** Registra un listener. Devuelve función de cleanup. */
export function subscribeToAppRefresh(listener: RefreshListener): () => void {
  refreshListeners.add(listener);
  return () => {
    refreshListeners.delete(listener);
  };
}

/** Emite el evento a todos los listeners registrados. */
function emitRefreshEvent(): void {
  // Iteramos sobre una copia por si algún listener se desuscribe en el callback
  const snapshot = Array.from(refreshListeners);
  for (const listener of snapshot) {
    try {
      listener();
    } catch (err) {
      // Un listener que falla no debe romper a los demás
      logger.warn('[AppState] Refresh listener threw:', err);
    }
  }
}

interface AppStateContextType {
  /** Trigger manual de refresh (útil para pull-to-refresh u otros casos) */
  forceRefresh: () => Promise<void>;
  /** Si está actualmente refrescando datos */
  isRefreshing: boolean;
}

const AppStateCtx = createContext<AppStateContextType | undefined>(undefined);

// ──────────────────────────────────────────────────────────────────
// Helper: ejecuta una Promise con timeout hard
// Si la promise no termina en `timeoutMs`, se resuelve igualmente
// (NO se rechaza — silenciamos el error para que el caller continúe)
// ──────────────────────────────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      logger.warn(`[AppState] Operation timed out after ${timeoutMs}ms`);
      resolve(null);
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        logger.warn('[AppState] Operation failed:', err);
        resolve(null);
      });
  });
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  // Cuándo se fue la app a background por última vez
  const lastBackgroundedAtRef = useRef<number | null>(null);
  // Estado anterior (para saber si veniamos de active → background)
  const lastAppStateRef = useRef<AppStateStatus>(AppState.currentState);
  // Si está refrescando ahora
  const [isRefreshing, setIsRefreshing] = useState(false);
  // ⚡ NUEVO: si mostrar el splash de reconexión
  const [showReconnectSplash, setShowReconnectSplash] = useState(false);
  // Opacidad animada del splash (fade in/out)
  const splashOpacity = useRef(new Animated.Value(0)).current;

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
      await withTimeout(supabase.auth.getSession(), 5000);
    } catch (error) {
      logger.warn('[AppState] Light refresh failed:', error);
    }
  };

  /**
   * Refresh completo: refresh explícito del token + invalidar caches + reabrir realtime.
   * Para cuando el usuario estuvo más de 30 min en background.
   *
   * Cada operación tiene su propio try/catch para que un fallo no aborte
   * los pasos siguientes. La idea: hacer best-effort en cada paso.
   */
  const fullRefresh = async () => {
    logger.log('[AppState] Full refresh: token + caches + realtime');

    // 1. Invalidar todos los caches (operación local, no puede fallar)
    try {
      invalidateCache();
    } catch (error) {
      logger.warn('[AppState] invalidateCache failed:', error);
    }

    // 2. Refresh explícito del token (con timeout para no colgarnos)
    try {
      await withTimeout(supabase.auth.refreshSession(), 5000);
    } catch (error) {
      logger.warn('[AppState] refreshSession failed, fallback to getSession:', error);
      try {
        await withTimeout(supabase.auth.getSession(), 3000);
      } catch (sessionError) {
        logger.warn('[AppState] getSession fallback also failed:', sessionError);
      }
    }

    // 3. Reabrir conexiones realtime (los WebSockets se mueren en background)
    //    Envolvemos en try/catch porque disconnect/connect puede crashear en
    //    Android con Hermes si hay canales en estado inconsistente.
    try {
      const channels = supabase.getChannels();
      if (channels.length > 0) {
        logger.log(`[AppState] Reconnecting ${channels.length} realtime channels`);
        supabase.realtime.disconnect();
        supabase.realtime.connect();
      }
    } catch (realtimeError) {
      logger.warn('[AppState] Realtime reconnect failed:', realtimeError);
    }
  };

  /**
   * Decide qué tipo de refresh hacer según tiempo en background.
   * Muestra el splash de reconexión durante el proceso.
   */
  const performRefresh = async (backgroundDurationMs: number) => {
    // Si fue menos de 5 min, no hacemos nada (mejor performance, no UX disruption)
    if (backgroundDurationMs <= LIGHT_REFRESH_THRESHOLD) {
      return;
    }

    setIsRefreshing(true);

    // Mostrar splash con fade in inmediato
    setShowReconnectSplash(true);
    Animated.timing(splashOpacity, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();

    try {
      // Hard timeout: max 10 segundos. Si tarda más, salimos del splash igual.
      const refreshOp = backgroundDurationMs > FULL_REFRESH_THRESHOLD
        ? fullRefresh()
        : lightRefresh();

      await withTimeout(refreshOp, FULL_REFRESH_TIMEOUT_MS);

      // Notificar a las pantallas que escuchan que pueden refetchear
      emitRefreshEvent();
    } finally {
      setIsRefreshing(false);
      // Fade out del splash con 200ms de duración
      Animated.timing(splashOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setShowReconnectSplash(false);
      });
    }
  };

  /**
   * Trigger manual desde fuera (ej. pull-to-refresh)
   */
  const forceRefresh = async () => {
    await fullRefresh();
    emitRefreshEvent();
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
      {/* ⚡ Splash de reconexión: cubre TODA la UI mientras se hace refresh */}
      {showReconnectSplash && (
        <Animated.View
          style={[styles.reconnectSplash, { opacity: splashOpacity }]}
          pointerEvents="auto"
        >
          <View style={styles.logoWrap}>
            <Image
              source={require('@/assets/images/app-icon-hkt.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.brand}>VYLTA</Text>
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color="#10B981" />
            <Text style={styles.statusText}>Reconectando...</Text>
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
  // ⚡ Splash de reconexión: ocupa toda la pantalla, fondo blanco como AppSplash
  reconnectSplash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
    elevation: 99999,
  },
  logoWrap: {
    width: 120,
    height: 120,
    borderRadius: 28,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  logo: {
    width: 96,
    height: 96,
  },
  brand: {
    marginTop: 20,
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 28,
  },
  statusText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
});
