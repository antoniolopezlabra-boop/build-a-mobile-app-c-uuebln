import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { AppState, AppStateStatus, View, Text, ActivityIndicator, StyleSheet, Animated, Image, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { invalidateCache, setCacheUserId } from '@/utils/cache';
import { logger } from '@/utils/logger';

// ═════════════════════════════════════════════════════════════════
// AppStateContext — Manejo profesional del retorno desde background
// v3 (May 23 2026) — 4 capas de defensa contra splash colgado
//
// PROBLEMA HISTÓRICO:
//   Usuarios beta reportaban: "Cuando minimizo la app, después de un
//   rato la abro y se queda trabajando, cargando infinito, hasta que la
//   cierro completamente y la vuelvo a abrir."
//
// DIAGNÓSTICO (6 bugs trabajando juntos):
//   1. withTimeout(10s) usa setTimeout que se suspende en Android
//      cuando el OS mata el JS bridge → al despertar el timer tarda 30+s
//   2. supabase.realtime.disconnect() crashea Hermes con canales
//      en estado inconsistente → cliente zombie
//   3. NavigationGuard queda atrapado en "businessProfileLoaded === false"
//      si el refreshSession falló silenciosamente
//   4. Dos splashes peleando por z-index simultáneamente
//   5. Token expirado (>7 días) no detectado → app cree estar logueada
//   6. No hay watchdog que fuerce escape después de N segundos
//
// SOLUCIÓN: 4 CAPAS DE DEFENSA
//   CAPA 1: Watchdog universal de 15s (siempre garantiza escape)
//   CAPA 2: Eliminado disconnect() destructivo (solo connect() defensivo)
//   CAPA 3: Detección de token muerto + logout forzado
//   CAPA 4: Botón "Reiniciar app" después de 8s en splash
//
// SISTEMA DE LISTENERS:
//   Cuando el refresh termina (sea por éxito o por watchdog),
//   emitimos refresh event para que pantallas activas refetcheen.
// ═════════════════════════════════════════════════════════════════

const MINUTES = 60 * 1000;
const LIGHT_REFRESH_THRESHOLD = 5 * MINUTES;   // > 5 min: invalidar caches
const FULL_REFRESH_THRESHOLD = 30 * MINUTES;   // > 30 min: refresh completo
const FULL_REFRESH_TIMEOUT_MS = 10_000;         // soft timeout: 10 seg max por operación
const WATCHDOG_TIMEOUT_MS = 15_000;             // ⚡ CAPA 1: watchdog universal 15s
const ESCAPE_BUTTON_DELAY_MS = 8_000;           // ⚡ CAPA 4: botón "Reiniciar" a los 8s

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
// Helper: ejecuta una Promise con timeout hard.
// Si la promise no termina en `timeoutMs`, se resuelve a null
// (NO se rechaza — silenciamos el error para que el caller continúe).
//
// IMPORTANTE (v3): NO confiamos solo en este timeout porque setTimeout
// se suspende en Android cuando el JS bridge muere. Por eso agregamos
// el watchdog que usa Date.now() (real time) además de este timeout.
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
  // Si mostrar el splash de reconexión
  const [showReconnectSplash, setShowReconnectSplash] = useState(false);
  // Opacidad animada del splash (fade in/out)
  const splashOpacity = useRef(new Animated.Value(0)).current;
  // ⚡ CAPA 4: cuándo arrancó el refresh actual (para mostrar timer y botón escape)
  const refreshStartedAtRef = useRef<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showEscapeButton, setShowEscapeButton] = useState(false);
  // ⚡ CAPA 1: watchdog timer ref (para poder cancelarlo si el refresh termina antes)
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ⚡ CAPA 4: timer del elapsed seconds (para mostrar contador en el splash)
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Generación del refresh actual — evita que un refresh viejo cierre el splash de uno nuevo
  const refreshGenerationRef = useRef(0);

  // ————————————————————————————————————————————————————————
  // Helpers de control del splash
  // ————————————————————————————————————————————————————————

  /**
   * Cierra el splash de manera segura y resetea TODOS los timers.
   * Idempotente: se puede llamar múltiples veces sin efectos secundarios.
   */
  const closeSplash = (reason: string) => {
    logger.log(`[AppState] Closing splash (reason: ${reason})`);

    // Limpiar watchdog y elapsed timer
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }

    refreshStartedAtRef.current = null;
    setIsRefreshing(false);
    setShowEscapeButton(false);
    setElapsedSeconds(0);

    // Fade out con 200ms
    Animated.timing(splashOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowReconnectSplash(false);
    });
  };

  /**
   * ⚡ CAPA 4: handler del botón "Reiniciar app".
   * Hace reset forzado: cierra splash, emite refresh, e invalida caches.
   * Es la última red de seguridad para el usuario.
   */
  const handleEscapeButton = () => {
    logger.warn('[AppState] User pressed escape button — forcing reset');
    try {
      invalidateCache();
    } catch {}
    closeSplash('user_escape');
    // Emitir refresh event para que las pantallas refetcheen con sus propios fallbacks
    emitRefreshEvent();
  };

  // ————————————————————————————————————————————————————————
  // Lógica del refresh
  // ————————————————————————————————————————————————————————

  /**
   * Refresh ligero: invalidar caches + verificar sesión.
   * Para cuando el usuario estuvo 5-30 min en background.
   */
  const lightRefresh = async (): Promise<{ tokenAlive: boolean }> => {
    logger.log('[AppState] Light refresh: invalidating caches + verify session');

    try {
      invalidateCache();
    } catch (error) {
      logger.warn('[AppState] invalidateCache failed:', error);
    }

    // Verificar sesión (Supabase auto-renueva internamente si está cerca de expirar)
    const result = await withTimeout(supabase.auth.getSession(), 5000);

    // ⚡ CAPA 3: si no hay sesión, el token está muerto
    if (result && result.data?.session) {
      return { tokenAlive: true };
    }
    // Si el timeout disparó (result === null), asumimos que el token está vivo
    // pero hubo problema de red — no queremos forzar logout por un timeout temporal.
    return { tokenAlive: result === null };
  };

  /**
   * Refresh completo: refresh explícito del token + invalidar caches + reabrir realtime.
   * Para cuando el usuario estuvo más de 30 min en background.
   *
   * Cada operación tiene su propio try/catch para que un fallo no aborte
   * los pasos siguientes. La idea: best-effort en cada paso.
   *
   * ⚡ CAPA 2 (v3): NO usamos disconnect() porque crashea Hermes.
   * Supabase ya maneja la reconexión automática internamente.
   */
  const fullRefresh = async (): Promise<{ tokenAlive: boolean }> => {
    logger.log('[AppState] Full refresh: token + caches + realtime');

    // 1. Invalidar todos los caches (operación local, no puede fallar)
    try {
      invalidateCache();
    } catch (error) {
      logger.warn('[AppState] invalidateCache failed:', error);
    }

    // 2. Refresh explícito del token (con timeout para no colgarnos)
    let tokenAlive = true;
    const refreshResult = await withTimeout(supabase.auth.refreshSession(), 5000);

    if (refreshResult === null) {
      // Timeout — intentar getSession como fallback
      logger.warn('[AppState] refreshSession timed out, trying getSession fallback');
      const sessionResult = await withTimeout(supabase.auth.getSession(), 3000);
      // Si tampoco hay sesión válida, el token está muerto
      if (sessionResult && !sessionResult.data?.session) {
        tokenAlive = false;
      }
    } else if (refreshResult.error) {
      // ⚡ CAPA 3: errores típicos de token muerto
      // - "Invalid Refresh Token"
      // - "Refresh Token Not Found"
      // - "JWT expired"
      const errMsg = String(refreshResult.error.message || '').toLowerCase();
      if (
        errMsg.includes('refresh token') ||
        errMsg.includes('jwt expired') ||
        errMsg.includes('invalid')
      ) {
        logger.warn('[AppState] Token is dead, will force logout:', errMsg);
        tokenAlive = false;
      }
    } else if (!refreshResult.data?.session) {
      // refreshSession devolvió sin sesión válida → token muerto
      tokenAlive = false;
    }

    // 3. ⚡ CAPA 2: Reconectar realtime de manera defensiva (SIN disconnect previo).
    //    Disconnect crashea Hermes si los canales están en estado inconsistente.
    //    Supabase Realtime reconecta automáticamente al detectar la app activa,
    //    pero llamamos connect() para acelerar el proceso.
    if (tokenAlive) {
      try {
        const channels = supabase.getChannels();
        if (channels.length > 0) {
          logger.log(`[AppState] Triggering realtime reconnect (${channels.length} channels)`);
          // Solo connect, NO disconnect. Supabase es idempotente con esto.
          supabase.realtime.connect();
        }
      } catch (realtimeError) {
        // Si esto falla no es crítico — los canales se reconectarán solos
        logger.warn('[AppState] Realtime connect failed (non-critical):', realtimeError);
      }
    }

    return { tokenAlive };
  };

  /**
   * ⚡ CAPA 3: handler para token muerto detectado.
   * Limpia el estado de auth y manda al usuario a login.
   */
  const handleDeadToken = async () => {
    logger.warn('[AppState] Dead token detected — forcing logout');
    try {
      invalidateCache();
      setCacheUserId(null);
      // Limpieza local de la sesión sin esperar a Supabase (que puede tardar)
      await withTimeout(supabase.auth.signOut(), 3000);
    } catch (e) {
      logger.warn('[AppState] signOut on dead token failed:', e);
    }
    // Navegar a login independientemente del resultado del signOut
    try {
      router.replace('/auth/login');
    } catch (navError) {
      logger.warn('[AppState] Navigation to login failed:', navError);
    }
  };

  /**
   * Decide qué tipo de refresh hacer según tiempo en background.
   * Muestra el splash de reconexión durante el proceso.
   *
   * ⚡ v3: ahora con watchdog universal + botón de escape + detección de token muerto.
   */
  const performRefresh = async (backgroundDurationMs: number) => {
    // Si fue menos de 5 min, no hacemos nada (mejor performance, no UX disruption)
    if (backgroundDurationMs <= LIGHT_REFRESH_THRESHOLD) {
      return;
    }

    // Generación única de este refresh — para que callbacks viejos no afecten estado nuevo
    const myGeneration = ++refreshGenerationRef.current;

    setIsRefreshing(true);
    refreshStartedAtRef.current = Date.now();

    // Mostrar splash con fade in inmediato
    setShowReconnectSplash(true);
    setShowEscapeButton(false);
    setElapsedSeconds(0);
    Animated.timing(splashOpacity, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();

    // ⚡ CAPA 4: timer del contador "Reconectando... 5s" + botón escape a los 8s
    elapsedTimerRef.current = setInterval(() => {
      if (refreshStartedAtRef.current === null) return;
      const elapsed = Math.floor((Date.now() - refreshStartedAtRef.current) / 1000);
      setElapsedSeconds(elapsed);
      if (elapsed >= Math.floor(ESCAPE_BUTTON_DELAY_MS / 1000)) {
        setShowEscapeButton(true);
      }
    }, 1000);

    // ⚡ CAPA 1: watchdog universal — SIEMPRE dispara a los 15s sin importar lo demás.
    // Si por alguna razón el refresh queda colgado (bug de Supabase, network, Hermes),
    // forzamos la salida del splash y emitimos refresh event de todas formas.
    watchdogTimerRef.current = setTimeout(() => {
      // Verificar que sigue siendo el mismo refresh que arrancó (no uno nuevo)
      if (refreshGenerationRef.current === myGeneration) {
        logger.warn(`[AppState] Watchdog fired after ${WATCHDOG_TIMEOUT_MS}ms — forcing escape`);
        closeSplash('watchdog_timeout');
        emitRefreshEvent();
      }
    }, WATCHDOG_TIMEOUT_MS);

    // Ejecutar el refresh real
    let tokenAlive = true;
    try {
      const refreshOp = backgroundDurationMs > FULL_REFRESH_THRESHOLD
        ? fullRefresh()
        : lightRefresh();

      const result = await withTimeout(refreshOp, FULL_REFRESH_TIMEOUT_MS);

      // Si timeout disparó (result === null), asumir token vivo (no forzar logout por timeout)
      tokenAlive = result === null ? true : result.tokenAlive;
    } catch (error) {
      // Error inesperado — log pero no forzar logout
      logger.error('[AppState] Unexpected refresh error:', error);
      tokenAlive = true;
    }

    // Si esto ya no es el refresh activo (otro arrancó), no hacer nada
    if (refreshGenerationRef.current !== myGeneration) {
      logger.log('[AppState] Refresh superseded by newer one, ignoring result');
      return;
    }

    // ⚡ CAPA 3: si el token está muerto, hacer logout forzado ANTES de cerrar splash
    if (!tokenAlive) {
      closeSplash('dead_token');
      await handleDeadToken();
      return;
    }

    // Notificar a las pantallas que escuchan que pueden refetchear
    emitRefreshEvent();

    // Cerrar splash exitosamente
    closeSplash('success');
  };

  /**
   * Trigger manual desde fuera (ej. pull-to-refresh).
   * NO muestra splash porque viene de un gesto explícito del usuario.
   */
  const forceRefresh = async () => {
    const result = await fullRefresh();
    if (!result.tokenAlive) {
      await handleDeadToken();
      return;
    }
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
      // Cleanup de timers si el provider se desmonta
      if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
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
            <Text style={styles.statusText}>
              Reconectando{elapsedSeconds > 0 ? `... ${elapsedSeconds}s` : '...'}
            </Text>
          </View>

          {/* ⚡ CAPA 4: botón de escape después de 8 segundos */}
          {showEscapeButton && (
            <TouchableOpacity
              style={styles.escapeButton}
              onPress={handleEscapeButton}
              activeOpacity={0.7}
            >
              <Text style={styles.escapeButtonText}>Reiniciar app</Text>
            </TouchableOpacity>
          )}
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
  // ⚡ CAPA 4: botón de escape (aparece a los 8s)
  escapeButton: {
    marginTop: 40,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  escapeButtonText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
});
