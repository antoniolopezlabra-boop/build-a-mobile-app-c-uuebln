
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsForApp, handleCorsPreflightRequest } from '../_shared/cors.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const FROM_DOMAIN    = Deno.env.get('RESEND_FROM_DOMAIN') ?? ''

// ════════════════════════════════════════════════════════════════════════
// Helpers schema-agnósticos: el schema real usa `phone`/`address` SIN
// prefijo `business_`. Estos helpers prueban ambos nombres para sobrevivir
// a futuras migraciones de schema sin tronar.
// `business_email` NO existe en BD — caemos al email del owner via auth.users.
// ════════════════════════════════════════════════════════════════════════
function getProfileEmail(profile: any): string {
  return profile?.business_email || profile?.email || ''
}
function getProfilePhone(profile: any): string {
  return profile?.business_phone || profile?.phone || profile?.alternative_phone || ''
}
function getProfileAddress(profile: any): string {
  return profile?.business_address || profile?.address || ''
}

// ════════════════════════════════════════════════════════════════════════
// ANTI-SPAM: Validar contenido del email para evitar filtros
// ════════════════════════════════════════════════════════════════════════
function checkSpamScore(subject: string, body: string): { ok: boolean; warnings: string[] } {
  const warnings: string[] = []

  const upperRatio = (subject.match(/[A-ZÁÉÍÓÚÑ]/g) || []).length / Math.max(1, subject.length)
  if (upperRatio > 0.5 && subject.length > 10) {
    warnings.push('Asunto con demasiadas mayúsculas')
  }

  if ((subject.match(/!/g) || []).length > 1) {
    warnings.push('Asunto con múltiples signos de exclamación')
  }

  const spamWords = ['GRATIS', 'OFERTA', '100% gratis', 'GANA', 'OFERTA LIMITADA', 'CLICK AQUÍ', 'URGENTE']
  const upperSubject = subject.toUpperCase()
  const upperBody = body.toUpperCase()
  for (const w of spamWords) {
    if (upperSubject.includes(w) || upperBody.includes(w)) {
      warnings.push(`Palabra "${w}" puede activar filtros spam`)
      break
    }
  }

  return { ok: warnings.length === 0, warnings }
}

function buildHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'X-Entity-Ref-ID': crypto.randomUUID(),
  }
}

serve(async (req) => {
  const corsHeaders = corsForApp(req)
  const preflight = handleCorsPreflightRequest(req, corsHeaders)
  if (preflight) return preflight

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    if (!RESEND_API_KEY) {
      return json({
        error: 'Configuración pendiente: RESEND_API_KEY no está en Supabase Secrets.',
        code: 'CONFIG_MISSING_RESEND_API_KEY',
      }, 500)
    }

    if (!FROM_DOMAIN || FROM_DOMAIN.includes('resend.dev')) {
      console.error('[send-campaign] CRITICAL: RESEND_FROM_DOMAIN no configurado')
      return json({
        error:
          'El servicio de email aún no está configurado para envío masivo. ' +
          'El dominio de envío necesita verificación.',
        code: 'CONFIG_MISSING_FROM_DOMAIN',
      }, 503)
    }

    const payload = await req.json()
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    let campaignId: string
    let userId: string
    let subject: string
    let body: string
    let segment: string

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

    const spamCheck = checkSpamScore(subject, body)
    if (spamCheck.warnings.length > 0) {
      console.warn(`[send-campaign] Spam warnings: ${spamCheck.warnings.join(' | ')}`)
    }

    // Obtener perfil del negocio (schema-agnóstico — usa select('*'))
    const { data: business } = await supabase
      .from('business_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    const businessName    = business?.business_name || 'VYLTA'
    const businessEmail   = getProfileEmail(business)
    const businessPhone   = getProfilePhone(business)
    const businessAddress = getProfileAddress(business)

    const safeName = businessName.replace(/[<>"]/g, '').trim().slice(0, 50)
    const fromAddress = `hola@${FROM_DOMAIN}`
    const fromField = `${safeName} <${fromAddress}>`

    // Reply-to: usa el email del negocio si está, sino el del owner (auth.users)
    const { data: ownerData } = await supabase.auth.admin.getUserById(userId)
    const ownerEmail = businessEmail || ownerData?.user?.email || `soporte@${FROM_DOMAIN}`

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
      await supabase.from('email_campaigns').update({
        status: 'error', sent_at: new Date().toISOString(), recipient_count: 0,
      }).eq('id', campaignId)
      return json({
        error: 'No hay clientes con email registrado para este segmento.',
        code: 'NO_RECIPIENTS',
      }, 400)
    }

    console.log(`[send-campaign] Enviando a ${clients.length} clientes | from: ${fromField} | reply-to: ${ownerEmail}`)

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

        const unsubscribeUrl = `https://vylta.lat/unsubscribe?u=${userId}&c=${client.id}`

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from:     fromField,
            to:       [client.email],
            reply_to: ownerEmail,
            subject:  personalizedSubject,
            text:     buildPlainText(personalizedSubject, personalizedBody, businessName, businessEmail, businessPhone, businessAddress, unsubscribeUrl),
            html:     buildEmailHtml(personalizedSubject, personalizedBody, businessName, businessEmail, businessPhone, businessAddress, unsubscribeUrl, client.name || ''),
            headers:  buildHeaders(unsubscribeUrl),
            tags: [
              { name: 'campaign', value: campaignId.slice(0, 36) },
              { name: 'segment',  value: segment },
            ],
          }),
        })

        const resBody = await res.json().catch(() => ({}))

        if (!res.ok) {
          const errMsg = `${client.email}: HTTP ${res.status} - ${JSON.stringify(resBody)}`
          console.error(`[send-campaign] Error Resend: ${errMsg}`)
          throw new Error(errMsg)
        }

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

    await supabase.from('email_campaigns').update({
      status:          sent > 0 ? 'enviada' : 'error',
      sent_at:         new Date().toISOString(),
      recipient_count: sent,
    }).eq('id', campaignId)

    if (sent === 0 && failed > 0) {
      const isDomainError = errors.some(e =>
        e.includes('403') || e.includes('domain') || e.includes('not verified')
      )
      return json({
        error: isDomainError
          ? `El dominio ${FROM_DOMAIN} no está verificado en Resend.`
          : `Error enviando. Primeros errores: ${errors.slice(0, 2).join(' | ')}`,
        sent: 0,
        failed,
        code: isDomainError ? 'DOMAIN_NOT_VERIFIED' : 'SEND_FAILED',
      }, 400)
    }

    return json({
      success: true,
      sent,
      failed,
      spamWarnings: spamCheck.warnings,
    })

  } catch (error: any) {
    console.error('[send-campaign] Error general:', error.message)
    return json({ error: error.message }, 400)
  }
})

