import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
async function hash(value: string) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const authorization = request.headers.get('Authorization')
  if (!authorization) return json({ error: 'Authentification requise.' }, 401)
  try {
    const { requestId, decision, note } = await request.json()
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } })
    const { data: user } = await authClient.auth.getUser()
    if (!user.user) return json({ error: 'Session invalide.' }, 401)
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.user.id).single()
    if (profile?.role !== 'platform_admin') return json({ error: 'Accès administrateur requis.' }, 403)
    const { data: accessRequest } = await admin.from('access_requests').select('*').eq('id', requestId).single()
    if (!accessRequest) return json({ error: 'Demande introuvable.' }, 404)
    if (decision !== 'approve') {
      await admin.from('access_requests').update({ status: decision === 'reject' ? 'rejected' : 'pending', admin_note: note ?? null, reviewed_at: new Date().toISOString(), reviewed_by: user.user.id }).eq('id', requestId)
      return json({ ok: true })
    }
    const { data: establishment, error: establishmentError } = await admin.from('establishments').insert({ official_name: accessRequest.establishment_name, requester_name: accessRequest.requester_name, phone: accessRequest.phone, professional_email: accessRequest.email, city: accessRequest.city, country: accessRequest.country, address: accessRequest.address, status: 'active' }).select().single()
    if (establishmentError) return json({ error: establishmentError.message }, 500)
    const code = `MOVA-${crypto.randomUUID().slice(0, 4).toUpperCase()}-${new Date().getUTCFullYear()}`
    const { error: codeError } = await admin.from('activation_codes').insert({ establishment_id: establishment.id, code_hash: await hash(code), code_hint: code.slice(0, 9), expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), created_by: user.user.id })
    if (codeError) return json({ error: codeError.message }, 500)
    await admin.from('access_requests').update({ establishment_id: establishment.id, status: 'active', activation_code_display: code, reviewed_at: new Date().toISOString(), reviewed_by: user.user.id, admin_note: note ?? null }).eq('id', requestId)
    await admin.from('audit_logs').insert({ establishment_id: establishment.id, user_id: user.user.id, action: 'access_request_approved', metadata: { request_id: requestId } })
    return json({ ok: true, activation_code: code })
  } catch { return json({ error: 'Traitement impossible.' }, 400) }
})
