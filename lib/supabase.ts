import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

const SUPABASE_URL = 'https://nhjmwmkaduiaifgztymi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oam13bWthZHVpYWlmZ3p0eW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODk3MTYsImV4cCI6MjA4ODE2NTcxNn0.p53BZPf6qygAYw29bIJ0bA5VwZ_lRxw-aocV8LuGB1c';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
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
