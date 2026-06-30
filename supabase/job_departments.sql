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
    create table if not exists public.job_departments (
      id uuid primary key default gen_random_uuid(),
      company_id %s not null references public.companies (id) on delete cascade,
      key text not null,
      label text not null default '',
      is_hidden boolean not null default false,
      sort_order integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (company_id, key)
    );
  $fmt$, companies_id_type);
end $$;

create index if not exists job_departments_company_order_idx
  on public.job_departments (company_id, is_hidden, sort_order, label);

alter table public.job_departments enable row level security;

drop policy if exists "job_departments_select" on public.job_departments;
drop policy if exists "job_departments_insert" on public.job_departments;
drop policy if exists "job_departments_update" on public.job_departments;
drop policy if exists "job_departments_delete" on public.job_departments;

create policy "job_departments_select" on public.job_departments
  for select to authenticated
  using (public.is_company_member());

create policy "job_departments_insert" on public.job_departments
  for insert to authenticated
  with check (public.is_company_admin());

create policy "job_departments_update" on public.job_departments
  for update to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

create policy "job_departments_delete" on public.job_departments
  for delete to authenticated
  using (public.is_company_admin());

create or replace function public.touch_job_departments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists job_departments_touch_updated_at on public.job_departments;
create trigger job_departments_touch_updated_at
before update on public.job_departments
for each row
execute function public.touch_job_departments_updated_at();

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    null;
end $$;

notify pgrst, 'reload schema';
