
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Dominio de envío: cambiar a tu dominio verificado en Resend cuando esté listo.
// Mientras tanto, solo llega al email de tu cuenta de Resend (modo sandbox).
// Para activar envío real: verifica vylta.lat en https://resend.com/domains
const FROM_DOMAIN = Deno.env.get('RESEND_FROM_DOMAIN') ?? 'onboarding@resend.dev'

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
    // Validar que RESEND_API_KEY existe
    if (!RESEND_API_KEY) {
      console.error('[send-campaign] RESEND_API_KEY no configurada en Secrets')
      return json({ error: 'RESEND_API_KEY no configurada. Añádela en Edge Functions > Secrets.' }, 500)
    }

    const payload = await req.json()
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    let campaignId: string
    let userId: string
    let subject: string
    let body: string
    let segment: string

    // Modo 1: enviar borrador ya guardado (por campaignId)
    // Modo 2: datos directos desde la app (crea registro aquí)
    if (payload.campaignId) {
      campaignId = payload.campaignId
      const { data: campaign, error: campError } = await supabase
        .from('email_campaigns').select('*').eq('id', campaignId).single()
      if (campError) throw new Error(`Error cargando campaña: ${campError.message}`)
      userId  = campaign.user_id
      subject = campaign.subject
      body    = campaign.body
      segment = campaign.segment
    } else if (payload.userId && payload.subject && payload.body) {
      userId  = payload.userId
      subject = payload.subject
      body    = payload.body
      segment = payload.segment || 'todos'
      const { data: newCampaign, error: insertError } = await supabase
        .from('email_campaigns').insert({
          user_id: userId, subject, body, segment,
          status: 'borrador', recipient_count: payload.recipientCount || 0,
        }).select().single()
      if (insertError) throw new Error(`Error creando campaña: ${insertError.message}`)
      campaignId = newCampaign.id
    } else {
      throw new Error('Parámetros requeridos: campaignId O (userId + subject + body)')
    }

    // Obtener nombre del negocio
    const { data: business } = await supabase
      .from('business_profiles').select('business_name').eq('user_id', userId).single()
    const businessName = business?.business_name || 'VYLTA'

    // Determinar remitente
    // Si FROM_DOMAIN es el sandbox, advertir en logs
    const fromAddress = FROM_DOMAIN.includes('onboarding@resend.dev')
      ? 'onboarding@resend.dev'
      : `noreply@${FROM_DOMAIN}`
    const fromField = `${businessName} <${fromAddress}>`

    if (FROM_DOMAIN.includes('onboarding@resend.dev')) {
      console.warn(
        '[send-campaign] ADVERTENCIA: Usando onboarding@resend.dev (modo sandbox). ' +
        'Los correos solo llegarán al email de tu cuenta Resend. ' +
        'Para envío real, agrega RESEND_FROM_DOMAIN en Secrets con tu dominio verificado (ej: vylta.lat)'
      )
    }

    // Obtener clientes con email según segmento
    let query = supabase.from('clients').select('id, name, email')
      .eq('user_id', userId)
      .not('email', 'is', null)
      .neq('email', '')
    if (segment === 'activos') query = query.eq('is_active', true)
    else if (segment === 'inactivos') {
      const d90 = new Date(); d90.setDate(d90.getDate() - 90)
      query = query.lt('last_visit', d90.toISOString().split('T')[0])
    }

    const { data: clients, error: clientsError } = await query
    if (clientsError) throw new Error(`Error obteniendo clientes: ${clientsError.message}`)
    if (!clients || clients.length === 0) {
      throw new Error(
        'No hay clientes con email registrado para este segmento. ' +
        'Asegúrate de que tus clientes tienen email guardado en su perfil.'
      )
    }

    console.log(`[send-campaign] Enviando a ${clients.length} clientes | segmento: ${segment} | from: ${fromField}`)

    // Enviar en lotes de 50 — loguear cada error de Resend
    let sent    = 0
    let failed  = 0
    const errors: string[] = []

    for (let i = 0; i < clients.length; i += 50) {
      const batch = clients.slice(i, i + 50)

      const results = await Promise.allSettled(batch.map(async (client: any) => {
        const personalizedSubject = subject
          .replace(/\{\{nombre\}\}/g, client.name || '')
          .replace(/\{\{negocio\}\}/g, businessName)
        const personalizedBody = body
          .replace(/\{\{nombre\}\}/g, client.name || '')
          .replace(/\{\{negocio\}\}/g, businessName)

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from:    fromField,
            to:      [client.email],
            subject: personalizedSubject,
            text:    personalizedBody,
            html:    buildEmailHtml(personalizedSubject, personalizedBody, businessName),
          }),
        })

        // Capturar respuesta de Resend para loguear errores
        const resBody = await res.json().catch(() => ({}))

        if (!res.ok) {
          const errMsg = `${client.email}: HTTP ${res.status} - ${JSON.stringify(resBody)}`
          console.error(`[send-campaign] Error Resend: ${errMsg}`)
          throw new Error(errMsg)
        }

        console.log(`[send-campaign] Enviado OK a ${client.email}`)
        return resBody
      }))

      for (const r of results) {
        if (r.status === 'fulfilled') sent++
        else {
          failed++
          errors.push(r.reason?.message || 'Error desconocido')
        }
      }
    }

    console.log(`[send-campaign] Resultado: ${sent} enviados, ${failed} fallidos`)
    if (errors.length > 0) {
      console.error(`[send-campaign] Errores: ${errors.slice(0, 5).join(' | ')}`)
    }

    // Actualizar registro de campaña
    await supabase.from('email_campaigns').update({
      status:          sent > 0 ? 'enviada' : 'error',
      sent_at:         new Date().toISOString(),
      recipient_count: sent,
    }).eq('id', campaignId)

    // Si todo falló (modo sandbox bloqueando envíos), retornar error claro
    if (sent === 0 && failed > 0) {
      const isSandboxError = errors.some(e =>
        e.includes('403') || e.includes('domain') || e.includes('not verified') || e.includes('testing')
      )
      return json({
        error: isSandboxError
          ? 'Tu dominio de envío no está verificado en Resend. ' +
            'En modo sandbox solo llegan correos a tu propio email. ' +
            'Verifica un dominio en https://resend.com/domains y agrégalo como RESEND_FROM_DOMAIN en los Secrets de Supabase.'
          : `Error enviando. Primeros errores: ${errors.slice(0, 2).join(' | ')}`,
        sent:   0,
        failed,
      }, 400)
    }

    return json({ success: true, sent, failed })

  } catch (error: any) {
    console.error('[send-campaign] Error general:', error.message)
    return json({ error: error.message }, 400)
  }
})

function buildEmailHtml(subject: string, body: string, businessName: string): string {
  const lines = body
    .split('\n')
    .map(l => `<p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#374151;">${l || '&nbsp;'}</p>`)
    .join('')
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0;">
        <tr><td style="background:#6366F1;padding:28px 36px;">
          <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">${businessName}</p>
        </td></tr>
        <tr><td style="padding:32px 36px 8px;">
          <h1 style="margin:0;font-size:22px;font-weight:700;color:#0F172A;line-height:1.3;">${subject}</h1>
        </td></tr>
        <tr><td style="padding:16px 36px 32px;">${lines}</td></tr>
        <tr><td style="background:#F8FAFC;padding:20px 36px;border-top:1px solid #E2E8F0;">
          <p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">
            Enviado por <strong style="color:#6366F1;">${businessName}</strong> a través de <strong>VYLTA</strong>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
