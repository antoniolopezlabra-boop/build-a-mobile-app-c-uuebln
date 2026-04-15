import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
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
    const { staffMemberId, organizationUserId } = await req.json()

    if (!staffMemberId || !organizationUserId) {
      return json({ error: 'Faltan campos requeridos' }, 400)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Buscar la cuenta del colaborador verificando que pertenece a esta organización
    const { data: account, error: selectError } = await supabase
      .from('staff_accounts')
      .select('id, user_id')
      .eq('staff_member_id', staffMemberId)
      .eq('organization_user_id', organizationUserId)
      .single()

    if (selectError || !account) {
      return json({ error: 'No se encontró la cuenta de acceso' }, 404)
    }

    // Eliminar de staff_accounts
    const { error: deleteError } = await supabase
      .from('staff_accounts')
      .delete()
      .eq('id', account.id)

    if (deleteError) {
      return json({ error: deleteError.message }, 400)
    }

    // Eliminar el usuario de Auth
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(account.user_id)
    if (authDeleteError) {
      console.error('[delete-staff-account] Auth user deletion failed:', authDeleteError.message)
      // El registro ya fue eliminado; advertimos pero no fallamos
      return json({ success: true, warning: 'Acceso revocado, pero la cuenta de auth no pudo eliminarse.' })
    }

    return json({ success: true })
  } catch (e: any) {
    return json({ error: e?.message ?? 'Error interno del servidor' }, 500)
  }
})
