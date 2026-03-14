import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

serve(async (req) => {
  try {
    const { campaignId } = await req.json()
    if (!campaignId) throw new Error('campaignId requerido')

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // 1. Obtener la campaña
    const { data: campaign, error: campError } = await supabase
      .from('email_campaigns')
      .select('*, user:auth.users(email), business:business_profiles(business_name)')
      .eq('id', campaignId)
      .single()
    if (campError) throw campError

    const businessName = campaign.business?.business_name || 'VYLTA'

    // 2. Obtener clientes del segmento con email
    let query = supabase
      .from('clients')
      .select('id, name, email')
      .eq('user_id', campaign.user_id)
      .not('email', 'is', null)
      .neq('email', '')

    if (campaign.segment === 'activos') {
      query = query.eq('is_active', true)
    } else if (campaign.segment === 'inactivos') {
      const d90 = new Date()
      d90.setDate(d90.getDate() - 90)
      query = query.lt('last_visit', d90.toISOString().split('T')[0])
    }

    const { data: clients, error: clientsError } = await query
    if (clientsError) throw clientsError
    if (!clients || clients.length === 0) {
      throw new Error('No hay clientes con email para este segmento')
    }

    // 3. Enviar emails vía Resend (en lotes de 50)
    let sent = 0
    const batchSize = 50

    for (let i = 0; i < clients.length; i += batchSize) {
      const batch = clients.slice(i, i + batchSize)

      const emailPromises = batch.map((client: any) => {
        const personalizedBody = campaign.body
          .replace(/{{nombre}}/g, client.name)
          .replace(/{{negocio}}/g, businessName)

        const personalizedSubject = campaign.subject
          .replace(/{{nombre}}/g, client.name)
          .replace(/{{negocio}}/g, businessName)

        return fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${businessName} <onboarding@resend.dev>`,
            to: [client.email],
            subject: personalizedSubject,
            text: personalizedBody,
            html: buildEmailHtml(personalizedSubject, personalizedBody, businessName),
          }),
        })
      })

      const results = await Promise.allSettled(emailPromises)
      sent += results.filter(r => r.status === 'fulfilled').length
    }

    // 4. Actualizar estado de la campaña
    await supabase.from('email_campaigns').update({
      status: 'enviada',
      sent_at: new Date().toISOString(),
      recipient_count: sent,
    }).eq('id', campaignId)

    return new Response(
      JSON.stringify({ success: true, sent }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    // Marcar como fallida si ya existe la campaña
    console.error('[send-campaign] Error:', error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

function buildEmailHtml(subject: string, body: string, businessName: string): string {
  const lines = body.split('\n').map(l => `<p style="margin:0 0 12px;">${l}</p>`).join('')
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:32px 16px;">
    <tr><td>
      <table width="600" align="center" cellpadding="0" cellspacing="0"
        style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0;">
        <!-- Header -->
        <tr><td style="background:#6366F1;padding:24px 32px;">
          <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">${businessName}</p>
        </td></tr>
        <!-- Asunto -->
        <tr><td style="padding:32px 32px 16px;">
          <h1 style="margin:0;font-size:22px;font-weight:700;color:#0F172A;">${subject}</h1>
        </td></tr>
        <!-- Cuerpo -->
        <tr><td style="padding:0 32px 32px;">
          <div style="font-size:15px;line-height:1.7;color:#374151;">${lines}</div>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#F8FAFC;padding:20px 32px;border-top:1px solid #E2E8F0;">
          <p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">
            Enviado con <strong>VYLTA</strong> &mdash; ${businessName}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
