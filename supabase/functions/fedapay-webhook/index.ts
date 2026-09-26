import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (
  body: unknown,
  status = 200
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })

const unwrap = (body: any) =>
  body?.['v1/transaction'] ??
  body?.v1?.transaction ??
  body?.v1 ??
  body?.transaction ??
  body?.data?.transaction ??
  body?.data ??
  body?.result ??
  body

const plans = {
  small: {
    amount: 17000,
    months: 12,
  },
  large: {
    amount: 44000,
    months: 12,
  },
} as const

/**
 * Vérification officielle du format de signature FedaPay.
 *
 * Header attendu :
 * t=<timestamp>,s=<signature>
 *
 * FedaPay utilise :
 * HMAC-SHA256(`${timestamp}.${payload}`, secret)
 */
async function validSignature(
  raw: string,
  header: string | null,
  secret: string
) {
  if (!header || !secret) {
    return false
  }

  let timestamp = ''
  const signatures: string[] = []

  const parts = header.split(',')

  for (const part of parts) {
    const separatorIndex = part.indexOf('=')

    if (separatorIndex === -1) {
      continue
    }

    const key = part
      .slice(0, separatorIndex)
      .trim()

    const value = part
      .slice(separatorIndex + 1)
      .trim()

    if (key === 't') {
      timestamp = value
    }

    if (key === 's') {
      signatures.push(value)
    }
  }

  if (!timestamp || signatures.length === 0) {
    console.error(
      'Signature FedaPay invalide : timestamp ou signature absente.'
    )

    return false
  }

  const timestampNumber =
    Number(timestamp)

  if (
    !Number.isFinite(timestampNumber)
  ) {
    return false
  }

  /**
   * Protection contre les anciens/rejoués webhooks.
   * Tolérance : 5 minutes.
   */
  const tolerance = 300

  const now =
    Math.floor(Date.now() / 1000)

  if (
    Math.abs(
      now - timestampNumber
    ) > tolerance
  ) {
    console.error(
      'Signature FedaPay refusée : timestamp trop ancien.'
    )

    return false
  }

  /**
   * FedaPay signe :
   *
   * timestamp + "." + payload
   */
  const signedPayload =
    `${timestamp}.${raw}`

  const key =
    await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      {
        name: 'HMAC',
        hash: 'SHA-256',
      },
      false,
      ['sign']
    )

  const digest =
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(
        signedPayload
      )
    )

  const expectedSignature =
    [...new Uint8Array(digest)]
      .map((value) =>
        value
          .toString(16)
          .padStart(2, '0')
      )
      .join('')

  /**
   * Comparaison à temps constant.
   */
  for (const signature of signatures) {
    if (
      signature.length !==
      expectedSignature.length
    ) {
      continue
    }

    let difference = 0

    for (
      let i = 0;
      i < expectedSignature.length;
      i++
    ) {
      difference |=
        expectedSignature.charCodeAt(i) ^
        signature.charCodeAt(i)
    }

    if (difference === 0) {
      return true
    }
  }

  console.error(
    'Signature FedaPay incorrecte.'
  )

  return false
}

