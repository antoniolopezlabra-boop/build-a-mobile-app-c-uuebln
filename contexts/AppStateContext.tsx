import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { AppState, AppStateStatus, View, Text, ActivityIndicator, StyleSheet, Animated } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { invalidateCache, setCacheUserId } from '@/utils/cache';
import { logger } from '@/utils/logger';

// ══════════════════════════════════════════════════════════════════
// AppStateContext — Manejo profesional del retorno desde background
// v4 (May 31 2026 — fix/foreground-ux) — refresh NO disruptivo
//
// HISTORIA:
//   v3 resolvió el FREEZE DURO ("se quedaba cargando infinito hasta
//   cerrar la app") con 4 capas de defensa. Funcionó. Pero introdujo
//   un efecto secundario: un SPLASH BLANCO a pantalla completa que
//   tapaba toda la UI en CADA regreso de background > 5 min, incluso
//   cuando el refresh real tomaba menos de 1 segundo. Eso es lo que
//   los clientes seguían percibiendo como "se pasma / se queda
//   trabajando" al volver a la app.
//
// CAMBIO v4 — la reconexión deja de ser un evento visual disruptivo:
//   • 5–30 min en background  → refresh LIGERO y SILENCIOSO.
//       Sin overlay. Solo invalidamos caches + verificamos sesión y
//       emitimos el evento para que las pantallas refresquen EN SU
//       LUGAR (manteniendo los datos visibles, sin parpadeo a blanco).
//   • > 30 min en background  → refresh COMPLETO con un BANNER sutil
//       NO bloqueante ("Actualizando…") en la parte superior. La app
//       sigue 100% usable mientras tanto; no se tapa nada.
//
// QUÉ SE CONSERVA de v3 (las defensas que SÍ importan):
//   • Watchdog universal de 15s → garantiza que el banner se cierre y
//     que el evento de refresh se emita pase lo que pase.
//   • NUNCA llamamos realtime.disconnect() (crashea Hermes). Solo
//     connect() defensivo.
//   • Detección de token muerto → logout forzado a /auth/login.
//
// QUÉ SE ELIMINA de v3 (ya no hace falta):
//   • El splash blanco a pantalla completa.
//   • El botón "Reiniciar app" y el contador de segundos: existían
//     SOLO porque el splash bloqueaba al usuario. Con el banner no
//     bloqueante, el usuario nunca queda atrapado, así que sobran.
// ══════════════════════════════════════════════════════════════════

const MINUTES = 60 * 1000;
const LIGHT_REFRESH_THRESHOLD = 5 * MINUTES;   // > 5 min: refresh ligero silencioso
const FULL_REFRESH_THRESHOLD = 30 * MINUTES;   // > 30 min: refresh completo + banner
const FULL_REFRESH_TIMEOUT_MS = 10_000;         // soft timeout por operación
const WATCHDOG_TIMEOUT_MS = 15_000;             // watchdog universal (garantiza escape)

