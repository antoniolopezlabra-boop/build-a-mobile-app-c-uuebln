import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

const SUPABASE_URL = 'https://nhjmwmkaduiaifgztymi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oam13bWthZHVpYWlmZ3p0eW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODk3MTYsImV4cCI6MjA4ODE2NTcxNn0.p53BZPf6qygAYw29bIJ0bA5VwZ_lRxw-aocV8LuGB1c';

// ═════════════════════════════════════════════════════════════════════════
// FIX DEFINITIVO (app colgada al volver de background, ago 2026)
//
// CAUSA RAÍZ que quedaba sin cubrir:
//   `fetch` en React Native NO tiene timeout. Cuando el SO manda la app a
//   background, el sistema cierra silenciosamente los sockets TCP abiertos
//   (o cambia de WiFi a datos). Al volver, la petición sale por un socket
//   muerto y la promesa NUNCA resuelve ni rechaza: se queda colgada para
//   siempre. La pantalla muestra su spinner eternamente y el usuario no
//   tiene más salida que matar la app (al reiniciar se crean sockets nuevos).
//
//   Por eso el watchdog del AppStateContext no bastaba: ese quita el splash,
//   pero las queries de cada pantalla seguían colgadas por su cuenta.
//
// SOLUCIÓN: envolver fetch con AbortController. Ninguna petición puede
// quedarse colgada: a los N segundos aborta y RECHAZA, así el `catch` de
// cada pantalla se ejecuta y la UI sale del estado de carga (muestra error
// o reintenta) en vez de "pensar" indefinidamente.
//
// Cubre TODO lo que pasa por el cliente: queries, RPC, auth y storage.
// ═════════════════════════════════════════════════════════════════════════
const REQUEST_TIMEOUT_MS = 15_000;  // queries, RPC y auth
const UPLOAD_TIMEOUT_MS = 60_000;   // subidas (logo, adjuntos) en red lenta

function isUpload(init?: RequestInit): boolean {
  const body: any = init?.body;
  if (!body) return false;
  // FormData / Blob / ArrayBuffer => es una subida de archivo
  return (
    (typeof FormData !== 'undefined' && body instanceof FormData) ||
    (typeof Blob !== 'undefined' && body instanceof Blob) ||
    body instanceof ArrayBuffer
  );
}

const fetchWithTimeout: typeof fetch = async (input, init) => {
  const timeoutMs = isUpload(init) ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  const controller = new AbortController();

  // Si quien llama ya trae su propio signal, lo encadenamos para no perderlo.
  const externalSignal = init?.signal;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input as any, { ...init, signal: controller.signal });
  } catch (err: any) {
    // Normalizamos el abort a un error de red legible para la UI.
    if (err?.name === 'AbortError') {
      throw new Error('La conexión tardó demasiado. Revisa tu internet e inténtalo de nuevo.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: fetchWithTimeout,
  },
});

// ═════════════════════════════════════════════════════════════════════════
// FIX (cuelgue al volver de background, jun 2026)
//
// Supabase renueva el access token con un setInterval interno. En React Native
// ese timer se SUSPENDE cuando el SO manda la app a background (congela el motor
// JS). Si la app pasa la noche minimizada, al volver el timer está muerto: el
// access token quedó expirado y el cliente NO lo renueva solo → cualquier query
// o getUser/getSession se queda colgado y la pantalla "piensa" infinito.
//
// La guía oficial de Supabase para RN exige pausar/reanudar el auto-refresh con
// el ciclo de vida de la app:
//   • app 'active'  -> startAutoRefresh()  (renueva mientras esté en pantalla)
//   • cualquier otro -> stopAutoRefresh()  (no malgasta timers en background)
// Ref: https://supabase.com/docs/reference/javascript/auth-startautorefresh
// ═════════════════════════════════════════════════════════════════════════
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

// Arrancar de inmediato si la app abre ya en primer plano.
if (AppState.currentState === 'active') {
  supabase.auth.startAutoRefresh();
}
