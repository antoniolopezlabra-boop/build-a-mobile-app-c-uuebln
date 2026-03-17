
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const payload = await req.json()
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    let campaignId: string
    let userId: string
    let subject: string
    let body: string
    let segment: string

    // FIX: soportar dos modos de invocación:
    // 1. Con campaignId ya existente (borrador guardado)
    // 2. Con datos directos (nuevo flujo — crea el registro aquí)
    if (payload.campaignId) {
      campaignId = payload.campaignId
      const { data: campaign, error: campError } = await supabase
        .from('email_campaigns').select('*').eq('id', campaignId).single()
      if (campError) throw new Error(`Error campaña: ${campError.message}`)
      userId = campaign.user_id
      subject = campaign.subject
      body = campaign.body
      segment = campaign.segment
    } else if (payload.userId && payload.subject && payload.body) {
      // Crear el registro de campaña en esta función
      userId = payload.userId
      subject = payload.subject
      body = payload.body
      segment = payload.segment || 'todos'
      const { data: newCampaign, error: insertError } = await supabase
        .from('email_campaigns').insert({
          user_id: userId, subject, body, segment,
          status: 'borrador', recipient_count: payload.recipientCount || 0,
        }).select().single()
      if (insertError) throw new Error(`Error creando campaña: ${insertError.message}`)
      campaignId = newCampaign.id
    } else {
      throw new Error('Parámetros requeridos: campaignId O (userId, subject, body)')
    }

    // Obtener nombre del negocio
    const { data: business } = await supabase
      .from('business_profiles').select('business_name').eq('user_id', userId).single()
    const businessName = business?.business_name || 'VYLTA'

    // Obtener clientes del segmento con email
    let query = supabase.from('clients').select('id, name, email')
      .eq('user_id', userId).not('email', 'is', null).neq('email', '')
    if (segment === 'activos') query = query.eq('is_active', true)
    else if (segment === 'inactivos') {
      const d90 = new Date(); d90.setDate(d90.getDate() - 90)
      query = query.lt('last_visit', d90.toISOString().split('T')[0])
    }

    const { data: clients, error: clientsError } = await query
    if (clientsError) throw new Error(`Error clientes: ${clientsError.message}`)
    if (!clients || clients.length === 0) throw new Error('No hay clientes con email para este segmento')

    // Enviar en lotes de 50
    let sent = 0
    for (let i = 0; i < clients.length; i += 50) {
      const batch = clients.slice(i, i + 50)
      const results = await Promise.allSettled(batch.map((client: any) => {
        const personalizedBody    = body.replace(/\{\{nombre\}\}/g, client.name || '').replace(/\{\{negocio\}\}/g, businessName)
        const personalizedSubject = subject.replace(/\{\{nombre\}\}/g, client.name || '').replace(/\{\{negocio\}\}/g, businessName)
        return fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `${businessName} <onboarding@resend.dev>`,
            to: [client.email],
            subject: personalizedSubject,
            text: personalizedBody,
            html: buildEmailHtml(personalizedSubject, personalizedBody, businessName),
          }),
        })
      }))
      sent += results.filter(r => r.status === 'fulfilled').length
    }

    // Actualizar campaña como enviada
    await supabase.from('email_campaigns').update({
      status: 'enviada', sent_at: new Date().toISOString(), recipient_count: sent,
    }).eq('id', campaignId)

    return new Response(JSON.stringify({ success: true, sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error('[send-campaign]', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

function buildEmailHtml(subject: string, body: string, businessName: string): string {
  const lines = body.split('\n').map(l => `<p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#374151;">${l}</p>`).join('')
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0;">
        <tr><td style="background:#6366F1;padding:28px 36px;">
          <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">${businessName}</p>
        </td></tr>
        <tr><td style="padding:32px 36px 8px;">
          <h1 style="margin:0;font-size:22px;font-weight:700;color:#0F172A;">${subject}</h1>
        </td></tr>
        <tr><td style="padding:16px 36px 32px;">${lines}</td></tr>
        <tr><td style="background:#F8FAFC;padding:20px 36px;border-top:1px solid #E2E8F0;">
          <p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">
            Enviado por <strong style="color:#6366F1;">${businessName}</strong> con VYLTA
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
