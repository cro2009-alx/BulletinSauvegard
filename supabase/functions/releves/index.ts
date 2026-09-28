import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_FILE_SIZE = 100 * 1024
const ALLOWED = new Set(['pdf', 'jpg', 'jpeg', 'png'])
const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const BATCH_MAX = 25

function mimeForExtension(ext: string) {
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'png') return 'image/png'
  return 'image/jpeg'
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function extension(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

async function hasValidSignature(file: File, ext: string) {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  if (ext === 'pdf') return new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-'
  if (ext === 'png') return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  if (ext === 'jpg' || ext === 'jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  return false
}

function cleanRelativePath(value: string) {
  return value
    .replaceAll('\\', '/')
    .split('/')
    .filter(part => part && part !== '.' && part !== '..')
    .join('/')
}

function subfolderFromRelative(relativePath: string, filename: string) {
  const clean = cleanRelativePath(relativePath)
  const withoutName = clean.endsWith('/' + filename)
    ? clean.slice(0, -(filename.length + 1))
    : clean.includes('/')
      ? clean.split('/').slice(0, -1).join('/')
      : ''
  return withoutName
}

async function userContext(req: Request) {
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) throw new Error('Non authentifié.')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
  })
  const admin = createClient(supabaseUrl, serviceKey)

  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) throw new Error('Session utilisateur invalide.')

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('establishment_id, role, status')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile?.establishment_id || profile.status !== 'active' || profile.role === 'platform_admin') {
    throw new Error('Établissement introuvable ou accès refusé.')
  }

  return { admin, user, establishmentId: profile.establishment_id as string }
}

