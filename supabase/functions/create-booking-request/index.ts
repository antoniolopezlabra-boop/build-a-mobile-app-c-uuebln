import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsForWeb, handleCorsPreflightRequest } from '../_shared/cors.ts'
import { checkRateLimits, getClientIp } from '../_shared/rate-limit.ts'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const GRATUITO_MONTHLY_LIMIT = 10

// Helpers para validación de bloqueos de tiempo
function timeToMin(t: string): number {
  const [h, m] = (t || '00:00').split(':').map(Number)
  return h * 60 + m
}
function rangesOverlap(aS: number, aE: number, bS: number, bE: number): boolean {
  return aS < bE && aE > bS
}

serve(async (req) => {
  // CORS: esta función es llamada desde book.vylta.lat (web pública)
  const corsHeaders = corsForWeb(req)
  const preflight = handleCorsPreflightRequest(req, corsHeaders)
  if (preflight) return preflight

  function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
    })
  }

  try {
    const {
      slug, clientName, clientPhone,
      serviceName,
      date, startTime, endTime,
      serviceCost, notes,
      staff_id,
    } = await req.json()

    // Validaciones básicas
    if (!slug || !clientName || !clientPhone || !serviceName || !date || !startTime || !endTime) {
      return json({ error: 'Faltan campos requeridos' }, 400)
    }

    const phoneDigits = clientPhone.replace(/\D/g, '')
    if (phoneDigits.length < 7) {
      return json({ error: 'Número de teléfono inválido' }, 400)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // ── RATE LIMITING ──────────────────────────────────────────────────
    // Aplicado ANTES de cualquier query de DB pesada para que un atacante
    // no pueda saturar la DB enviando requests masivos.
    //
    // Reglas (defensa en capas):
    //   - IP:    5/min  +  20/hora  → para tráfico distribuido por IP
    //   - Slug:  30/hora             → limita daño por negocio target
    //   - Phone: 3/día               → evita spam con un solo número
    //
    // Si alguna se excede → HTTP 429 con Retry-After.
    const clientIp = getClientIp(req)
    const rateCheck = await checkRateLimits(supabase, [
      { dimension: 'ip',    identifier: clientIp,    window: 'minute', limit: 5  },
      { dimension: 'ip',    identifier: clientIp,    window: 'hour',   limit: 20 },
      { dimension: 'slug',  identifier: slug,        window: 'hour',   limit: 30 },
      { dimension: 'phone', identifier: phoneDigits, window: 'day',    limit: 3  },
    ])

    if (!rateCheck.allowed) {
      return json(
        {
          error: rateCheck.message,
          code: 'RATE_LIMITED',
          retryAfter: rateCheck.retryAfterSeconds,
        },
        429,
        { 'Retry-After': String(rateCheck.retryAfterSeconds) }
      )
    }
    // ────────────────────────────────────────────────────────────────────

    // Verificar que el link existe y está activo
    const { data: link, error: linkError } = await supabase
      .from('booking_links')
      .select('id, user_id, require_approval, is_active, whatsapp_confirmation')
      .eq('slug', slug)
      .single()

    if (linkError || !link || !link.is_active) {
      return json({ error: 'Link no encontrado o inactivo' }, 404)
    }

    // ── Verificar límite del plan Gratuito ──────────────────────────────
    //
    // ⚡ FIX BUG (May 19 2026): se eliminó el filtro
    //    .not('status', 'in', '("Cancelada","No asistió","Rechazada")')
    // para que TODAS las citas creadas en el mes cuenten para el límite,
    // incluyendo las canceladas. Razones:
    //   1. CONSISTENCIA con contexts/useGratuitoUsage.tsx (contador del
    //      home) y utils/api.ts (backend de la app móvil).
    //   2. ANTI-ABUSO: sin este cambio, un cliente externo (vía link
    //      público) podría crear cita 11 si una previa fue cancelada.
    //   3. ESTÁNDAR SaaS: los recursos creados consumen cuota, las
    //      cancelaciones no devuelven crédito.
    //
    const { data: sub } = await supabase
      .from('subscription_plans')
      .select('plan_type, status')
      .eq('user_id', link.user_id)
      .single()

    const planType = sub?.plan_type?.toLowerCase() ?? 'gratuito'
    const isGratuito = planType === 'gratuito'

    if (isGratuito) {
      const now        = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const lastDay    = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      const monthEnd   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

      // NOTA: Sin filtro de status — TODAS las citas del mes cuentan
      const { count } = await supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', link.user_id)
        .gte('date', monthStart)
        .lte('date', monthEnd)

      if ((count ?? 0) >= GRATUITO_MONTHLY_LIMIT) {
        return json({
          error: 'Este negocio ha alcanzado su límite de citas este mes. Intenta contactarlos directamente por WhatsApp.',
          code: 'PLAN_LIMIT_REACHED',
        }, 403)
      }
    }
    // ────────────────────────────────────────────────────────────────────

    // ── Verificar disponibilidad del slot vs citas existentes ──
    // NOTA: SÍ excluye canceladas — un slot cancelado SÍ libera el horario
    // para volver a reservarse.
    let conflictQuery = supabase
      .from('appointments')
      .select('id')
      .eq('user_id', link.user_id)
      .eq('date', date)
      .not('status', 'in', '("Cancelada","No asistió","Rechazada")')
      .or(`and(start_time.lt.${endTime},end_time.gt.${startTime})`)
      .limit(1)

    if (staff_id) {
      conflictQuery = conflictQuery.eq('staff_id', staff_id)
    }

    const { data: conflict } = await conflictQuery

    if (conflict && conflict.length > 0) {
      return json({
        error: 'Lo sentimos, ese horario acaba de ser reservado. Por favor elige otro.',
        code: 'SLOT_TAKEN',
      }, 409)
    }

    // ── Verificar bloqueos de tiempo (comida, descansos) ──
    // Resuelve dos riesgos:
    //   1. Cliente manipulado pasando un horario que cae en comida.
    //   2. UI desactualizada (el negocio creó un bloqueo después de que el
    //      cliente cargó la página pero antes de presionar Confirmar).
    //
    // Lógica:
    //   - Bloqueos con staff_id NULL aplican a TODOS (negocio entero).
    //   - Bloqueos con staff_id específico solo aplican al staff del slot.
    //   - Recurrentes filtran por day_of_week (convención: 0=Lun..6=Dom).
    //   - No recurrentes filtran por specific_date.
    //
    // Convertimos el date string YYYY-MM-DD a day_of_week con la convención
    // del proyecto (0=Lunes..6=Domingo). JS getDay() es 0=Domingo..6=Sábado.
    const [yy, mm, dd] = date.split('-').map(Number)
    const jsDate = new Date(yy, mm - 1, dd, 12, 0, 0)
    const jsDay = jsDate.getDay() // 0=Dom..6=Sab
    const projectDay = jsDay === 0 ? 6 : jsDay - 1 // 0=Lun..6=Dom

    // Filtro: bloqueos generales (staff_id null) + bloqueos del staff del slot
    let staffFilter = 'staff_id.is.null'
    if (staff_id) {
      staffFilter = `staff_id.is.null,staff_id.eq.${staff_id}`
    }

    const { data: blocks, error: blocksErr } = await supabase
      .from('time_blocks')
      .select('id, label, staff_id, start_time, end_time, is_recurring, day_of_week, specific_date')
      .eq('user_id', link.user_id)
      .eq('is_active', true)
      .or(staffFilter)

    if (blocksErr) {
      console.warn('[create-booking-request] time_blocks query error:', blocksErr)
      // No bloqueamos por error de DB para no afectar UX, pero registramos.
    } else if (blocks && blocks.length > 0) {
      const startMin = timeToMin(startTime)
      const endMin   = timeToMin(endTime)

      for (const b of blocks) {
        // Aplicabilidad temporal
        if (b.is_recurring) {
          if (b.day_of_week !== projectDay) continue
        } else {
          if (b.specific_date !== date) continue
        }

        const bStart = timeToMin(b.start_time)
        const bEnd   = timeToMin(b.end_time)

        if (rangesOverlap(startMin, endMin, bStart, bEnd)) {
          return json({
            error: `Ese horario está bloqueado: "${b.label}" (${b.start_time.slice(0,5)}-${b.end_time.slice(0,5)}). Por favor elige otro horario.`,
            code: 'SLOT_BLOCKED',
          }, 409)
        }
      }
    }
    // ────────────────────────────────────────────────────────────────────

    const whatsappNotification = link.whatsapp_confirmation ?? true
    const status = link.require_approval ? 'Solicitud' : 'Confirmada'

    const { data: appointment, error: aptError } = await supabase
      .from('appointments')
      .insert({
        user_id:               link.user_id,
        client_name_temp:      clientName.trim(),
        client_phone_temp:     clientPhone.trim(),
        service_name:          serviceName,
        date,
        start_time:            startTime,
        end_time:              endTime,
        status,
        notes:                 notes    || null,
        service_cost:          serviceCost || 0,
        source:                'public_link',
        whatsapp_notification: whatsappNotification,
        staff_id:              staff_id || null,
      })
      .select('id, status')
      .single()

    if (aptError) {
      console.error('[create-booking-request] Insert error:', aptError)
      if (aptError.code === '23505') {
        return json({
          error: 'Lo sentimos, ese horario acaba de ser reservado. Por favor elige otro.',
          code: 'SLOT_TAKEN',
        }, 409)
      }
      return json({ error: aptError.message }, 500)
    }

    return json({
      success:       true,
      appointmentId: appointment.id,
      status:        appointment.status,
    })

  } catch (error: any) {
    console.error('[create-booking-request]', error.message)
    return json({ error: error.message }, 500)
  }
})
