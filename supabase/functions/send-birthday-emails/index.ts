import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsForWebhook } from '../_shared/cors.ts'

// ══════════════════════════════════════════════════════════════════════
// send-birthday-emails — Edge Function
//
// Recorre todos los negocios con `birthday_reminders_enabled = true` (Luxury),
// encuentra sus clientes que cumplen años HOY (o en una fecha específica
// si se pasa `targetDate`), y les envía un email de felicitación via Resend.
//
// CONVOCATORIA:
//   Diaria a las 9:00 AM hora MX (15:00 UTC) — disparada por n8n Workflow #5.
//
// SEGURIDAD:
//   - Header `X-Cron-Secret` debe coincidir con BIRTHDAY_CRON_SECRET (env var)
//     para evitar que cualquiera pueda gatillar envíos masivos.
//   - corsForWebhook(): este endpoint es server-to-server, no se llama
//     desde navegador.
//
// IDEMPOTENCIA:
//   - Cada envío exitoso registra en `birthday_email_log` con (user_id,
//     client_id, sent_for_date). Si ya hay un log para el mismo día, se
//     omite el reenvío.
//
// SCHEMA-AGNÓSTICO:
//   - select('*') trae todas las columnas que existan en business_profiles.
//   - Los helpers getEmail/getPhone/getAddress prueban varios nombres
//     candidatos para adaptarse al schema real sin tronar.
//
// META COMPLIANCE:
//   - Es un EMAIL, no WhatsApp → no afecta el WABA.
//   - Cumplimos CAN-SPAM/CASL: List-Unsubscribe, unsubscribe link,
//     footer con info, reply-to al owner.
// ══════════════════════════════════════════════════════════════════════

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const FROM_DOMAIN = Deno.env.get('RESEND_FROM_DOMAIN') ?? ''
const CRON_SECRET = Deno.env.get('BIRTHDAY_CRON_SECRET') ?? ''

const DEFAULT_SUBJECT = '🎂 ¡Feliz cumpleaños, {{nombre}}!'
const DEFAULT_MESSAGE =
  '¡Hola {{nombre}}! 🎂\n\n' +
  'Todo el equipo de {{negocio}} te desea un feliz cumpleaños. ' +
  '¡Que sea un día especial!\n\n' +
  'Nos alegra mucho tenerte como cliente y esperamos verte pronto.'

// Helpers schema-agnósticos: prueban varios nombres candidatos por si el
// schema real usa 'phone' en vez de 'business_phone', 'address' en vez
// de 'business_address', etc.
function getEmail(profile: any): string {
  return profile?.business_email || profile?.email || ''
}
function getPhone(profile: any): string {
  return profile?.business_phone || profile?.phone || profile?.alternative_phone || ''
}
function getAddress(profile: any): string {
  return profile?.business_address || profile?.address || ''
}

serve(async (req) => {
  const corsHeaders = corsForWebhook()
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // ── 1. Validar secret del cron ──
    const providedSecret = req.headers.get('X-Cron-Secret') ?? ''
    if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
      console.error('[send-birthday-emails] Invalid or missing X-Cron-Secret')
      return json({ error: 'Unauthorized' }, 401)
    }

    if (!RESEND_API_KEY) {
      return json({ error: 'RESEND_API_KEY no configurado en Supabase Secrets', code: 'CONFIG_MISSING' }, 500)
    }
    if (!FROM_DOMAIN || FROM_DOMAIN.includes('resend.dev')) {
      return json({ error: 'RESEND_FROM_DOMAIN no configurado', code: 'CONFIG_MISSING' }, 500)
    }

    // ── 2. Determinar fecha objetivo ──
    const body = await req.json().catch(() => ({}))
    const targetDate = body.targetDate || todayInMexicoCity()
    const [, mm, dd] = targetDate.split('-').map(Number)

    console.log(`[send-birthday-emails] Procesando cumpleaños del ${targetDate} (mes=${mm}, día=${dd})`)

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // ── 3. Encontrar negocios con cumpleaños activados ──
    // Usamos select('*') para ser schema-agnóstico: el schema real puede tener
    // las columnas como `phone`/`address` o `business_phone`/`business_address`.
    const { data: profiles, error: profilesError } = await supabase
      .from('business_profiles')
      .select('*')
      .eq('birthday_reminders_enabled', true)

    if (profilesError) {
      console.error('[send-birthday-emails] Error cargando profiles:', profilesError)
      return json({ error: profilesError.message }, 500)
    }

    if (!profiles || profiles.length === 0) {
      console.log('[send-birthday-emails] Ningún negocio con recordatorios activados')
      return json({ ok: true, processed_businesses: 0, sent: 0, skipped: 0, failed: 0 })
    }

    // ── 4. Validar plan Luxury de cada negocio ──
    const userIds = profiles.map(p => p.user_id)
    const { data: plans } = await supabase
      .from('subscription_plans')
      .select('user_id, plan_type, status')
      .in('user_id', userIds)

    const luxuryUserIds = new Set(
      (plans || [])
        .filter(p => (p.plan_type || '').toLowerCase() === 'premium' && (p.status || '').toLowerCase() === 'active')
        .map(p => p.user_id)
    )

    const eligibleProfiles = profiles.filter(p => luxuryUserIds.has(p.user_id))
    console.log(`[send-birthday-emails] ${eligibleProfiles.length} negocios Luxury con cumpleaños activado`)

    let totalSent = 0
    let totalSkipped = 0
    let totalFailed = 0

    for (const profile of eligibleProfiles) {
      const result = await processBirthdaysForBusiness(supabase, profile, targetDate, mm, dd)
      totalSent += result.sent
      totalSkipped += result.skipped
      totalFailed += result.failed
    }

    console.log(`[send-birthday-emails] RESUMEN: ${totalSent} enviados, ${totalSkipped} omitidos, ${totalFailed} fallidos`)

    return json({
      ok: true,
      target_date: targetDate,
      processed_businesses: eligibleProfiles.length,
      sent: totalSent,
      skipped: totalSkipped,
      failed: totalFailed,
    })

  } catch (e: any) {
    console.error('[send-birthday-emails] Error general:', e.message, e.stack)
    return json({ error: e.message }, 500)
  }
})

