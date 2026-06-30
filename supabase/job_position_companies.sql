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
    create table if not exists public.job_position_companies (
      id uuid primary key default gen_random_uuid(),
      company_id %s not null references public.companies (id) on delete cascade,
      breezy_position_id text not null,
      job_company_id uuid not null references public.job_companies (id) on delete cascade,
      is_primary boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (company_id, breezy_position_id, job_company_id)
    );
  $fmt$, companies_id_type);
end $$;

create index if not exists job_position_companies_position_idx
  on public.job_position_companies (company_id, breezy_position_id);

create index if not exists job_position_companies_company_idx
  on public.job_position_companies (company_id, job_company_id);

alter table public.job_position_companies enable row level security;

drop policy if exists "job_position_companies_select" on public.job_position_companies;
drop policy if exists "job_position_companies_insert" on public.job_position_companies;
drop policy if exists "job_position_companies_update" on public.job_position_companies;
drop policy if exists "job_position_companies_delete" on public.job_position_companies;

create policy "job_position_companies_select" on public.job_position_companies
  for select to authenticated
  using (public.is_company_member());

create policy "job_position_companies_insert" on public.job_position_companies
  for insert to authenticated
  with check (public.is_company_admin());

create policy "job_position_companies_update" on public.job_position_companies
  for update to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

create policy "job_position_companies_delete" on public.job_position_companies
  for delete to authenticated
  using (public.is_company_admin());

create or replace function public.touch_job_position_companies_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists job_position_companies_touch_updated_at on public.job_position_companies;
create trigger job_position_companies_touch_updated_at
before update on public.job_position_companies
for each row
execute function public.touch_job_position_companies_updated_at();

insert into public.job_position_companies (company_id, breezy_position_id, job_company_id, is_primary)
select bp.company_id, bp.breezy_position_id, bp.job_company_id, true
from public.breezy_positions bp
where bp.job_company_id is not null
on conflict (company_id, breezy_position_id, job_company_id) do update
set is_primary = true;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    null;
end $$;

notify pgrst, 'reload schema';
