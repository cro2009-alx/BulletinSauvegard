import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const authorization = request.headers.get('Authorization')
  if (!authorization) return json({ error: 'Authentification requise.' }, 401)
  try {
    const { officialName, professionalEmail } = await request.json()
    if (!officialName?.trim() || !professionalEmail?.trim()) return json({ error: 'Le nom et l’e-mail sont obligatoires.' }, 400)
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } })
    const { data: userData } = await userClient.auth.getUser()
    if (!userData.user) return json({ error: 'Session invalide.' }, 401)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: profile } = await admin.from('profiles').select('establishment_id, role').eq('id', userData.user.id).single()
    if (!profile?.establishment_id || !['establishment_admin', 'platform_admin'].includes(profile.role)) return json({ error: 'Modification non autorisée.' }, 403)
    const { error } = await admin.from('establishments').update({ official_name: officialName.trim(), professional_email: professionalEmail.trim(), updated_at: new Date().toISOString() }).eq('id', profile.establishment_id)
    if (error) return json({ error: error.message }, 500)
    await admin.from('audit_logs').insert({ establishment_id: profile.establishment_id, user_id: userData.user.id, action: 'establishment_information_update', metadata: { fields: ['official_name', 'professional_email'] } })
    return json({ ok: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Modification impossible.' }, 400)
  }
})
