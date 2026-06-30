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
    create table if not exists public.job_company_benefits (
      id uuid primary key default gen_random_uuid(),
      company_id %s not null references public.companies (id) on delete cascade,
      job_company_id uuid not null references public.job_companies (id) on delete cascade,
      tag text not null,
      sort_order integer not null default 0,
      enabled boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (company_id, job_company_id, tag)
    );
  $fmt$, companies_id_type);
end $$;

create index if not exists job_company_benefits_company_idx
  on public.job_company_benefits (company_id);

create index if not exists job_company_benefits_job_company_idx
  on public.job_company_benefits (job_company_id, sort_order);

alter table public.job_company_benefits enable row level security;

drop policy if exists "job_company_benefits_select" on public.job_company_benefits;
drop policy if exists "job_company_benefits_insert" on public.job_company_benefits;
drop policy if exists "job_company_benefits_update" on public.job_company_benefits;
drop policy if exists "job_company_benefits_delete" on public.job_company_benefits;

create policy "job_company_benefits_select" on public.job_company_benefits
  for select to authenticated
  using (public.is_company_member());

create policy "job_company_benefits_insert" on public.job_company_benefits
  for insert to authenticated
  with check (public.is_company_admin());

create policy "job_company_benefits_update" on public.job_company_benefits
  for update to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

create policy "job_company_benefits_delete" on public.job_company_benefits
  for delete to authenticated
  using (public.is_company_admin());

create or replace function public.touch_job_company_benefits_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists job_company_benefits_touch_updated_at on public.job_company_benefits;
create trigger job_company_benefits_touch_updated_at
before update on public.job_company_benefits
for each row
execute function public.touch_job_company_benefits_updated_at();

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    null;
end $$;

notify pgrst, 'reload schema';
