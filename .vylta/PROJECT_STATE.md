# VYLTA — Estado técnico del proyecto
> Actualizado: 2026-03-25. Leer SIEMPRE al inicio de una nueva conversación antes de tocar código.

## Stack
- React Native + Expo Router v3 + TypeScript
- Supabase (São Paulo, ref: `nhjmwmkaduiaifgztymi`)
- n8n Cloud + Stripe + Resend
- GitHub repo: `antoniolopezlabra-boop/build-a-mobile-app-c-uuebln`
- MacBook Air (Homebrew). Actualizar Claude: `brew upgrade --cask claude`
- App en celular corre via Expo Go (QR). Para forzar bundle nuevo: `npx expo start --clear` + escanear QR.
- Git workflow: Claude hace push al repo → Antonio corre `git fetch origin && git checkout origin/main -- <archivo>` → recarga Expo con `r`.

## Arquitectura de navegación (CRÍTICO)
- El layout de tabs usa `Stack` de Expo Router + `FloatingTabBar` custom (NO el `Tabs` nativo).
- `FloatingTabBar` navega con `router.replace` — esto NO desmonta pantallas ni dispara `useFocusEffect`.
- Para detectar regreso a Home: usar `usePathname()` + `AppState` + `useEffect`, NO `useFocusEffect`.
- El dueño tiene 5 tabs: Inicio `(home)/index.tsx`, Citas `appointments.tsx`, Clientes `clients.tsx`, **Reportes `reports.tsx`**, Ajustes `settings.tsx`.

## Usuarios / roles
- **Dueño del negocio**: app principal `(tabs)/`. Login con email/password.
- **Colaborador (staff)**: app separada `staff-app/`. Login con credenciales de staff.
- Staff ve SOLO sus citas. No ve citas ajenas (muestra `••••••`).

## Módulo staff-app (archivos clave)
- `app/staff-app/index.tsx` — Agenda del colaborador con calendario mensual y lista de citas del día.
- `app/staff-app/appointment/[id].tsx` — Detalle de cita del colaborador.
- `app/staff-app/new-appointment.tsx` — Crear nueva cita desde staff.
- `app/staff-app/profile.tsx` — Perfil del colaborador.

## Flujo de pagos (implementado 2026-03-25)
- Cita completada → `paid = false` en DB.
- **Staff puede registrar el pago** desde `staff-app/appointment/[id].tsx` → botón "Registrar pago" → `paid = true`.
- **Dueño ve adeudos** en `(home)/index.tsx` sección "Cobros pendientes" — query: `status = Completada AND (paid IS NULL OR paid = false)`.
- **Dueño también ve adeudos** en `reports.tsx` → widget "Por cobrar" en FINANZAS DEL MES.
- `reports.tsx` tiene DOS queries financieras:
  - `monthRevenue`: `status = Completada AND paid = true` (cobrado)
  - `pendingRevenue`: `status = Completada AND (paid IS NULL OR paid = false)` (por cobrar)
  - **BUG CORREGIDO 2026-03-25**: antes `pendingRevenue` no filtraba `paid`, sumaba TODO lo Completado.
- Estados de cita: `Pendiente`, `Confirmada`, `Completada`, `Cancelada`, `No asistió`, `Reagendada`.
- `NON_CANCELLABLE = ['Cancelada', 'Completada', 'No asistió']` — no mostrar botón cancelar en estos.

## Caché en memoria
- `utils/cache.ts` — caché en memoria con TTL. NO usa AsyncStorage.
- Claves principales: `dashboard_stats` (30s), `today_appointments` (30s), `reports_stats` (60s).
- `loadUnpaidAppointments` NO usa caché — siempre va directo a Supabase.
- El pull-to-refresh llama `handleRefresh` que usa `userIdRef.current` (no closure).

## Supabase
- Tabla `appointments` ya tiene Realtime habilitado en publicación `supabase_realtime`.
- El channel de Realtime NO usa filtro de columna (incompatible con Free tier) — filtra `user_id` en el callback.
- RLS activo. Edge Functions: deshabilitar "Verify JWT with legacy secret" cuando usan service role key.

## Bugs conocidos pendientes
- `book.html`: sin validación de teléfono, doble-submit posible, sin meta tags OG, sin límite plan Gratuito.
- `staff-app/index.tsx`: FAB bottom con safe area (fix pendiente de aplicar en celular).
- `staff-app/profile.tsx`: modal contraseña + toggle mostrar/ocultar.

## Notas iOS críticas
- NUNCA usar `SafeAreaView` dentro de `Modal` en iOS → usar `useSafeAreaInsets` + `paddingTop`/`paddingBottom` manual en `View` plano.
- `DateTimePicker` dentro de `Modal` en iOS produce pantalla en blanco → renderizar paneles como overlays separados fuera del Modal.

## Beta
- 2 clientes activos: Karen (`karen-nails-star-heart`) y Antonio (`vylta-demo`).
- Supabase Free tier. Al primer cliente pagador → upgrade a Pro (~$25 USD/mes).
- Distribución: APK directo para Android + Expo Go para beta. Sin App Store/Play Store por ahora.
