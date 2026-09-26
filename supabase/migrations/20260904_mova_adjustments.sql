-- Migration incrementale pour une base ayant deja execute supabase/schema.sql.
-- A executer dans Supabase SQL Editor apres une sauvegarde de la base.

alter table public.establishments
  add column if not exists free_bulletin_limit integer not null default 50;

alter table public.access_requests
  add column if not exists authorization_number text,
  add column if not exists ifu text;

update public.access_requests
set authorization_number = coalesce(authorization_number, 'NON_RENSEIGNE'),
    ifu = coalesce(ifu, 'NON_RENSEIGNE')
where authorization_number is null or ifu is null;

alter table public.access_requests
  alter column authorization_number set not null,
  alter column ifu set not null;

create table if not exists public.activation_codes (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  code_hash text not null unique,
  code_hint text not null,
  status text not null default 'active' check (status in ('active', 'used', 'expired', 'revoked')),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique(establishment_id, name)
);

alter table public.classes add column if not exists program_id uuid references public.programs(id) on delete restrict;

alter table public.students drop constraint if exists students_establishment_id_first_name_last_name_class_id_school_year_id_key;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.students'::regclass
      and conname = 'students_identity_unique'
  ) then
    alter table public.students add constraint students_identity_unique unique (establishment_id, first_name, last_name, class_id, school_year_id);
  end if;
end $$;

alter table public.subscriptions
  alter column start_date type timestamptz using start_date::timestamptz,
  alter column end_date type timestamptz using end_date::timestamptz;

alter table public.payments add column if not exists fedapay_transaction_id text;
alter table public.payments add column if not exists plan text;
update public.payments set provider = 'fedapay' where provider is null;

create unique index if not exists payments_fedapay_transaction_id_uidx
  on public.payments(fedapay_transaction_id)
  where fedapay_transaction_id is not null;
create index if not exists activation_codes_lookup_idx on public.activation_codes(establishment_id, status, expires_at);
create index if not exists classes_program_idx on public.classes(establishment_id, program_id);

create or replace function public.has_active_subscription(target_establishment uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.subscriptions
  where establishment_id = target_establishment
    and status = 'active'
    and end_date > now()
); $$;

create or replace function public.refresh_subscription_status(target_establishment uuid)
returns void language sql security definer set search_path = public
as $$ update public.subscriptions
  set status = 'expired', updated_at = now()
  where establishment_id = target_establishment
    and status = 'active'
    and end_date <= now(); $$;

create or replace function public.free_bulletins_remaining(target_establishment uuid)
returns integer language sql stable security definer set search_path = public
as $$ select greatest(0, e.free_bulletin_limit - count(b.id)::integer)
  from public.establishments e
  left join public.bulletins b on b.establishment_id = e.id
  where e.id = target_establishment
  group by e.free_bulletin_limit; $$;

create or replace function public.enforce_bulletin_entitlement()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  perform public.refresh_subscription_status(new.establishment_id);
  if not public.has_active_subscription(new.establishment_id)
     and public.free_bulletins_remaining(new.establishment_id) <= 0 then
    raise exception using message = 'Vous avez atteint la limite du nombre de bulletins à envoyer sur le plan gratuit. Veuillez souscrire un abonnement pour continuer.';
  end if;
  return new;
end; $$;

drop trigger if exists bulletins_entitlement_trigger on public.bulletins;
create trigger bulletins_entitlement_trigger
before insert on public.bulletins
for each row execute function public.enforce_bulletin_entitlement();

alter table public.activation_codes enable row level security;
alter table public.programs enable row level security;

drop policy if exists admin_manage_activation_codes on public.activation_codes;
create policy admin_manage_activation_codes on public.activation_codes for all
using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists member_programs on public.programs;
create policy member_programs on public.programs for all
using (establishment_id = public.user_establishment_id())
with check (establishment_id = public.user_establishment_id());

-- Remplace l'ancienne policy qui exigeait un abonnement actif pour chaque insertion.
drop policy if exists member_bulletins on public.bulletins;
drop policy if exists member_bulletins_insert on public.bulletins;
drop policy if exists member_bulletins_update on public.bulletins;
drop policy if exists member_bulletins_delete on public.bulletins;
create policy member_bulletins on public.bulletins for select
using (establishment_id = public.user_establishment_id());
create policy member_bulletins_insert on public.bulletins for insert
with check (establishment_id = public.user_establishment_id() and uploaded_by = auth.uid());
create policy member_bulletins_update on public.bulletins for update
using (establishment_id = public.user_establishment_id())
with check (establishment_id = public.user_establishment_id());
create policy member_bulletins_delete on public.bulletins for delete
using (establishment_id = public.user_establishment_id());

insert into storage.buckets (id, name, public)
values ('supporting-documents', 'supporting-documents', false)
on conflict (id) do nothing;

drop policy if exists admin_supporting_documents on storage.objects;
create policy admin_supporting_documents on storage.objects for all
using (bucket_id = 'supporting-documents' and public.is_platform_admin())
with check (bucket_id = 'supporting-documents' and public.is_platform_admin());