function buildPlainText(
  subject: string,
  body: string,
  businessName: string,
  businessEmail: string,
  businessPhone: string,
  businessAddress: string,
  unsubscribeUrl: string,
): string {
  const lines = [
    subject,
    '─────────────────────────────',
    '',
    body,
    '',
    '─────────────────────────────',
    `Enviado por ${businessName}`,
  ]
  if (businessEmail)   lines.push(`Email: ${businessEmail}`)
  if (businessPhone)   lines.push(`Teléfono: ${businessPhone}`)
  if (businessAddress) lines.push(`Dirección: ${businessAddress}`)
  lines.push('')
  lines.push(`Si ya no deseas recibir estos correos: ${unsubscribeUrl}`)
  lines.push('')
  lines.push('Powered by VYLTA · vylta.lat')
  return lines.join('\n')
}

function buildEmailHtml(
  subject: string,
  body: string,
  businessName: string,
  businessEmail: string,
  businessPhone: string,
  businessAddress: string,
  unsubscribeUrl: string,
  clientName: string,
): string {
  const safeName = clientName.split(' ')[0] || 'cliente'

  const lines = body
    .split('\n')
    .map(l => l.trim() ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#374151;">${escapeHtml(l)}</p>` : '<br>')
    .join('')

  const contactLines: string[] = []
  if (businessEmail)   contactLines.push(`<a href="mailto:${escapeHtml(businessEmail)}" style="color:#10B981;text-decoration:none;">${escapeHtml(businessEmail)}</a>`)
  if (businessPhone)   contactLines.push(escapeHtml(businessPhone))
  if (businessAddress) contactLines.push(escapeHtml(businessAddress))

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;color:#F8FAFC;">
    Mensaje de ${escapeHtml(businessName)} para ${escapeHtml(safeName)}
  </div>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F8FAFC;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #E2E8F0;">
          <tr>
            <td style="background:#10B981;padding:24px 32px;">
              <p style="margin:0;color:#FFFFFF;font-size:20px;font-weight:700;letter-spacing:-0.01em;">${escapeHtml(businessName)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 0;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0F172A;line-height:1.3;">${escapeHtml(subject)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 32px;">
              ${lines}
            </td>
          </tr>
          ${contactLines.length > 0 ? `
          <tr>
            <td style="padding:0 32px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F8FAFC;border-radius:8px;padding:16px;">
                <tr>
                  <td>
                    <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px;">Contacto</p>
                    <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">
                      ${contactLines.join('<br>')}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : ''}
          <tr>
            <td style="background:#F8FAFC;padding:20px 32px;border-top:1px solid #E2E8F0;">
              <p style="margin:0 0 8px;font-size:12px;color:#94A3B8;text-align:center;line-height:1.6;">
                Recibiste este correo porque eres cliente de <strong style="color:#10B981;">${escapeHtml(businessName)}</strong>.
              </p>
              <p style="margin:0;font-size:11px;color:#CBD5E1;text-align:center;line-height:1.5;">
                Si ya no deseas recibir estos correos, <a href="${unsubscribeUrl}" style="color:#94A3B8;text-decoration:underline;">cancela tu suscripción aquí</a>.
              </p>
              <p style="margin:12px 0 0;font-size:10px;color:#CBD5E1;text-align:center;">
                Enviado a través de <a href="https://vylta.lat" style="color:#10B981;text-decoration:none;">VYLTA</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
