-- Breezy position nationality flags extracted from position descriptions.
-- Stores ISO-3166 alpha-2 country codes + display names, grouped by meaning.
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

  select pg_catalog.format_type(a.atttypid, a.atttypmod) into companies_id_type
  from pg_attribute a
  where a.attrelid = companies_regclass
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped
  limit 1;

  execute format($fmt$
    create table if not exists public.breezy_position_countries (
      company_id %s not null references public.companies (id) on delete cascade,
      breezy_company_id text not null,
      breezy_position_id text not null,
      country_code text not null,
      country_name text,
      "group" text not null default 'mentioned',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (company_id, breezy_position_id, country_code, "group")
    );
  $fmt$, companies_id_type);
end $$;

do $$
begin
  if to_regclass('public.breezy_position_countries') is null then
    return;
  end if;

  if exists(
    select 1
    from pg_constraint c
    where c.conrelid = 'public.breezy_position_countries'::regclass
      and c.conname = 'breezy_position_countries_group_check'
  ) then
    return;
  end if;

  alter table public.breezy_position_countries
    add constraint breezy_position_countries_group_check
    check ("group" in ('processable', 'blocked', 'mentioned'));
end $$;

create index if not exists breezy_position_countries_company_idx
  on public.breezy_position_countries (company_id);

create index if not exists breezy_position_countries_position_idx
  on public.breezy_position_countries (company_id, breezy_position_id);

create index if not exists breezy_position_countries_code_idx
  on public.breezy_position_countries (company_id, country_code);

alter table public.breezy_position_countries enable row level security;

drop policy if exists "breezy_position_countries_select" on public.breezy_position_countries;
drop policy if exists "breezy_position_countries_insert" on public.breezy_position_countries;
drop policy if exists "breezy_position_countries_update" on public.breezy_position_countries;
drop policy if exists "breezy_position_countries_delete" on public.breezy_position_countries;

create policy "breezy_position_countries_select" on public.breezy_position_countries
  for select to authenticated
  using (public.is_company_member());

create policy "breezy_position_countries_insert" on public.breezy_position_countries
  for insert to authenticated
  with check (public.is_company_admin());

create policy "breezy_position_countries_update" on public.breezy_position_countries
  for update to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

create policy "breezy_position_countries_delete" on public.breezy_position_countries
  for delete to authenticated
  using (public.is_company_admin());

create or replace function public.touch_breezy_position_countries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists breezy_position_countries_touch_updated_at on public.breezy_position_countries;
create trigger breezy_position_countries_touch_updated_at
before update on public.breezy_position_countries
for each row
execute function public.touch_breezy_position_countries_updated_at();