// ──────────────────────────────────────────────────────────────────────

async function processBirthdaysForBusiness(
  supabase: any,
  profile: any,
  targetDate: string,
  targetMonth: number,
  targetDay: number,
) {
  const userId = profile.user_id
  const businessName = profile.business_name || 'VYLTA'

  // ── 1. Encontrar clientes que cumplen hoy ──
  const monthStr = String(targetMonth).padStart(2, '0')
  const dayStr = String(targetDay).padStart(2, '0')
  const monthDay = `${monthStr}-${dayStr}` // '03-15'

  const { data: clients, error: clientsError } = await supabase
    .from('clients')
    .select('id, name, email, birthday')
    .eq('user_id', userId)
    .not('email', 'is', null)
    .neq('email', '')
    .not('birthday', 'is', null)
    .like('birthday', `%-${monthDay}`)

  if (clientsError) {
    console.error(`[send-birthday-emails] Error clientes user ${userId}:`, clientsError)
    return { sent: 0, skipped: 0, failed: 0 }
  }

  if (!clients || clients.length === 0) {
    return { sent: 0, skipped: 0, failed: 0 }
  }

  console.log(`[send-birthday-emails] ${businessName} (${userId}): ${clients.length} clientes cumplen hoy`)

  // ── 2. Log de envíos previos (idempotencia) ──
  const clientIds = clients.map(c => c.id)
  const { data: existingLogs } = await supabase
    .from('birthday_email_log')
    .select('client_id')
    .eq('user_id', userId)
    .eq('sent_for_date', targetDate)
    .in('client_id', clientIds)

  const alreadySentSet = new Set((existingLogs || []).map((l: any) => l.client_id))

  // ── 3. Email del owner para reply-to ──
  const businessEmail = getEmail(profile)
  const { data: ownerData } = await supabase.auth.admin.getUserById(userId)
  const ownerEmail = businessEmail || ownerData?.user?.email || `soporte@${FROM_DOMAIN}`

  // ── 4. Contacto del negocio para footer ──
  const businessPhone = getPhone(profile)
  const businessAddress = getAddress(profile)

  // ── 5. Templates ──
  const subjectTemplate = profile.birthday_email_subject || DEFAULT_SUBJECT
  const bodyTemplate = profile.birthday_message || DEFAULT_MESSAGE
  const discountText = profile.birthday_discount_text || ''

  // From: 'hola@' (mejor deliverability que 'noreply@')
  const safeName = businessName.replace(/[<>"]/g, '').trim().slice(0, 50)
  const fromField = `${safeName} <hola@${FROM_DOMAIN}>`

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const client of clients) {
    if (alreadySentSet.has(client.id)) {
      console.log(`[send-birthday-emails] Skip ${client.email} — ya recibió email hoy`)
      skipped++
      continue
    }

    try {
      const firstName = (client.name || '').split(' ')[0] || 'cliente'
      const personalizedSubject = subjectTemplate
        .replace(/{{nombre}}/g, firstName)
        .replace(/{{negocio}}/g, businessName)
      let personalizedBody = bodyTemplate
        .replace(/{{nombre}}/g, firstName)
        .replace(/{{negocio}}/g, businessName)
      if (discountText.trim()) {
        personalizedBody += `\n\n🎁 ${discountText.trim()}`
      }

      const unsubscribeUrl = `https://vylta.lat/unsubscribe?u=${userId}&c=${client.id}`

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromField,
          to: [client.email],
          reply_to: ownerEmail,
          subject: personalizedSubject,
          text: buildPlainText(personalizedSubject, personalizedBody, businessName, businessEmail, businessPhone, businessAddress, unsubscribeUrl),
          html: buildEmailHtml(personalizedSubject, personalizedBody, businessName, businessEmail, businessPhone, businessAddress, unsubscribeUrl, firstName),
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            'X-Entity-Ref-ID': crypto.randomUUID(),
          },
          tags: [
            { name: 'type', value: 'birthday' },
            { name: 'user_id', value: userId },
          ],
        }),
      })

      const resBody = await res.json().catch(() => ({}))

      if (!res.ok) {
        console.error(`[send-birthday-emails] Error Resend ${client.email}: HTTP ${res.status}`, resBody)
        failed++
        continue
      }

      await supabase.from('birthday_email_log').insert({
        user_id: userId,
        client_id: client.id,
        sent_for_date: targetDate,
        email_to: client.email,
        resend_id: resBody.id || null,
        sent_at: new Date().toISOString(),
      })

      sent++
      console.log(`[send-birthday-emails] ✅ ${client.email} (${firstName}) → ${resBody.id}`)

    } catch (err: any) {
      console.error(`[send-birthday-emails] Error enviando a ${client.email}:`, err.message)
      failed++
    }
  }

  return { sent, skipped, failed }
}

