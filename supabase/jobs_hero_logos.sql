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
    create table if not exists public.jobs_hero_logos (
      id uuid primary key default gen_random_uuid(),
      company_id %s not null references public.companies (id) on delete cascade,
      label text not null default '',
      logo_path text,
      sort_order integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  $fmt$, companies_id_type);
end $$;

create index if not exists jobs_hero_logos_company_idx
  on public.jobs_hero_logos (company_id);

create index if not exists jobs_hero_logos_order_idx
  on public.jobs_hero_logos (company_id, sort_order, created_at);

alter table public.jobs_hero_logos enable row level security;

drop policy if exists "jobs_hero_logos_select" on public.jobs_hero_logos;
drop policy if exists "jobs_hero_logos_insert" on public.jobs_hero_logos;
drop policy if exists "jobs_hero_logos_update" on public.jobs_hero_logos;
drop policy if exists "jobs_hero_logos_delete" on public.jobs_hero_logos;

create policy "jobs_hero_logos_select" on public.jobs_hero_logos
  for select to authenticated
  using (public.is_company_member());

create policy "jobs_hero_logos_insert" on public.jobs_hero_logos
  for insert to authenticated
  with check (public.is_company_admin());

create policy "jobs_hero_logos_update" on public.jobs_hero_logos
  for update to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

create policy "jobs_hero_logos_delete" on public.jobs_hero_logos
  for delete to authenticated
  using (public.is_company_admin());

create or replace function public.touch_jobs_hero_logos_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jobs_hero_logos_touch_updated_at on public.jobs_hero_logos;
create trigger jobs_hero_logos_touch_updated_at
before update on public.jobs_hero_logos
for each row
execute function public.touch_jobs_hero_logos_updated_at();

-- Ask PostgREST to reload schema (Supabase API schema cache).
do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    -- ignore (not all environments allow/need this)
    null;
end $$;

-- Some SQL runners don't deliver pg_notify reliably; a plain NOTIFY can help.
-- (Safe to run even if it does nothing.)
notify pgrst, 'reload schema';
