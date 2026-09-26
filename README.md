# Sauvegarde Bulletin

Application administrative pour archiver et retrouver les bulletins scolaires d'un établissement.

## Démarrer

```bash
npm install
copy .env.example .env.local
npm run dev
```

Renseignez ensuite `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans `.env.local`.
Dans le dashboard Supabase, exécutez [`supabase/schema.sql`](supabase/schema.sql). Ce script crée les tables relationnelles, les index, les fonctions d'isolation, les policies RLS et le bucket privé `bulletins`.

## Architecture

- Frontend : React, TypeScript, Vite, Lucide.
- Authentification : Supabase Auth avec session persistée.
- Données : PostgreSQL Supabase, toutes les données établissement sont filtrées par `user_establishment_id()`.
- Fichiers : bucket Storage privé, chemins préfixés par `establishment_id`.
- Paiement : FedaPay est intégré via les Edge Functions `fedapay-create-checkout` et `fedapay-webhook`. Configurez les secrets côté Supabase (`FEDAPAY_SECRET_KEY`, `FEDAPAY_WEBHOOK_SECRET`, `FEDAPAY_API_URL`, `APP_URL`) puis déclarez l'URL webhook FedaPay. Le frontend ne confirme jamais une transaction.

## Compte de test

Créez l'utilisateur dans Supabase Auth puis son profil dans `public.profiles` avec un `establishment_id` actif. Les compteurs du tableau de bord sont alors lus directement depuis PostgreSQL. Aucun compte établissement n'est créé librement par le frontend.

## Déploiement des fonctions

```bash
supabase functions deploy request-access --no-verify-jwt
supabase functions deploy activate-access
supabase functions deploy archive-bulletins
supabase functions deploy fedapay-create-checkout
supabase functions deploy fedapay-webhook --no-verify-jwt
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... FEDAPAY_SECRET_KEY=... FEDAPAY_WEBHOOK_SECRET=... FEDAPAY_API_URL=https://sandbox-api.fedapay.com APP_URL=https://votre-domaine.tld
```

Le compte FedaPay Business et ses moyens de paiement doivent être activés dans le tableau de bord FedaPay. Aucun numéro de transaction ni moyen de paiement interne n'est demandé à l'utilisateur.

## Vérifications

```bash
npm run lint
npm run build
```
