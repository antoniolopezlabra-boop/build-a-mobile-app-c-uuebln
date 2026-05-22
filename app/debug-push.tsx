import { Redirect } from 'expo-router';

// ══════════════════════════════════════════════════════════════════
// /debug-push - DEPRECATED
//
// Esta pantalla fue creada temporalmente el 21 de mayo 2026 para
// diagnosticar un bug de push notifications en Android. Ya no es necesaria.
//
// La pantalla equivalente y mejor diseñada es /settings/test-push, que
// está accesible desde Settings → SOPORTE → "Probar notificaciones".
//
// Mantenemos este archivo como Redirect para no romper deep links viejos.
// Puede borrarse físicamente del repo en una limpieza futura con:
//   rm app/debug-push.tsx
// ══════════════════════════════════════════════════════════════════

export default function DebugPushDeprecated() {
  return <Redirect href="/settings/test-push" />;
}
