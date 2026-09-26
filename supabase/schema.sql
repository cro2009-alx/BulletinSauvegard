create extension if not exists pgcrypto;

create type establishment_status as enum ('pending', 'active', 'rejected', 'suspended');
create type member_role as enum ('establishment_admin', 'establishment_staff', 'platform_admin');
create type member_status as enum ('invited', 'active', 'disabled');
create type bulletin_status as enum ('pending', 'archived', 'deleted');
create type subscription_plan as enum ('quarterly', 'semester', 'annual');
create type subscription_status as enum ('pending', 'active', 'expired', 'cancelled');
create type payment_status as enum ('pending', 'successful', 'failed', 'cancelled');
create type activation_code_status as enum ('active', 'used', 'expired', 'revoked');

create table public.establishments (
  id uuid primary key default gen_random_uuid(), official_name text not null, requester_name text,
  phone text, professional_email text, city text, country text default 'Bénin', address text,
  status establishment_status not null default 'pending', free_bulletin_limit integer not null default 50 check (free_bulletin_limit >= 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.access_requests (
  id uuid primary key default gen_random_uuid(), establishment_id uuid references public.establishments(id) on delete set null,
  establishment_name text not null, authorization_number text not null, ifu text not null, requester_name text not null, requester_role text not null, phone text not null,
  email text not null, city text not null, country text not null, address text not null, supporting_document_path text,
  status establishment_status not null default 'pending', admin_note text, created_at timestamptz not null default now(), reviewed_at timestamptz, reviewed_by uuid references auth.users(id)
);
create table public.activation_codes (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  code_hash text not null unique,
  code_hint text not null,
  status activation_code_status not null default 'active',
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade, establishment_id uuid references public.establishments(id) on delete cascade,
  full_name text not null, email text not null, phone text, role member_role not null default 'establishment_staff', status member_status not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint profile_establishment_required check (role = 'platform_admin' or establishment_id is not null)
);
create table public.school_years (
  id uuid primary key default gen_random_uuid(), establishment_id uuid not null references public.establishments(id) on delete cascade,
  label text not null, created_at timestamptz not null default now(), unique(establishment_id, label)
);
create table public.programs (
  id uuid primary key default gen_random_uuid(), establishment_id uuid not null references public.establishments(id) on delete cascade,
  name text not null, created_at timestamptz not null default now(), unique(establishment_id, name)
);
create table public.classes (
  id uuid primary key default gen_random_uuid(), establishment_id uuid not null references public.establishments(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete restrict,
  name text not null, created_at timestamptz not null default now(), unique(establishment_id, program_id, name)
);
create table public.periods (
  id uuid primary key default gen_random_uuid(), establishment_id uuid not null references public.establishments(id) on delete cascade,
  name text not null, sort_order integer not null default 1, unique(establishment_id, name)
);
create table public.students (
  id uuid primary key default gen_random_uuid(), establishment_id uuid not null references public.establishments(id) on delete cascade,
  first_name text not null, last_name text not null, class_id uuid not null references public.classes(id), school_year_id uuid not null references public.school_years(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (establishment_id, first_name, last_name, class_id, school_year_id)
);
create table public.bulletins (
  id uuid primary key default gen_random_uuid(), establishment_id uuid not null references public.establishments(id) on delete cascade,
  student_id uuid not null references public.students(id), class_id uuid not null references public.classes(id), school_year_id uuid not null references public.school_years(id), period_id uuid not null references public.periods(id),
  file_path text not null, original_filename text not null, file_type text not null check (file_type in ('application/pdf', 'image/png', 'image/jpeg')), file_size bigint not null check (file_size > 0 and file_size <= 10485760), status bulletin_status not null default 'archived', uploaded_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(), establishment_id uuid not null references public.establishments(id) on delete cascade,
  plan subscription_plan not null, price integer not null check (price in (12000, 23000, 42000)), start_date timestamptz not null, end_date timestamptz not null, status subscription_status not null default 'pending', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (end_date > start_date)
);
create table public.payments (
  id uuid primary key default gen_random_uuid(), establishment_id uuid not null references public.establishments(id) on delete cascade, subscription_id uuid references public.subscriptions(id) on delete set null,
  amount integer not null check (amount > 0), currency text not null default 'XOF', provider text not null default 'fedapay', fedapay_transaction_id text unique, plan subscription_plan not null, status payment_status not null default 'pending', paid_at timestamptz, metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), establishment_id uuid not null references public.establishments(id) on delete cascade, user_id uuid references auth.users(id) on delete cascade, type text not null, title text not null, message text not null, read_at timestamptz, created_at timestamptz not null default now()
);
create table public.historical_archive_requests (
  id uuid primary key default gen_random_uuid(), establishment_id uuid not null references public.establishments(id) on delete cascade, requested_year_start integer not null, requested_year_end integer not null, estimated_bulletins integer, estimated_size text, description text, status text not null default 'pending', quoted_price integer, admin_note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (requested_year_end >= requested_year_start)
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), establishment_id uuid references public.establishments(id) on delete set null, user_id uuid references auth.users(id) on delete set null, action text not null, entity_type text, entity_id uuid, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);

create index students_search_idx on public.students (establishment_id, lower(last_name), school_year_id);
create index bulletins_filter_idx on public.bulletins (establishment_id, school_year_id, class_id, period_id);
create index bulletins_status_idx on public.bulletins (establishment_id, status);
create index subscriptions_lookup_idx on public.subscriptions (establishment_id, status, end_date);
create index payments_lookup_idx on public.payments (establishment_id, status, created_at desc);
create index access_requests_status_idx on public.access_requests (status, created_at desc);
create index activation_codes_lookup_idx on public.activation_codes (establishment_id, status, expires_at);
create index classes_program_idx on public.classes (establishment_id, program_id);

create or replace function public.is_platform_admin() returns boolean language sql stable security definer set search_path = public as $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'platform_admin' and status = 'active'); $$;
create or replace function public.user_establishment_id() returns uuid language sql stable security definer set search_path = public as $$ select establishment_id from public.profiles where id = auth.uid() and status = 'active' limit 1; $$;
create or replace function public.has_active_subscription(target_establishment uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists(select 1 from public.subscriptions where establishment_id = target_establishment and status = 'active' and end_date > now()); $$;
create or replace function public.refresh_subscription_status(target_establishment uuid) returns void language sql security definer set search_path = public as $$ update public.subscriptions set status = 'expired', updated_at = now() where establishment_id = target_establishment and status = 'active' and end_date <= now(); $$;
create or replace function public.free_bulletins_remaining(target_establishment uuid) returns integer language sql stable security definer set search_path = public as $$ select greatest(0, e.free_bulletin_limit - count(b.id)::integer) from public.establishments e left join public.bulletins b on b.establishment_id = e.id where e.id = target_establishment group by e.free_bulletin_limit; $$;
create or replace function public.enforce_bulletin_entitlement() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_subscription_status(new.establishment_id);
  if not public.has_active_subscription(new.establishment_id) and public.free_bulletins_remaining(new.establishment_id) <= 0 then
    raise exception using message = 'Vous avez atteint la limite du nombre de bulletins à envoyer sur le plan gratuit. Veuillez souscrire un abonnement pour continuer.';
  end if;
  return new;
end; $$;
create trigger bulletins_entitlement_trigger before insert on public.bulletins for each row execute function public.enforce_bulletin_entitlement();
create or replace function public.consume_activation_code(input_code text) returns jsonb language plpgsql security definer set search_path = public as $$
declare selected_code public.activation_codes%rowtype;
begin
  select * into selected_code from public.activation_codes where code_hash = encode(digest(input_code, 'sha256'), 'hex') for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if selected_code.status <> 'active' then return jsonb_build_object('ok', false, 'reason', selected_code.status); end if;
  if selected_code.expires_at < now() then update public.activation_codes set status = 'expired' where id = selected_code.id; return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  return jsonb_build_object('ok', true, 'establishment_id', selected_code.establishment_id, 'code_id', selected_code.id);
end; $$;

alter table public.establishments enable row level security;
alter table public.access_requests enable row level security;
alter table public.activation_codes enable row level security;
alter table public.profiles enable row level security;
alter table public.school_years enable row level security;
alter table public.programs enable row level security;
alter table public.classes enable row level security;
alter table public.periods enable row level security;
alter table public.students enable row level security;
alter table public.bulletins enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.notifications enable row level security;
alter table public.historical_archive_requests enable row level security;
alter table public.audit_logs enable row level security;

create policy platform_all_establishments on public.establishments for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy member_read_establishment on public.establishments for select using (id = public.user_establishment_id());
create policy public_create_access_request on public.access_requests for insert with check (true);
create policy admin_manage_requests on public.access_requests for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy admin_manage_activation_codes on public.activation_codes for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy member_profiles on public.profiles for select using (id = auth.uid() or establishment_id = public.user_establishment_id() or public.is_platform_admin());
create policy admin_profiles on public.profiles for all using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy member_school_years on public.school_years for all using (establishment_id = public.user_establishment_id()) with check (establishment_id = public.user_establishment_id());
create policy member_programs on public.programs for all using (establishment_id = public.user_establishment_id()) with check (establishment_id = public.user_establishment_id());
create policy member_classes on public.classes for all using (establishment_id = public.user_establishment_id()) with check (establishment_id = public.user_establishment_id());
create policy member_periods on public.periods for all using (establishment_id = public.user_establishment_id()) with check (establishment_id = public.user_establishment_id());
create policy member_students on public.students for all using (establishment_id = public.user_establishment_id()) with check (establishment_id = public.user_establishment_id());
create policy member_bulletins on public.bulletins for select using (establishment_id = public.user_establishment_id());
create policy member_bulletins_insert on public.bulletins for insert with check (establishment_id = public.user_establishment_id() and (public.has_active_subscription(establishment_id) or public.free_bulletins_remaining(establishment_id) > 0) and uploaded_by = auth.uid());
create policy member_bulletins_update on public.bulletins for update using (establishment_id = public.user_establishment_id()) with check (establishment_id = public.user_establishment_id());
create policy member_bulletins_delete on public.bulletins for delete using (establishment_id = public.user_establishment_id());
create policy member_subscriptions on public.subscriptions for select using (establishment_id = public.user_establishment_id());
create policy member_payments on public.payments for select using (establishment_id = public.user_establishment_id());
create policy member_notifications on public.notifications for select using (establishment_id = public.user_establishment_id() and (user_id is null or user_id = auth.uid()));
create policy member_history_requests on public.historical_archive_requests for all using (establishment_id = public.user_establishment_id()) with check (establishment_id = public.user_establishment_id());
create policy member_audit_logs on public.audit_logs for insert with check (establishment_id = public.user_establishment_id());
create policy admin_audit_logs on public.audit_logs for select using (public.is_platform_admin());

insert into storage.buckets (id, name, public) values ('bulletins', 'bulletins', false) on conflict (id) do nothing;
create policy bulletin_storage_read on storage.objects for select using (bucket_id = 'bulletins' and (public.is_platform_admin() or (storage.foldername(name))[1] = public.user_establishment_id()::text));
create policy bulletin_storage_insert on storage.objects for insert with check (bucket_id = 'bulletins' and (storage.foldername(name))[1] = public.user_establishment_id()::text);
create policy bulletin_storage_delete on storage.objects for delete using (bucket_id = 'bulletins' and (storage.foldername(name))[1] = public.user_establishment_id()::text);
insert into storage.buckets (id, name, public) values ('supporting-documents', 'supporting-documents', false) on conflict (id) do nothing;
create policy admin_supporting_documents on storage.objects for all using (bucket_id = 'supporting-documents' and public.is_platform_admin()) with check (bucket_id = 'supporting-documents' and public.is_platform_admin());
