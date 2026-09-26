import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
    },
  })

const MAX_FILE_SIZE = 100 * 1024
const allowedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
])
const allowedExtensions = new Set(['pdf', 'jpg', 'jpeg', 'png', 'xls', 'xlsx', 'doc', 'docx'])

const SMALL_PLAN = 'small'
const LARGE_PLAN = 'large'
const SMALL_MAIN_QUOTA = 5000
const SMALL_BONUS_QUOTA = 50

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  const authorization = request.headers.get('Authorization')

  if (!authorization) {
    return json({ error: 'Authentification requise.' }, 401)
  }

  try {
    const form = await request.formData()

    const yearLabel = String(form.get('school_year') ?? '')
    const programName = String(form.get('program') ?? '')
    const className = String(form.get('class') ?? '')
    const periodName = String(form.get('period') ?? '')
    const legacyImport = String(form.get('legacy_import') ?? 'false') === 'true'

    const files = form
      .getAll('files')
      .filter(value => value instanceof File) as File[]

    if (
      !yearLabel ||
      !programName ||
      !className ||
      !periodName ||
      !files.length
    ) {
      return json(
        { error: 'Classement et fichiers obligatoires.' },
        400
      )
    }

    const invalidFile = files.find(file => {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
      return file.size > MAX_FILE_SIZE || !allowedExtensions.has(extension) || (Boolean(file.type) && !allowedMimeTypes.has(file.type))
    })

    if (invalidFile) {
      return json(
        { error: invalidFile.size > MAX_FILE_SIZE ? 'Taille maximum du fichier 100 Ko.' : 'Format de fichier non accepté.' },
        400
      )
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: {
            Authorization: authorization,
          },
        },
      }
    )

    const { data: userData } =
      await userClient.auth.getUser()

    if (!userData.user) {
      return json(
        { error: 'Session invalide.' },
        401
      )
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: profile } = await admin
      .from('profiles')
      .select('establishment_id')
      .eq('id', userData.user.id)
      .single()

    if (!profile?.establishment_id) {
      return json(
        { error: 'Établissement introuvable.' },
        403
      )
    }

    const establishmentId =
      profile.establishment_id

    await admin.rpc(
      'refresh_subscription_status',
      {
        target_establishment:
          establishmentId,
      }
    )

    const { data: subscription } =
      await admin
        .from('subscriptions')
        .select(
          'id, plan, start_date, end_date, status'
        )
        .eq(
          'establishment_id',
          establishmentId
        )
        .eq('status', 'active')
        .gt(
          'end_date',
          new Date().toISOString()
        )
        .order(
          'end_date',
          { ascending: false }
        )
        .limit(1)
        .maybeSingle()

    const activePlan =
      subscription?.plan ?? null

    /*
     * IMPORT DES ANCIENS BULLETINS
     *
     * Cette fonctionnalité est réservée à la Grande échelle.
     * Elle correspond à l'importation/intégration numérique
     * de fichiers de bulletins déjà existants.
     */
    if (legacyImport && activePlan !== LARGE_PLAN) {
      return json(
        {
          error:
            'L’import des anciens bulletins est réservé à la formule Grande échelle (44 000 FCFA/an).',
        },
        403
      )
    }

    /*
     * GRANDE ÉCHELLE :
     * bulletins illimités, y compris les anciens bulletins.
     */
    if (activePlan === LARGE_PLAN) {
      // Aucun quota de quantité n'est appliqué.
    } else {
      /*
       * PETITE ÉCHELLE :
       * 5 000 bulletins principaux + 50 bulletins bonus.
       *
       * Le compteur est calculé sur les bulletins créés depuis
       * le début de l'abonnement actif. Une nouvelle souscription
       * démarre donc un nouveau cycle de quota.
       */
      if (!subscription) {
        const {
          data: remaining,
        } = await admin.rpc(
          'free_bulletins_remaining',
          {
            target_establishment:
              establishmentId,
          }
        )

        if (
          (remaining ?? 0) < files.length
        ) {
          return json(
            {
              error:
                'Vous avez atteint la limite du nombre de bulletins sur le plan gratuit. Veuillez souscrire un abonnement pour continuer.',
            },
            403
          )
        }
      } else if (activePlan === SMALL_PLAN) {
        const {
          count: cycleCount,
          error: countError,
        } = await admin
          .from('bulletins')
          .select('id', {
            count: 'exact',
            head: true,
          })
          .eq(
            'establishment_id',
            establishmentId
          )
          .gte(
            'created_at',
            subscription.start_date
          )

        if (countError) {
          throw countError
        }

        const currentCount =
          cycleCount ?? 0

        const maximum =
          SMALL_MAIN_QUOTA +
          SMALL_BONUS_QUOTA

        if (
          currentCount >=
          maximum
        ) {
          return json(
            {
              error:
                'Votre quota de 5 000 bulletins et vos 50 bulletins bonus sont épuisés. Une nouvelle souscription est nécessaire pour ajouter de nouveaux bulletins.',
            },
            403
          )
        }

        if (
          currentCount >=
          SMALL_MAIN_QUOTA
        ) {
          const bonusUsed =
            currentCount -
            SMALL_MAIN_QUOTA

          const bonusRemaining =
            SMALL_BONUS_QUOTA -
            bonusUsed

          if (
            files.length >
            bonusRemaining
          ) {
            return json(
              {
                error:
                  `Votre quota principal de 5 000 bulletins est atteint. Il vous reste ${bonusRemaining} bulletin(s) bonus sur 50. Réduisez le nombre de fichiers envoyés ou souscrivez à nouveau.`,
              },
              403
            )
          }
        } else {
          const remainingBeforeBonus =
            maximum -
            currentCount

          if (
            files.length >
            remainingBeforeBonus
          ) {
            return json(
              {
                error:
                  `Votre quota disponible est de ${remainingBeforeBonus} bulletin(s).`,
              },
              403
            )
          }
        }
      } else {
        return json(
          {
            error:
              'Aucun abonnement actif. Souscrivez une formule pour continuer à archiver.',
          },
          403
        )
      }
    }

    const upsert = async (
      table: string,
      values: Record<string, unknown>,
      select = '*'
    ) => {
      const result =
        await admin
          .from(table)
          .upsert(
            values,
            {
              onConflict:
                table === 'school_years'
                  ? 'establishment_id,label'
                  : table === 'programs'
                    ? 'establishment_id,name'
                    : table === 'periods'
                      ? 'establishment_id,name'
                      : 'establishment_id,program_id,name',
            }
          )
          .select(select)
          .single()

      if (result.error) {
        throw result.error
      }

      return result.data
    }

    const year = await upsert(
      'school_years',
      {
        establishment_id:
          establishmentId,
        label: yearLabel,
      }
    )

    const program = await upsert(
      'programs',
      {
        establishment_id:
          establishmentId,
        name: programName,
      }
    )

    const schoolClass = await upsert(
      'classes',
      {
        establishment_id:
          establishmentId,
        program_id: program.id,
        name: className,
      }
    )

    const period = await upsert(
      'periods',
      {
        establishment_id:
          establishmentId,
        name: periodName,
        sort_order: 1,
      }
    )

    let archived = 0

    for (const file of files) {
      const stem =
        file.name.replace(
          /\.[^.]+$/,
          ''
        )

      const parts =
        stem
          .split('_')
          .map(part => part.trim())
          .filter(Boolean)

      const lastName =
        parts[0] ?? 'INCONNU'

      const firstName =
        parts[1] ?? 'Élève'

      const student =
        await admin
          .from('students')
          .upsert(
            {
              establishment_id:
                establishmentId,
              first_name:
                firstName,
              last_name:
                lastName,
              class_id:
                schoolClass.id,
              school_year_id:
                year.id,
            },
            {
              onConflict:
                'establishment_id,first_name,last_name,class_id,school_year_id',
            }
          )
          .select()
          .single()

      if (student.error) {
        throw student.error
      }

      const path =
        `${establishmentId}/${yearLabel}/${className}/${periodName}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

      const uploaded =
        await admin.storage
          .from('bulletins')
          .upload(
            path,
            file,
            {
              contentType:
                file.type,
              upsert: false,
            }
          )

      if (uploaded.error) {
        throw uploaded.error
      }

      const bulletin =
        await admin
          .from('bulletins')
          .insert({
            establishment_id:
              establishmentId,
            student_id:
              student.data.id,
            class_id:
              schoolClass.id,
            school_year_id:
              year.id,
            period_id:
              period.id,
            file_path:
              path,
            original_filename:
              file.name,
            file_type:
              file.type,
            file_size:
              file.size,
            uploaded_by:
              userData.user.id,
            status:
              'archived',
          })

      if (bulletin.error) {
        await admin.storage
          .from('bulletins')
          .remove([path])

        throw bulletin.error
      }

      archived++
    }

    await admin
      .from('audit_logs')
      .insert({
        establishment_id:
          establishmentId,
        user_id:
          userData.user.id,
        action:
          legacyImport
            ? 'legacy_bulletins_imported'
            : 'bulletins_archived',
        metadata: {
          count: archived,
          school_year:
            yearLabel,
          class:
            className,
          period:
            periodName,
          legacy_import:
            legacyImport,
          plan:
            activePlan,
        },
      })

    return json({
      ok: true,
      archived,
      legacy_import:
        legacyImport,
      plan:
        activePlan,
    })
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Archivage impossible.',
      },
      500
    )
  }
})