import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { slug, clientName, clientPhone, serviceName, serviceId, date, startTime, endTime, serviceCost, notes } = await req.json()

    if (!slug || !clientName || !clientPhone || !serviceName || !date || !startTime) {
      return new Response(JSON.stringify({ error: 'Faltan campos requeridos' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const { data: link, error: linkError } = await supabase
      .from('booking_links')
      .select('id, user_id, require_approval, is_active')
      .eq('slug', slug)
      .single()

    if (linkError || !link || !link.is_active) {
      return new Response(JSON.stringify({ error: 'Link no encontrado o inactivo' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // AUTO-CONFIRM: require_approval=false por default → cita queda Confirmada directamente
    // Solo usa 'Solicitud' si el negocio activó aprobación manual en Settings
    const status = link.require_approval ? 'Solicitud' : 'Confirmada'

    const { data: appointment, error: aptError } = await supabase
      .from('appointments')
      .insert({
        user_id: link.user_id,
        client_name_temp: clientName.trim(),
        client_phone_temp: clientPhone.trim(),
        service_name: serviceName,
        date,
        start_time: startTime,
        end_time: endTime,
        status,
        notes: notes || null,
        service_cost: serviceCost || 0,
        source: 'public_link',
        whatsapp_notification: true,
      })
      .select('id, status')
      .single()

    if (aptError) {
      console.error('[create-booking-request] Insert error:', aptError)
      return new Response(JSON.stringify({ error: aptError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(
      JSON.stringify({ success: true, appointmentId: appointment.id, status: appointment.status }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('[create-booking-request]', error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