// ─────────────────────────────────────────────────────
// Sistema de listeners para que pantallas escuchen el evento de refresh
// ─────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────
// Helper: ejecuta una Promise con timeout hard.
// Si la promise no termina en `timeoutMs`, se resuelve a null
// (NO se rechaza — silenciamos el error para que el caller continúe).
// ─────────────────────────────────────────────────────
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
  // Estado anterior (para saber si veníamos de active → background)
  const lastAppStateRef = useRef<AppStateStatus>(AppState.currentState);
  // Si está refrescando ahora
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Si mostrar el banner sutil de "Actualizando…" (solo en refresh completo)
  const [showBanner, setShowBanner] = useState(false);
  // Opacidad animada del banner (fade in/out)
  const bannerOpacity = useRef(new Animated.Value(0)).current;
  // Watchdog timer ref (para poder cancelarlo si el refresh termina antes)
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Generación del refresh actual — evita que un refresh viejo afecte a uno nuevo
  const refreshGenerationRef = useRef(0);

  // ——————————————————————————————————————————
  // Helpers de control del banner
  // ——————————————————————————————————————————

  /**
   * Cierra el banner de manera segura y resetea timers.
   * Idempotente: se puede llamar múltiples veces sin efectos secundarios.
   */
  const closeBanner = (reason: string) => {
    logger.log(`[AppState] Closing banner (reason: ${reason})`);

    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }

    setIsRefreshing(false);

    // Fade out con 200ms
    Animated.timing(bannerOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowBanner(false);
    });
  };

  // ——————————————————————————————————————————
  // Lógica del refresh
  // ——————————————————————————————————————————

  /**
   * Refresh ligero: invalidar caches + verificar sesión.
   * Para cuando el usuario estuvo 5–30 min en background.
   * SILENCIOSO: no muestra ningún overlay ni banner.
   */
  const lightRefresh = async (): Promise<{ tokenAlive: boolean }> => {
    logger.log('[AppState] Light refresh (silent): invalidating caches + verify session');

    try {
      invalidateCache();
    } catch (error) {
      logger.warn('[AppState] invalidateCache failed:', error);
    }

    // Verificar sesión (Supabase auto-renueva internamente si está cerca de expirar)
    const result = await withTimeout(supabase.auth.getSession(), 5000);

    // Si no hay sesión, el token está muerto
    if (result && result.data?.session) {
      return { tokenAlive: true };
    }
    // Si el timeout disparó (result === null), asumimos que el token está vivo
    // pero hubo problema de red — no forzamos logout por un timeout temporal.
    return { tokenAlive: result === null };
  };

  /**
   * Refresh completo: refresh explícito del token + invalidar caches + reabrir realtime.
   * Para cuando el usuario estuvo más de 30 min en background.
   *
   * Cada operación tiene su propio try/catch para que un fallo no aborte los
   * pasos siguientes (best-effort en cada paso).
   *
   * NO usamos disconnect() porque crashea Hermes. Supabase ya maneja la
   * reconexión automática internamente; connect() solo la acelera.
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
      if (sessionResult && !sessionResult.data?.session) {
        tokenAlive = false;
      }
    } else if (refreshResult.error) {
      // Errores típicos de token muerto: "Invalid Refresh Token",
      // "Refresh Token Not Found", "JWT expired"
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
      tokenAlive = false;
    }

    // 3. Reconectar realtime de manera defensiva (SIN disconnect previo).
    if (tokenAlive) {
      try {
        const channels = supabase.getChannels();
        if (channels.length > 0) {
          logger.log(`[AppState] Triggering realtime reconnect (${channels.length} channels)`);
          supabase.realtime.connect();
        }
      } catch (realtimeError) {
        logger.warn('[AppState] Realtime connect failed (non-critical):', realtimeError);
      }
    }

    return { tokenAlive };
  };

  /**
   * Handler para token muerto detectado.
   * Limpia el estado de auth y manda al usuario a login.
   */
  const handleDeadToken = async () => {
    logger.warn('[AppState] Dead token detected — forcing logout');
    try {
      invalidateCache();
      setCacheUserId(null);
      await withTimeout(supabase.auth.signOut(), 3000);
    } catch (e) {
      logger.warn('[AppState] signOut on dead token failed:', e);
    }
    try {
      router.replace('/auth/login');
    } catch (navError) {
      logger.warn('[AppState] Navigation to login failed:', navError);
    }
  };

  /**
   * Decide qué tipo de refresh hacer según el tiempo en background.
   *
   * v4: el refresh ligero (5–30 min) es SILENCIOSO. El banner sutil solo
   * aparece en el refresh completo (> 30 min) y NUNCA bloquea la UI.
   */
  const performRefresh = async (backgroundDurationMs: number) => {
    // Menos de 5 min → no hacemos nada (mejor performance, cero disrupción)
    if (backgroundDurationMs <= LIGHT_REFRESH_THRESHOLD) {
      return;
    }

    const isFull = backgroundDurationMs > FULL_REFRESH_THRESHOLD;

    // Generación única de este refresh — para que callbacks viejos no afecten estado nuevo
    const myGeneration = ++refreshGenerationRef.current;

    setIsRefreshing(true);

    // Solo el refresh COMPLETO muestra el banner sutil (no bloqueante).
    if (isFull) {
      setShowBanner(true);
      Animated.timing(bannerOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }

    // Watchdog universal — SIEMPRE dispara a los 15s sin importar lo demás.
    // Si el refresh queda colgado (bug de Supabase, red, Hermes), cerramos el
    // banner y emitimos el evento de refresh de todas formas.
    watchdogTimerRef.current = setTimeout(() => {
      if (refreshGenerationRef.current === myGeneration) {
        logger.warn(`[AppState] Watchdog fired after ${WATCHDOG_TIMEOUT_MS}ms — forcing escape`);
        closeBanner('watchdog_timeout');
        emitRefreshEvent();
      }
    }, WATCHDOG_TIMEOUT_MS);

    // Ejecutar el refresh real
    let tokenAlive = true;
    try {
      const refreshOp = isFull ? fullRefresh() : lightRefresh();
      const result = await withTimeout(refreshOp, FULL_REFRESH_TIMEOUT_MS);
      // Si timeout disparó (result === null), asumir token vivo
      tokenAlive = result === null ? true : result.tokenAlive;
    } catch (error) {
      logger.error('[AppState] Unexpected refresh error:', error);
      tokenAlive = true;
    }

    // Si este ya no es el refresh activo (otro arrancó), no hacer nada
    if (refreshGenerationRef.current !== myGeneration) {
      logger.log('[AppState] Refresh superseded by newer one, ignoring result');
      return;
    }

    // Si el token está muerto, logout forzado ANTES de cerrar el banner
    if (!tokenAlive) {
      closeBanner('dead_token');
      await handleDeadToken();
      return;
    }

    // Notificar a las pantallas que escuchan que pueden refetchear EN SU LUGAR
    emitRefreshEvent();

    // Cerrar banner (si estaba) o simplemente apagar el flag de refresco
    if (isFull) {
      closeBanner('success');
    } else {
      // Refresh ligero silencioso: limpiar watchdog y apagar flag sin animación
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
      setIsRefreshing(false);
    }
  };

  /**
   * Trigger manual desde fuera (ej. pull-to-refresh).
   * NO muestra banner porque viene de un gesto explícito del usuario
   * (la pantalla ya muestra su propio spinner de pull-to-refresh).
   */
  const forceRefresh = async () => {
    const result = await fullRefresh();
    if (!result.tokenAlive) {
      await handleDeadToken();
      return;
    }
    emitRefreshEvent();
  };

  // ——————————————————————————————————————————
  // Listener de AppState
  // ——————————————————————————————————————————
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
        // No await: que se ejecute sin bloquear el hilo del evento
        performRefresh(backgroundDurationMs);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
      if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
    };
  }, []);

  return (
    <AppStateCtx.Provider value={{ forceRefresh, isRefreshing }}>
      {children}
      {/* Banner sutil de "Actualizando…" — NO bloqueante (pointerEvents none).
          Solo aparece en refresh completo (> 30 min). La app sigue usable. */}
      {showBanner && (
        <Animated.View
          style={[styles.bannerWrap, { opacity: bannerOpacity }]}
          pointerEvents="none"
        >
          <View style={styles.bannerPill}>
            <ActivityIndicator size="small" color="#10B981" />
            <Text style={styles.bannerText}>Actualizando…</Text>
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
  // Banner sutil arriba — no ocupa toda la pantalla, no bloquea toques
  bannerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 60,
    zIndex: 9999,
    elevation: 9999,
  },
  bannerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0F172A',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  bannerText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
