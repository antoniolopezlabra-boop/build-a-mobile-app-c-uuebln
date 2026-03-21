# VYLTA — Estado BD y Deuda Técnica

> Revisión: Mar 2026 — post simplificación arquitectural

---

## Columnas huérfanas (bajo riesgo, no eliminar ahora)

### Tabla `whatsapp_config`

| Columna | Estado | Razón |
|---------|--------|---------|
| `phone_number` | 🟡 Huérfana | Con arquitectura simplificada, no se registra número propio del negocio. La columna existe pero nunca se llenará. |
| `api_key` | 🟡 Huérfana | Idem. Era para almacenar el token de 360dialog del negocio. |
| `is_connected` | 🟡 Reclasificar | Ya no refleja “número conectado” sino “recordatorios activos”. Reusable sin cambio de schema. |

**Acción recomendada:** No migrar ahora. Cuando se libere v2, hacer ALTER TABLE DROP COLUMN en una migración limpia.

---

## Tablas activas y su uso actual

| Tabla | Uso | Estado |
|-------|-----|--------|
| `appointments` | Core — todas las citas | ✅ Activa |
| `clients` | Core — todos los clientes | ✅ Activa |
| `services` | Catálogo de servicios | ✅ Activa |
| `business_profiles` | Perfil, logo, horarios | ✅ Activa |
| `business_hours` | Horarios por día | ✅ Activa |
| `booking_links` | Link público de citas | ✅ Activa — canal principal |
| `subscription_plans` | Plan del usuario | ✅ Activa |
| `whatsapp_config` | Toggles de recordatorios | ✅ Activa (con columnas huérfanas) |
| `user_sessions` | Tracking de última sesión | ✅ Activa |

---

## Campos clave en `appointments`

Estos campos soportan el flujo del link público:

| Campo | Descripción |
|-------|-------------|
| `client_name_temp` | Nombre del cliente cuando viene del link (antes de guardarlo) |
| `client_phone_temp` | Teléfono del cliente desde el link |
| `source` | `'app'` o `'public_link'` |
| `client_id` | NULL si es del link y aún no se guardó como cliente, FK si ya se guardó |

---

## Edge Functions activas

| Función | Uso |
|---------|-----|
| `create-booking-request` | Crea cita desde book.html (link público) — canal principal |
| `stripe-webhook` | Procesa eventos de Stripe (pago, cancelación) |
| `send-campaign` | Envía campañas de email vía Resend (Plan Premium) |
| `create-promo-code` | Genera códigos promocionales |

---

## Recomendaciones pendientes

1. **No hacer migraciones de columnas huérfanas** hasta tener 10+ clientes pagando.
2. **Agregar índice** en `appointments(user_id, date)` cuando el volumen crezca.
3. **Agregar índice** en `appointments(date, start_time)` para los workflows de n8n (queries por fecha/hora).
