import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsForWeb, handleCorsPreflightRequest } from '../_shared/cors.ts'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// ══════════════════════════════════════════════
// create-ambassador-access — Crea la cuenta de acceso de un embajador.
//
//   - Solo admins activos (vylta_admins.is_active), verificado por JWT.
//   - Crea el usuario en Auth con email_confirm:true: el embajador entra
//     directo con el correo + contrasena que tu definas, y puede cambiar
//     su contrasena desde su portal.
//   - El trigger de signup crea un business_profile/whatsapp_config por
//     defecto; como el embajador NO es un negocio, esos registros se borran.
//   - Vincula embajadores.user_id = nuevo usuario.
//
// Se llama desde el CRM Web (app.vylta.lat) -> corsForWeb.
// ══════════════════════════════════════════════

serve(async (req) => {
  const corsHeaders = corsForWeb(req)
  const preflight = handleCorsPreflightRequest(req, corsHeaders)
  if (preflight) return preflight

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // 1. Verificar admin activo por el JWT del caller.
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
    if (!token) return json({ success: false, error: 'No autorizado' })
    const { data: u, error: ue } = await admin.auth.getUser(token)
    if (ue || !u?.user) return json({ success: false, error: 'No autorizado' })
    const { data: adminRow } = await admin
      .from('vylta_admins').select('id')
      .eq('user_id', u.user.id).eq('is_active', true).maybeSingle()
    if (!adminRow) return json({ success: false, error: 'Se requiere una cuenta de administrador.' })

    // 2. Validar input.
    const { embajadorId, email, password } = await req.json()
    if (!embajadorId || !email || !password) {
      return json({ success: false, error: 'Faltan datos (embajador, correo o contraseña).' })
    }
    if (String(password).length < 6) {
      return json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres.' })
    }
    const cleanEmail = String(email).trim().toLowerCase()

    // 3. Buscar el embajador y confirmar que aun no tiene cuenta.
    const { data: emb, error: ee } = await admin
      .from('embajadores').select('id, user_id, nombre').eq('id', embajadorId).single()
    if (ee || !emb) return json({ success: false, error: 'No se encontró el embajador.' })
    if (emb.user_id) return json({ success: false, error: 'Este embajador ya tiene una cuenta de acceso.' })

    // 4. Crear la cuenta de acceso (confirmada, con metadata de embajador).
    const { data: created, error: ce } = await admin.auth.admin.createUser({
      email: cleanEmail,
      password: String(password),
      email_confirm: true,
      user_metadata: { is_ambassador: true, embajador_id: emb.id, full_name: emb.nombre },
    })
    if (ce || !created?.user) {
      const msg = String(ce?.message || '')
      if (/already.*regist|been regist|already exist|duplicate/i.test(msg)) {
        return json({ success: false, error: 'Ese correo ya tiene una cuenta en VYLTA (de un negocio o de otro embajador). Usa un correo distinto para la cuenta del embajador.' })
      }
      return json({ success: false, error: msg || 'No se pudo crear la cuenta de acceso.' })
    }
    const newUserId = created.user.id

    // 5. El embajador NO es un negocio: limpiar lo que el signup creo por defecto.
    await admin.from('business_profiles').delete().eq('user_id', newUserId)
    await admin.from('whatsapp_config').delete().eq('user_id', newUserId)
    await admin.from('subscription_plans').delete().eq('user_id', newUserId)

    // 6. Vincular la cuenta al embajador.
    const { error: le } = await admin.from('embajadores').update({ user_id: newUserId }).eq('id', emb.id)
    if (le) {
      await admin.auth.admin.deleteUser(newUserId) // evitar cuenta huerfana
      return json({ success: false, error: 'No se pudo vincular la cuenta. Intenta de nuevo.' })
    }

    return json({ success: true, nombre: emb.nombre, email: cleanEmail })
  } catch (e: any) {
    return json({ success: false, error: e?.message ?? 'Error interno del servidor' }, 500)
  }
})
