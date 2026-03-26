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

## Sistema de pagos dual (CRÍTICO — leer antes de tocar reports.tsx o queries de finanzas)
La DB tiene DOS sistemas de pago coexistiendo:

### Sistema legacy (citas anteriores a 2026-03-25)
- `status = 'Pagado'` — ya cobradas por definición, NO tienen campo `paid`.
- En la DB hay ~16 citas con este status, $8,100 en total.

### Sistema nuevo (citas desde 2026-03-25)
- `status = 'Completada'` + campo `paid` booleano.
- `paid = false` o `NULL` → pendiente de cobro.
- `paid = true` → cobrada.
- Staff registra el pago desde `staff-app/appointment/[id].tsx`.

### Queries correctas en reports.tsx
- `monthRevenue` (Cobrado) = citas `status='Pagado'` DEL MES + citas `status='Completada' AND paid=true` DEL MES.
- `pendingRevenue` (Por cobrar) = citas `status='Completada' AND (paid IS NULL OR paid=false)` DEL MES.
- Las citas `status='Pagado'` NUNCA van en pendingRevenue — ya están cobradas.

### Queries correctas en (home)/index.tsx
- Sección "Cobros pendientes": `status='Completada' AND (paid IS NULL OR paid=false)` — NO incluir 'Pagado'.

## Flujo de pagos completo
- Cita completada → staff marca "Completar" → `status='Completada'`, `paid=false`.
- Staff opcionalmente registra pago → `paid=true`.
- Dueño ve "Cobros pendientes" en Inicio → puede marcar "Cobrado" → `paid=true`.
- Dueño ve finanzas en Reportes → "Cobrado" suma legacy+nuevo, "Por cobrar" solo nuevo sin pagar.

## Estados de cita válidos
`Pendiente`, `Confirmada`, `Completada`, `Cancelada`, `No asistió`, `Reagendada`, `Pagado` (legacy).
- `NON_CANCELLABLE = ['Cancelada', 'Completada', 'No asistió']` — no mostrar botón cancelar en estos.
- Reagendada SÍ puede cancelarse.

## Caché en memoria
- `utils/cache.ts` — caché en memoria con TTL. NO usa AsyncStorage.
- Claves principales: `dashboard_stats` (30s), `today_appointments` (30s), `reports_stats` (60s).
- `loadUnpaidAppointments` NO usa caché — siempre va directo a Supabase.
- `loadDashboardData(userId)` recibe userId explícito como parámetro (no del closure).
- El pull-to-refresh usa `userIdRef.current` para evitar closures stale.

## Supabase
- Tabla `appointments` ya tiene Realtime habilitado en publicación `supabase_realtime`.
- El channel de Realtime NO usa filtro de columna (incompatible con Free tier) — filtra `user_id` en el callback.
- RLS activo. Edge Functions: deshabilitar "Verify JWT with legacy secret" cuando usan service role key.
- `supabase.functions.invoke` devuelve errores reales en `data?.error`, no en `error`.

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
