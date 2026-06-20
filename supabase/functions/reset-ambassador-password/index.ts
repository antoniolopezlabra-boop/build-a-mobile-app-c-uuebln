import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsForWeb, handleCorsPreflightRequest } from '../_shared/cors.ts'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// ══════════════════════════════════════════════
// reset-ambassador-password — Un admin define una NUEVA contraseña para la
// cuenta de un embajador. El embajador puede cambiarla luego desde su portal.
//
//   - Solo admins activos (vylta_admins.is_active), verificado por JWT.
//   - El embajador debe tener cuenta de acceso (embajadores.user_id != null).
//   - CUENTAS DUALES: si el embajador es además un negocio (mismo auth.users),
//     la nueva contraseña cambia su acceso a AMBOS (app de negocio + portal de
//     embajador). La función responde dual:true y exige force:true para
//     proceder, de modo que el admin confirme explícitamente.
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
    const { embajadorId, password, force } = await req.json()
    if (!embajadorId || !password) {
      return json({ success: false, error: 'Faltan datos (embajador o contraseña).' })
    }
    if (String(password).length < 6) {
      return json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres.' })
    }

    // 3. Buscar el embajador y confirmar que tiene cuenta de acceso.
    const { data: emb, error: ee } = await admin
      .from('embajadores').select('id, user_id, nombre').eq('id', embajadorId).single()
    if (ee || !emb) return json({ success: false, error: 'No se encontró el embajador.' })
    if (!emb.user_id) {
      return json({ success: false, error: 'Este embajador aún no tiene cuenta de acceso. Usa "Crear acceso".' })
    }

    // 4. ¿Cuenta dual (también un negocio)? -> exigir confirmación explícita.
    const { data: biz } = await admin
      .from('business_profiles').select('user_id').eq('user_id', emb.user_id).maybeSingle()
    const dual = !!biz
    if (dual && force !== true) {
      return json({
        success: false,
        dual: true,
        error: 'Esta cuenta también es un negocio. La nueva contraseña cambiará su acceso a la app de negocio Y al portal de embajador.',
      })
    }

    // 5. Restablecer la contraseña (no toca email ni confirmación).
    const { error: pe } = await admin.auth.admin.updateUserById(emb.user_id, { password: String(password) })
    if (pe) return json({ success: false, error: pe.message || 'No se pudo restablecer la contraseña.' })

    return json({ success: true, dual, nombre: emb.nombre })
  } catch (e: any) {
    return json({ success: false, error: e?.message ?? 'Error interno del servidor' }, 500)
  }
})
