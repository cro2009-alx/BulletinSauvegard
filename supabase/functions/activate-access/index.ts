import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await request.json()
    const code = String(body.code ?? '').trim().toUpperCase()
    const email = String(body.email ?? '').trim().toLowerCase()
    const fullName = String(body.fullName ?? '').trim()
    const role = body.role === 'establishment_admin' ? 'establishment_admin' : 'establishment_staff'
    const password = String(body.password ?? '')
    if (!code || !email || !fullName || password.length < 8) return json({ error: 'Données d’activation invalides.' }, 400)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const authHeader = request.headers.get('Authorization')
    const sessionClient = authHeader
      ? createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
      : null
    const { data: sessionData } = sessionClient ? await sessionClient.auth.getUser() : { data: { user: null } }
    if (sessionData.user?.email && sessionData.user.email.toLowerCase() !== email) return json({ error: 'L’e-mail du compte connecté ne correspond pas au code.' }, 400)

    const { data: activation, error: activationError } = await admin.from('activation_codes').select('id, establishment_id, status, expires_at').eq('code_hash', await sha256(code)).maybeSingle()
    if (activationError) return json({ error: `Erreur de lecture du code : ${activationError.message}` }, 500)
    if (!activation) return json({ error: 'Code inexistant ou invalide.' }, 400)
    if (activation.status !== 'active') return json({ error: `Code déjà ${activation.status === 'used' ? 'utilisé' : 'invalide'}.` }, 400)
    if (new Date(activation.expires_at).getTime() <= Date.now()) {
      await admin.from('activation_codes').update({ status: 'expired' }).eq('id', activation.id)
      return json({ error: 'Code expiré.' }, 400)
    }

    let userId = sessionData.user?.id
    let createdUser = false
    if (!userId) {
      const { data: created, error: userError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } })
      if (userError || !created.user) return json({ error: userError?.message ?? 'Création du compte impossible.' }, 400)
      userId = created.user.id
      createdUser = true
    }

    const { error: profileError } = await admin.from('profiles').upsert({ id: userId, establishment_id: activation.establishment_id, full_name: fullName, email: sessionData.user?.email ?? email, role, status: 'active' })
    if (profileError) {
      if (createdUser) await admin.auth.admin.deleteUser(userId)
      return json({ error: `Profil impossible à créer : ${profileError.message}` }, 400)
    }
    const { error: consumeError } = await admin.from('activation_codes').update({ status: 'used', used_at: new Date().toISOString(), used_by: userId }).eq('id', activation.id).eq('status', 'active')
    if (consumeError) return json({ error: `Le code n’a pas pu être invalidé : ${consumeError.message}` }, 500)
    await admin.from('access_requests').update({ status: 'active' }).eq('user_id', userId).eq('establishment_id', activation.establishment_id)
    await admin.from('audit_logs').insert({ establishment_id: activation.establishment_id, user_id: userId, action: 'account_activated', entity_type: 'activation_code' })
    return json({ ok: true, session_user_id: userId })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Requête invalide.' }, 400)
  }
})