async function deleteSessionFiles(admin: ReturnType<typeof createClient>, establishmentId: string, sessionId: string) {
  const prefix = `releves/${establishmentId}/${sessionId}/`
  const { data: rows } = await admin
    .from('releve_files')
    .select('file_path')
    .eq('establishment_id', establishmentId)
    .eq('session_id', sessionId)

  const paths = (rows ?? []).map(row => row.file_path).filter(Boolean)
  if (paths.length) await admin.storage.from('bulletins').remove(paths)
  await admin.from('releve_files').delete().eq('establishment_id', establishmentId).eq('session_id', sessionId)
  await admin.from('releve_sessions').delete().eq('establishment_id', establishmentId).eq('id', sessionId)

  // Nettoyage de sécurité des éventuels objets restants sous le préfixe.
  const { data: objects } = await admin.storage.from('bulletins').list(prefix, { limit: 1000 })
  if (objects?.length) {
    await admin.storage.from('bulletins').remove(objects.map(o => `${prefix}${o.name}`))
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { admin, establishmentId } = await userContext(req)
    const form = await req.formData()
    const action = String(form.get('action') ?? '')

    if (action === 'create-session') {
      const schoolYear = String(form.get('school_year') ?? '').trim()
      const examType = String(form.get('exam_type') ?? '').trim()
      if (!/^\d{4}-\d{4}$/.test(schoolYear)) return json({ error: 'Format d’année invalide. Utilisez AAAA-AAAA.' }, 400)
      if (!['CEP', 'BEPC'].includes(examType)) return json({ error: 'Type de relevé invalide.' }, 400)

      const { data, error } = await admin
        .from('releve_sessions')
        .insert({ establishment_id: establishmentId, school_year: schoolYear, exam_type: examType })
        .select('id, school_year, exam_type, created_at, updated_at')
        .single()
      if (error) return json({ error: error.message }, 400)
      return json({ session: data })
    }

    if (action === 'upload-batch') {
      const sessionId = String(form.get('session_id') ?? '').trim()
      if (!sessionId) return json({ error: 'Session manquante.' }, 400)

      const { data: session, error: sessionError } = await admin
        .from('releve_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('establishment_id', establishmentId)
        .maybeSingle()
      if (sessionError || !session) return json({ error: 'Session introuvable ou accès refusé.' }, 404)

      const files = form.getAll('files').filter(value => value instanceof File) as File[]
      const relativePaths = form.getAll('relative_paths').map(value => String(value))
      if (!files.length) return json({ error: 'Aucun fichier reçu.' }, 400)
      if (files.length > BATCH_MAX) return json({ error: `Maximum ${BATCH_MAX} fichiers par lot.` }, 400)

      const accepted: Array<{ file: File; relativePath: string; filename: string; subfolder: string; path: string }> = []
      const ignored: Array<{ name: string; reason: string }> = []

      for (const file of files) {
        const relativePath = cleanRelativePath(relativePaths[files.indexOf(file)] ?? file.name)
        const filename = file.name
        const ext = extension(filename)
        if (file.size > MAX_FILE_SIZE) {
          ignored.push({ name: filename, reason: 'Taille maximum du fichier 100 Ko.' })
          continue
        }
        if (!ALLOWED.has(ext) || (file.type && !ALLOWED_MIME.has(file.type)) || !(await hasValidSignature(file, ext))) {
          ignored.push({ name: filename, reason: 'Format non accepté. Formats autorisés : PDF, JPG, PNG.' })
          continue
        }

        const safeName = filename.replace(/[^a-zA-Z0-9À-ÿ._ -]/g, '_')
        const subfolder = subfolderFromRelative(relativePath, filename)
        const path = `releves/${establishmentId}/${sessionId}/${subfolder ? subfolder + '/' : ''}${crypto.randomUUID()}-${safeName}`
        accepted.push({ file, relativePath, filename, subfolder, path })
      }

      if (!accepted.length) return json({ uploaded: 0, ignored, message: 'Aucun fichier conforme dans ce lot.' })

      // Le trigger SQL applique le quota partagé au moment des insertions.
      // On traite fichier par fichier et on nettoie immédiatement si une insertion échoue.
      let uploaded = 0
      const uploadedPaths: string[] = []
      const insertedIds: string[] = []

      try {
        for (const item of accepted) {
          const { error: uploadError } = await admin.storage.from('bulletins').upload(item.path, item.file, {
            contentType: item.file.type,
            upsert: false,
          })
          if (uploadError) {
            ignored.push({ name: item.filename, reason: uploadError.message })
            continue
          }
          uploadedPaths.push(item.path)

          const { data: inserted, error: insertError } = await admin
            .from('releve_files')
            .insert({
              session_id: sessionId,
              establishment_id: establishmentId,
              file_path: item.path,
              original_filename: item.filename,
              relative_path: item.relativePath,
              subfolder: item.subfolder,
              mime_type: mimeForExtension(extension(item.filename)),
              size_bytes: item.file.size,
            })
            .select('id')
            .single()

          if (insertError) {
            await admin.storage.from('bulletins').remove([item.path])
            if (insertError.message.includes('limite du nombre de bulletins')) {
              ignored.push({ name: item.filename, reason: 'Quota gratuit atteint.' })
              // Le reste du lot ne peut pas passer non plus.
              break
            }
            ignored.push({ name: item.filename, reason: insertError.message })
            continue
          }

          insertedIds.push(inserted.id)
          uploaded++
        }
      } catch (error) {
        if (uploadedPaths.length) await admin.storage.from('bulletins').remove(uploadedPaths)
        if (insertedIds.length) await admin.from('releve_files').delete().in('id', insertedIds)
        throw error
      }

      return json({ uploaded, ignored })
    }

    if (action === 'delete-file') {
      const fileId = String(form.get('file_id') ?? '').trim()
      const { data: row } = await admin
        .from('releve_files')
        .select('id, file_path')
        .eq('id', fileId)
        .eq('establishment_id', establishmentId)
        .maybeSingle()
      if (!row) return json({ error: 'Fichier introuvable.' }, 404)
      await admin.storage.from('bulletins').remove([row.file_path])
      const { error } = await admin.from('releve_files').delete().eq('id', fileId).eq('establishment_id', establishmentId)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    if (action === 'delete-session') {
      const sessionId = String(form.get('session_id') ?? '').trim()
      const { data: session } = await admin
        .from('releve_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('establishment_id', establishmentId)
        .maybeSingle()
      if (!session) return json({ error: 'Session introuvable.' }, 404)
      await deleteSessionFiles(admin, establishmentId, sessionId)
      return json({ ok: true })
    }

    return json({ error: 'Action inconnue.' }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erreur serveur.' }, 401)
  }
})
