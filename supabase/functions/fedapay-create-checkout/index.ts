import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const plans = { quarterly: { amount: 12000, months: 3 }, semester: { amount: 23000, months: 6 }, annual: { amount: 42000, months: 12 } } as const
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const unwrap = (body: any) => body?.['v1/transaction'] ?? body?.v1?.transaction ?? body?.v1 ?? body?.transaction ?? body?.data?.transaction ?? body?.data ?? body?.result ?? body

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const auth = request.headers.get('Authorization')
  if (!auth) return json({ error: 'Authentification requise.' }, 401)
  try {
    const { plan } = await request.json()
    if (!(plan in plans)) return json({ error: 'Formule invalide.' }, 400)
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: profile, error: profileError } = await userClient.from('profiles').select('establishment_id').single()
    if (profileError || !profile?.establishment_id) return json({ error: 'Établissement introuvable.' }, 403)
    const selected = plans[plan as keyof typeof plans]
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: payment, error: paymentError } = await admin.from('payments').insert({ establishment_id: profile.establishment_id, amount: selected.amount, currency: 'XOF', plan, provider: 'fedapay', status: 'pending', metadata: { months: selected.months } }).select().single()
    if (paymentError) return json({ error: paymentError.message }, 500)

    const apiUrl = (Deno.env.get('FEDAPAY_API_URL') ?? 'https://sandbox-api.fedapay.com').replace(/\/$/, '')
    const secret = Deno.env.get('FEDAPAY_SECRET_KEY')
    if (!secret) return json({ error: 'La clé secrète FedaPay n\u2019est pas configurée côté serveur.' }, 500)
    const headers = { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Accept: 'application/json' }
    const transactionResponse = await fetch(`${apiUrl}/v1/transactions`, { method: 'POST', headers, body: JSON.stringify({ description: `MOVA Sauvegarde - ${plan}`, amount: selected.amount, currency: { iso: 'XOF' }, callback_url: `${Deno.env.get('APP_URL')}/paiement/retour`, metadata: { payment_id: payment.id, establishment_id: profile.establishment_id, plan } }) })
    const transactionBody = await transactionResponse.json().catch(() => ({}))
    const transaction = unwrap(transactionBody)
    const transactionId = transaction?.id ?? transaction?.transaction_id
    if (!transactionResponse.ok || !transactionId) return json({ error: `Réponse FedaPay inexploitable (${transactionResponse.status}).`, provider_status: transactionResponse.status, provider_error: transactionBody?.message ?? transactionBody?.error ?? transactionBody }, 502)

    const tokenResponse = await fetch(`${apiUrl}/v1/transactions/${transactionId}/token`, { method: 'POST', headers })
    const tokenBody = await tokenResponse.json().catch(() => ({}))
    const tokenData = unwrap(tokenBody)
    const token = tokenData?.token ?? tokenData?.checkout_token
    if (!tokenResponse.ok || !token) return json({ error: `FedaPay n\u2019a pas fourni le token de checkout (${tokenResponse.status}).`, provider_status: tokenResponse.status, provider_error: tokenBody?.message ?? tokenBody?.error ?? tokenBody }, 502)

    await admin.from('payments').update({ fedapay_transaction_id: String(transactionId), metadata: { ...payment.metadata, fedapay_transaction: transaction } }).eq('id', payment.id)
    return json({ payment_id: payment.id, transaction_id: String(transactionId), token })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Requête de paiement invalide.' }, 500)
  }
})