-- Company integration secrets/config.
-- Store third-party API keys in the database so they can be managed from the app UI.
-- NOTE: This is intentionally limited (only what we can safely manage in-app).

create table if not exists public.company_integrations (
  company_id uuid primary key references public.companies (id) on delete cascade,
  mailerlite_api_key text,
  hubspot_private_app_token text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.company_integrations
  add column if not exists hubspot_private_app_token text;

alter table public.company_integrations enable row level security;

drop policy if exists "company_integrations_select" on public.company_integrations;
drop policy if exists "company_integrations_insert" on public.company_integrations;
drop policy if exists "company_integrations_update" on public.company_integrations;
drop policy if exists "company_integrations_delete" on public.company_integrations;

-- Only company admins can view/update integration secrets via the client.
-- Server routes use the service role key and are not subject to these policies.
create policy "company_integrations_select" on public.company_integrations
  for select to authenticated
  using (public.is_company_admin());

create policy "company_integrations_insert" on public.company_integrations
  for insert to authenticated
  with check (public.is_company_admin());

create policy "company_integrations_update" on public.company_integrations
  for update to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

create policy "company_integrations_delete" on public.company_integrations
  for delete to authenticated
  using (public.is_company_admin());

create or replace function public.touch_company_integrations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists company_integrations_touch_updated_at on public.company_integrations;
create trigger company_integrations_touch_updated_at
before update on public.company_integrations
for each row
execute function public.touch_company_integrations_updated_at();
