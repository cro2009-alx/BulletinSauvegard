import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const form = await request.formData(); const required = ['establishment_name', 'city', 'country', 'authorization_number', 'ifu', 'requester_name', 'requester_role', 'email', 'phone', 'address']
    const values = Object.fromEntries(required.map(field => [field, String(form.get(field) ?? '').trim()]))
    if (required.some(field => !values[field])) return json({ error: 'Tous les champs obligatoires doivent être renseignés.' }, 400)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const authHeader = request.headers.get('Authorization')
    const userClient = authHeader
      ? createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
      : null
    const { data: authData } = userClient ? await userClient.auth.getUser() : { data: { user: null } }
    let supporting_document_path: string | null = null; const file = form.get('supporting_document')
    if (file instanceof File && file.size > 0) {
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size > 10485760) return json({ error: 'Justificatif invalide ou trop volumineux.' }, 400)
      supporting_document_path = `requests/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: uploadError } = await admin.storage.from('supporting-documents').upload(supporting_document_path, file, { contentType: file.type, upsert: false })
      if (uploadError) return json({ error: uploadError.message }, 500)
    }
    const { error } = await admin.from('access_requests').insert({ ...values, supporting_document_path, user_id: authData.user?.id ?? null })
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  } catch { return json({ error: 'Impossible de transmettre la demande.' }, 400) }
})
