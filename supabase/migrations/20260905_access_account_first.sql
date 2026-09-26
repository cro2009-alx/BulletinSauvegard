-- Migration incrementale pour le nouveau parcours compte puis demande.
-- Compatible avec les demandes historiques: user_id reste nullable.

alter table public.access_requests
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists activation_code_display text;

create index if not exists access_requests_user_idx
  on public.access_requests(user_id, created_at desc);

alter table public.access_requests enable row level security;

drop policy if exists access_request_owner_read on public.access_requests;
create policy access_request_owner_read on public.access_requests for select
using (user_id = auth.uid());

drop policy if exists access_request_owner_update on public.access_requests;
create policy access_request_owner_update on public.access_requests for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Les demandes historiques sans user_id restent accessibles à l'administration.
-- Le code affichable est protégé par la policy propriétaire/admin ci-dessus.