Deno.serve(async (request) => {
  try {
    /**
     * Lire le corps brut avant JSON.parse().
     * C'est indispensable pour vérifier la signature.
     */
    const raw =
      await request.text()

    const signatureHeader =
      request.headers.get(
        'x-fedapay-signature'
      )

    const webhookSecret =
      Deno.env.get(
        'FEDAPAY_WEBHOOK_SECRET'
      ) ?? ''

    /**
     * ============================================================
     * VÉRIFICATION SIGNATURE FEDAPAY
     * ============================================================
     */

    const signatureValid =
      await validSignature(
        raw,
        signatureHeader,
        webhookSecret
      )

    console.log(
      'FedaPay webhook debug:',
      {
        hasSignatureHeader:
          Boolean(signatureHeader),

        signatureHeaderLength:
          signatureHeader?.length ?? 0,

        rawBodyLength:
          raw.length,

        hasWebhookSecret:
          Boolean(webhookSecret),

        webhookSecretLength:
          webhookSecret.length,

        signatureValid,
      }
    )

    if (!signatureValid) {
      return json(
        {
          error:
            'Signature invalide.',
        },
        401
      )
    }

    /**
     * ============================================================
     * LECTURE DE L'ÉVÉNEMENT
     * ============================================================
     */

    const event =
      JSON.parse(raw)

    const entity =
      event?.entity ??
      event?.data?.entity

    const transactionId =
      String(
        entity?.id ?? ''
      )

    if (!transactionId) {
      return json(
        {
          error:
            'Transaction absente.',
        },
        400
      )
    }

    /**
     * ============================================================
     * CLIENT SUPABASE ADMIN
     * ============================================================
     */

    const supabaseUrl =
      Deno.env.get(
        'SUPABASE_URL'
      )

    const serviceRoleKey =
      Deno.env.get(
        'SUPABASE_SERVICE_ROLE_KEY'
      )

    if (
      !supabaseUrl ||
      !serviceRoleKey
    ) {
      console.error(
        'Variables Supabase manquantes.'
      )

      return json(
        {
          error:
            'Configuration Supabase manquante.',
        },
        500
      )
    }

    const admin =
      createClient(
        supabaseUrl,
        serviceRoleKey
      )

    /**
     * ============================================================
     * VÉRIFICATION D'UN PAIEMENT EXISTANT
     * ============================================================
     */

    const {
      data: existingPayment,
    } =
      await admin
        .from('payments')
        .select(
          'id, status'
        )
        .eq(
          'fedapay_transaction_id',
          transactionId
        )
        .maybeSingle()

    if (
      existingPayment?.status ===
      'successful'
    ) {
      return json({
        ok: true,
        duplicate: true,
      })
    }

    /**
     * ============================================================
     * VÉRIFICATION AUPRÈS DE FEDAPAY
     * ============================================================
     */

    const apiUrl = (
      Deno.env.get(
        'FEDAPAY_API_URL'
      ) ??
      'https://api.fedapay.com'
    ).replace(/\/$/, '')

    const fedapaySecretKey =
      Deno.env.get(
        'FEDAPAY_SECRET_KEY'
      )

    if (!fedapaySecretKey) {
      console.error(
        'FEDAPAY_SECRET_KEY est manquante.'
      )

      return json(
        {
          error:
            'Clé secrète FedaPay manquante.',
        },
        500
      )
    }

    const verifiedResponse =
      await fetch(
        `${apiUrl}/v1/transactions/${transactionId}`,
        {
          headers: {
            Authorization:
              `Bearer ${fedapaySecretKey}`,
          },
        }
      )

    const verifiedBody =
      await verifiedResponse
        .json()
        .catch(() => ({}))

    const transaction =
      unwrap(verifiedBody)

    if (
      !verifiedResponse.ok ||
      !transaction?.id
    ) {
      console.error(
        'Impossible de vérifier la transaction FedaPay:',
        {
          status:
            verifiedResponse.status,

          transactionId,
        }
      )

      return json(
        {
          error:
            'Impossible de vérifier la transaction auprès de FedaPay.',
        },
        502
      )
    }

    /**
     * ============================================================
     * MÉTADONNÉES
     * ============================================================
     */

    const metadata =
      transaction?.custom_metadata ??
      transaction?.metadata ??
      {}

    const establishmentId =
      metadata?.establishment_id

    const plan =
      metadata?.plan as
        | keyof typeof plans
        | undefined

    if (
      !establishmentId ||
      !plan ||
      !(plan in plans)
    ) {
      console.error(
        'Métadonnées de transaction invalides:',
        {
          transactionId,

          establishmentId:
            Boolean(
              establishmentId
            ),

          plan,
        }
      )

      return json(
        {
          error:
            'Métadonnées de transaction manquantes ou invalides.',
        },
        400
      )
    }

    /**
     * ============================================================
     * VÉRIFICATION MONTANT / DEVISE
     * ============================================================
     */

    const expected =
      plans[plan]

    const currencyIso =
      String(
        transaction?.currency?.iso ??
        transaction?.currency ??
        'XOF'
      )

    if (
      Number(
        transaction?.amount
      ) !== expected.amount ||
      currencyIso !== 'XOF'
    ) {
      console.error(
        'Transaction non conforme:',
        {
          transactionId,

          receivedAmount:
            transaction?.amount,

          expectedAmount:
            expected.amount,

          receivedCurrency:
            currencyIso,
        }
      )

      return json(
        {
          error:
            'Transaction non conforme au plan attendu.',
        },
        400
      )
    }

    /**
     * ============================================================
     * STATUT DU PAIEMENT
     * ============================================================
     */

    const successful =
      [
        'approved',
        'transferred',
        'paid',
      ].includes(
        String(
          transaction?.status ?? ''
        ).toLowerCase()
      )

    /**
     * ============================================================
     * PAIEMENT ÉCHOUÉ
     * ============================================================
     */

    if (!successful) {
      const {
        error: failedPaymentError,
      } =
        await admin
          .from('payments')
          .upsert(
            {
              fedapay_transaction_id:
                transactionId,

              establishment_id:
                establishmentId,

              plan,

              amount:
                expected.amount,

              currency:
                'XOF',

              provider:
                'fedapay',

              status:
                'failed',

              metadata: {
                webhook: event,
              },
            },
            {
              onConflict:
                'fedapay_transaction_id',
            }
          )

      if (failedPaymentError) {
        console.error(
          'Erreur enregistrement paiement échoué:',
          failedPaymentError
        )
      }

      return json({
        ok: true,
        status: 'failed',
      })
    }

    /**
     * ============================================================
     * CALCUL DE L'ABONNEMENT
     * ============================================================
     */

    const now =
      new Date()

    const {
      data: current,
    } =
      await admin
        .from('subscriptions')
        .select(
          'end_date'
        )
        .eq(
          'establishment_id',
          establishmentId
        )
        .eq(
          'status',
          'active'
        )
        .gt(
          'end_date',
          now.toISOString()
        )
        .order(
          'end_date',
          {
            ascending: false,
          }
        )
        .limit(1)
        .maybeSingle()

    const end =
      current?.end_date
        ? new Date(
            current.end_date
          )
        : new Date(now)

    end.setUTCMonth(
      end.getUTCMonth() +
        expected.months
    )

    /**
     * ============================================================
     * CRÉATION DE L'ABONNEMENT
     * ============================================================
     */

    const {
      data: subscription,
      error: subscriptionError,
    } =
      await admin
        .from('subscriptions')
        .insert({
          establishment_id:
            establishmentId,

          plan,

          price:
            expected.amount,

          start_date:
            now.toISOString(),

          end_date:
            end.toISOString(),

          status:
            'active',
        })
        .select()
        .single()

    if (subscriptionError) {
      console.error(
        'Erreur création abonnement:',
        subscriptionError
      )

      return json(
        {
          error:
            subscriptionError.message,
        },
        500
      )
    }

    /**
     * ============================================================
     * ENREGISTREMENT DU PAIEMENT
     * ============================================================
     */

    const {
      error: paymentError,
    } =
      await admin
        .from('payments')
        .upsert(
          {
            fedapay_transaction_id:
              transactionId,

            establishment_id:
              establishmentId,

            plan,

            amount:
              expected.amount,

            currency:
              'XOF',

            provider:
              'fedapay',

            status:
              'successful',

            paid_at:
              now.toISOString(),

            subscription_id:
              subscription.id,

            metadata: {
              webhook: event,
            },
          },
          {
            onConflict:
              'fedapay_transaction_id',
          }
        )

    if (paymentError) {
      console.error(
        'Erreur enregistrement paiement:',
        paymentError
      )

      return json(
        {
          error:
            paymentError.message,
        },
        500
      )
    }

    /**
     * ============================================================
     * NOTIFICATION
     * ============================================================
     */

    const {
      error: notificationError,
    } =
      await admin
        .from('notifications')
        .insert({
          establishment_id:
            establishmentId,

          type:
            'payment_confirmed',

          title:
            'Paiement confirmé',

          message:
            'Votre paiement a été confirmé. Votre abonnement est maintenant actif.',
        })

    if (notificationError) {
      console.error(
        'Erreur notification:',
        notificationError
      )
    }

    /**
     * ============================================================
     * SUCCÈS
     * ============================================================
     */

    return json({
      ok: true,
    })
  } catch (error) {
    console.error(
      'Erreur webhook FedaPay:',
      error
    )

    return json(
      {
        error:
          'Événement invalide.',
      },
      400
    )
  }
})