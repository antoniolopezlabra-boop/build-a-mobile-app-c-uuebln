import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const {
      slug, clientName, clientPhone,
      serviceName, serviceId,
      date, startTime, endTime,
      serviceCost, notes,
    } = await req.json()

    // ── Validaciones básicas ──────────────────────────────────────────────
    if (!slug || !clientName || !clientPhone || !serviceName || !date || !startTime || !endTime) {
      return json({ error: 'Faltan campos requeridos' }, 400)
    }

    // FIX: validar teléfono mínimo — al menos 7 dígitos numéricos
    const phoneDigits = clientPhone.replace(/\D/g, '')
    if (phoneDigits.length < 7) {
      return json({ error: 'Número de teléfono inválido' }, 400)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // ── Verificar que el link existe y está activo ────────────────────────
    const { data: link, error: linkError } = await supabase
      .from('booking_links')
      .select('id, user_id, require_approval, is_active, whatsapp_confirmation')
      .eq('slug', slug)
      .single()

    if (linkError || !link || !link.is_active) {
      return json({ error: 'Link no encontrado o inactivo' }, 404)
    }

    // FIX: verificar disponibilidad del slot ANTES de insertar
    // Evita doble-booking cuando dos clientes eligen el mismo horario simultáneamente
    const { data: conflict } = await supabase
      .from('appointments')
      .select('id')
      .eq('user_id', link.user_id)
      .eq('date', date)
      .not('status', 'in', '("Cancelada","No asistió","Rechazada")')
      .or(`and(start_time.lt.${endTime},end_time.gt.${startTime})`)
      .limit(1)

    if (conflict && conflict.length > 0) {
      return json({
        error: 'Lo sentimos, ese horario acaba de ser reservado. Por favor elige otro.',
        code: 'SLOT_TAKEN',
      }, 409)
    }

    // FIX: usar whatsapp_confirmation del link, no hardcodear true
    const whatsappNotification = link.whatsapp_confirmation ?? true

    // AUTO-CONFIRM: require_approval=false → cita queda Confirmada directamente
    // Solo usa 'Solicitud' si el negocio activó aprobación manual
    const status = link.require_approval ? 'Solicitud' : 'Confirmada'

    const { data: appointment, error: aptError } = await supabase
      .from('appointments')
      .insert({
        user_id:            link.user_id,
        client_name_temp:   clientName.trim(),
        client_phone_temp:  clientPhone.trim(),
        service_name:       serviceName,
        service_id:         serviceId || null,
        date,
        start_time:         startTime,
        end_time:           endTime,
        status,
        notes:              notes || null,
        service_cost:       serviceCost || 0,
        source:             'public_link',
        whatsapp_notification: whatsappNotification,
      })
      .select('id, status')
      .single()

    if (aptError) {
      console.error('[create-booking-request] Insert error:', aptError)
      // Manejar posible race condition de unique constraint a nivel DB
      if (aptError.code === '23505') {
        return json({
          error: 'Lo sentimos, ese horario acaba de ser reservado. Por favor elige otro.',
          code: 'SLOT_TAKEN',
        }, 409)
      }
      return json({ error: aptError.message }, 500)
    }

    return json({
      success: true,
      appointmentId: appointment.id,
      status: appointment.status,
    })

  } catch (error: any) {
    console.error('[create-booking-request]', error.message)
    return json({ error: error.message }, 500)
  }
})
