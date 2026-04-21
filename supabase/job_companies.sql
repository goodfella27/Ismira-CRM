create extension if not exists "pgcrypto";

do $$
declare
  companies_regclass regclass := to_regclass('public.companies');
  companies_id_type text;
begin
  if companies_regclass is null then
    raise exception 'public.companies table does not exist';
  end if;

  select pg_catalog.format_type(a.atttypid, a.atttypmod) into companies_id_type
  from pg_attribute a
  where a.attrelid = companies_regclass
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped
  limit 1;

  execute format($fmt$
    create table if not exists public.job_companies (
      id uuid primary key default gen_random_uuid(),
      company_id %s not null references public.companies (id) on delete cascade,
      breezy_company_id text,
      name text not null,
      normalized_name text not null,
      slug text not null,
      website text,
      logo_path text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (company_id, normalized_name),
      unique (company_id, slug)
    );
  $fmt$, companies_id_type);
end $$;

create index if not exists job_companies_company_idx
  on public.job_companies (company_id);

create index if not exists job_companies_breezy_company_idx
  on public.job_companies (breezy_company_id);

alter table public.job_companies enable row level security;

drop policy if exists "job_companies_select" on public.job_companies;
drop policy if exists "job_companies_insert" on public.job_companies;
drop policy if exists "job_companies_update" on public.job_companies;
drop policy if exists "job_companies_delete" on public.job_companies;

create policy "job_companies_select" on public.job_companies
  for select to authenticated
  using (public.is_company_member());

create policy "job_companies_insert" on public.job_companies
  for insert to authenticated
  with check (public.is_company_admin());

create policy "job_companies_update" on public.job_companies
  for update to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

create policy "job_companies_delete" on public.job_companies
  for delete to authenticated
  using (public.is_company_admin());

create or replace function public.touch_job_companies_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists job_companies_touch_updated_at on public.job_companies;
create trigger job_companies_touch_updated_at
before update on public.job_companies
for each row
execute function public.touch_job_companies_updated_at();

alter table public.breezy_positions
  add column if not exists job_company_id uuid references public.job_companies (id) on delete set null;

create index if not exists breezy_positions_job_company_idx
  on public.breezy_positions (job_company_id);

