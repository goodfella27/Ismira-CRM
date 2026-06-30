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
    create table if not exists public.job_country_options (
      id uuid primary key default gen_random_uuid(),
      company_id %s not null references public.companies (id) on delete cascade,
      code text not null,
      name text not null,
      sort_order integer not null default 0,
      enabled boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (company_id, code)
    );
  $fmt$, companies_id_type);
end $$;

create index if not exists job_country_options_company_idx
  on public.job_country_options (company_id, sort_order);

alter table public.job_country_options enable row level security;

drop policy if exists "job_country_options_select" on public.job_country_options;
drop policy if exists "job_country_options_insert" on public.job_country_options;
drop policy if exists "job_country_options_update" on public.job_country_options;
drop policy if exists "job_country_options_delete" on public.job_country_options;

create policy "job_country_options_select" on public.job_country_options
  for select to authenticated
  using (public.is_company_member());

create policy "job_country_options_insert" on public.job_country_options
  for insert to authenticated
  with check (public.is_company_admin());

create policy "job_country_options_update" on public.job_country_options
  for update to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

create policy "job_country_options_delete" on public.job_country_options
  for delete to authenticated
  using (public.is_company_admin());

create or replace function public.touch_job_country_options_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists job_country_options_touch_updated_at on public.job_country_options;
create trigger job_country_options_touch_updated_at
before update on public.job_country_options
for each row
execute function public.touch_job_country_options_updated_at();

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    null;
end $$;

notify pgrst, 'reload schema';