// ──────────────────────────────────────────────────────────────────────

function todayInMexicoCity(): string {
  const now = new Date()
  const mxOffsetMs = -6 * 60 * 60 * 1000
  const mxNow = new Date(now.getTime() + mxOffsetMs)
  return mxNow.toISOString().split('T')[0]
}

function buildPlainText(
  subject: string, body: string, businessName: string,
  businessEmail: string, businessPhone: string, businessAddress: string,
  unsubscribeUrl: string,
): string {
  const lines = [
    subject,
    '─────────────────────────────',
    '',
    body,
    '',
    '─────────────────────────────',
    `Enviado con cariño desde ${businessName}`,
  ]
  if (businessEmail) lines.push(`Email: ${businessEmail}`)
  if (businessPhone) lines.push(`Teléfono: ${businessPhone}`)
  if (businessAddress) lines.push(`Dirección: ${businessAddress}`)
  lines.push('')
  lines.push(`Si ya no deseas recibir estos correos: ${unsubscribeUrl}`)
  lines.push('')
  lines.push('Powered by VYLTA · vylta.lat')
  return lines.join('\n')
}

function buildEmailHtml(
  subject: string, body: string, businessName: string,
  businessEmail: string, businessPhone: string, businessAddress: string,
  unsubscribeUrl: string, firstName: string,
): string {
  const lines = body
    .split('\n')
    .map(l => l.trim() ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#374151;">${escapeHtml(l)}</p>` : '<br>')
    .join('')

  const contactLines: string[] = []
  if (businessEmail) contactLines.push(`<a href="mailto:${escapeHtml(businessEmail)}" style="color:#EC4899;text-decoration:none;">${escapeHtml(businessEmail)}</a>`)
  if (businessPhone) contactLines.push(escapeHtml(businessPhone))
  if (businessAddress) contactLines.push(escapeHtml(businessAddress))

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#FDF2F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;color:#FDF2F8;">
    ${escapeHtml(businessName)} te desea un feliz cumpleaños 🎂
  </div>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FDF2F8;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #FBCFE8;">
          <tr>
            <td style="background:linear-gradient(135deg,#EC4899 0%,#F472B6 100%);padding:32px;text-align:center;">
              <div style="font-size:48px;line-height:1;margin-bottom:8px;">🎂</div>
              <p style="margin:0;color:#FFFFFF;font-size:22px;font-weight:700;letter-spacing:-0.01em;">${escapeHtml(businessName)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 0;">
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#831843;line-height:1.3;text-align:center;">${escapeHtml(subject)}</h1>
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
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FDF2F8;border-radius:8px;padding:16px;">
                <tr>
                  <td>
                    <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#9D174D;text-transform:uppercase;letter-spacing:0.5px;">Contacto</p>
                    <p style="margin:0;font-size:13px;color:#831843;line-height:1.6;">
                      ${contactLines.join('<br>')}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : ''}
          <tr>
            <td style="background:#FDF2F8;padding:20px 32px;border-top:1px solid #FBCFE8;">
              <p style="margin:0 0 8px;font-size:12px;color:#9D174D;text-align:center;line-height:1.6;">
                Recibiste este correo porque eres cliente de <strong style="color:#EC4899;">${escapeHtml(businessName)}</strong>.
              </p>
              <p style="margin:0;font-size:11px;color:#BE185D;text-align:center;line-height:1.5;">
                Si ya no deseas recibir estos correos, <a href="${unsubscribeUrl}" style="color:#9D174D;text-decoration:underline;">cancela tu suscripción aquí</a>.
              </p>
              <p style="margin:12px 0 0;font-size:10px;color:#BE185D;text-align:center;">
                Enviado a través de <a href="https://vylta.lat" style="color:#EC4899;text-decoration:none;">VYLTA</a>
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
