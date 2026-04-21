-- Breezy positions cache for Jobs Board + in-app edits.
-- Stores raw Breezy position payload plus optional local overrides.
--
-- Prereq: `public.companies.id` must be UNIQUE/PK (otherwise FK creation fails with ERROR 42830).

create extension if not exists pgcrypto;

do $$
declare
  companies_regclass regclass;
  id_attnum smallint;
  has_unique_on_id boolean;
  companies_id_type text;
begin
  companies_regclass := to_regclass('public.companies');
  if companies_regclass is null then
    return;
  end if;

  select a.attnum into id_attnum
  from pg_attribute a
  where a.attrelid = companies_regclass
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped
  limit 1;

  if id_attnum is null then
    return;
  end if;

  select exists(
    select 1
    from pg_constraint c
    where c.conrelid = companies_regclass
      and c.contype in ('p', 'u')
      and c.conkey = array[id_attnum]
  ) into has_unique_on_id;

  if not has_unique_on_id then
    alter table public.companies
      add constraint companies_id_unique unique (id);
  end if;

  -- Create table with a company_id type that matches public.companies.id (uuid vs text).
  select pg_catalog.format_type(a.atttypid, a.atttypmod) into companies_id_type
  from pg_attribute a
  where a.attrelid = companies_regclass
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped
  limit 1;

  execute format($fmt$
    create table if not exists public.breezy_positions (
      company_id %s not null references public.companies (id) on delete cascade,
      breezy_company_id text not null,
      breezy_position_id text not null,
      name text,
      state text,
      friendly_id text,
      org_type text,
      company text,
      department text,
      details jsonb,
      overrides jsonb not null default '{}'::jsonb,
      synced_at timestamptz,
      details_synced_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (company_id, breezy_position_id)
    );
  $fmt$, companies_id_type);
end $$;

alter table public.breezy_positions
  add column if not exists company text;

alter table public.breezy_positions
  add column if not exists department text;

alter table public.breezy_positions
  add column if not exists org_type text;

create index if not exists breezy_positions_company_idx
  on public.breezy_positions (company_id);

create index if not exists breezy_positions_breezy_company_idx
  on public.breezy_positions (breezy_company_id);

create index if not exists breezy_positions_state_idx
  on public.breezy_positions (state);

create index if not exists breezy_positions_company_label_idx
  on public.breezy_positions (company);

create index if not exists breezy_positions_department_idx
  on public.breezy_positions (department);

alter table public.breezy_positions enable row level security;

drop policy if exists "breezy_positions_select" on public.breezy_positions;
drop policy if exists "breezy_positions_insert" on public.breezy_positions;
drop policy if exists "breezy_positions_update" on public.breezy_positions;
drop policy if exists "breezy_positions_delete" on public.breezy_positions;

create policy "breezy_positions_select" on public.breezy_positions
  for select to authenticated
  using (public.is_company_member());

create policy "breezy_positions_insert" on public.breezy_positions
  for insert to authenticated
  with check (public.is_company_admin());

create policy "breezy_positions_update" on public.breezy_positions
  for update to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

create policy "breezy_positions_delete" on public.breezy_positions
  for delete to authenticated
  using (public.is_company_admin());

create or replace function public.touch_breezy_positions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists breezy_positions_touch_updated_at on public.breezy_positions;
create trigger breezy_positions_touch_updated_at
before update on public.breezy_positions
for each row
execute function public.touch_breezy_positions_updated_at();
