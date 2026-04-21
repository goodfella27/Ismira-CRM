-- Breezy email templates cache + local folders (organization only).
-- Stores raw Breezy template payload plus optional local folder assignment.
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

  -- Create tables with a company_id type that matches public.companies.id (uuid vs text).
  select pg_catalog.format_type(a.atttypid, a.atttypmod) into companies_id_type
  from pg_attribute a
  where a.attrelid = companies_regclass
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped
  limit 1;

  execute format($fmt$
    create table if not exists public.breezy_template_folders (
      id uuid primary key default gen_random_uuid(),
      company_id %s not null references public.companies (id) on delete cascade,
      breezy_company_id text not null,
      name text not null,
      sort_order int not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  $fmt$, companies_id_type);

  execute format($fmt$
    create table if not exists public.breezy_templates (
      company_id %s not null references public.companies (id) on delete cascade,
      breezy_company_id text not null,
      breezy_template_id text not null,
      name text,
      subject text,
      body text,
      raw jsonb not null default '{}'::jsonb,
      folder_id uuid references public.breezy_template_folders (id) on delete set null,
      synced_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (company_id, breezy_company_id, breezy_template_id)
    );
  $fmt$, companies_id_type);
end $$;

create unique index if not exists breezy_template_folders_unique
  on public.breezy_template_folders (company_id, breezy_company_id, lower(name));

create index if not exists breezy_template_folders_company_idx
  on public.breezy_template_folders (company_id);

create index if not exists breezy_template_folders_breezy_company_idx
  on public.breezy_template_folders (breezy_company_id);

create index if not exists breezy_templates_company_idx
  on public.breezy_templates (company_id);

create index if not exists breezy_templates_breezy_company_idx
  on public.breezy_templates (breezy_company_id);

create index if not exists breezy_templates_folder_idx
  on public.breezy_templates (folder_id);

alter table public.breezy_template_folders enable row level security;
alter table public.breezy_templates enable row level security;

drop policy if exists "breezy_template_folders_select" on public.breezy_template_folders;
drop policy if exists "breezy_template_folders_insert" on public.breezy_template_folders;
drop policy if exists "breezy_template_folders_update" on public.breezy_template_folders;
drop policy if exists "breezy_template_folders_delete" on public.breezy_template_folders;

create policy "breezy_template_folders_select" on public.breezy_template_folders
  for select to authenticated
  using (public.is_company_member());

create policy "breezy_template_folders_insert" on public.breezy_template_folders
  for insert to authenticated
  with check (public.is_company_admin());

create policy "breezy_template_folders_update" on public.breezy_template_folders
  for update to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

create policy "breezy_template_folders_delete" on public.breezy_template_folders
  for delete to authenticated
  using (public.is_company_admin());

drop policy if exists "breezy_templates_select" on public.breezy_templates;
drop policy if exists "breezy_templates_insert" on public.breezy_templates;
drop policy if exists "breezy_templates_update" on public.breezy_templates;
drop policy if exists "breezy_templates_delete" on public.breezy_templates;

create policy "breezy_templates_select" on public.breezy_templates
  for select to authenticated
  using (public.is_company_member());

create policy "breezy_templates_insert" on public.breezy_templates
  for insert to authenticated
  with check (public.is_company_admin());

create policy "breezy_templates_update" on public.breezy_templates
  for update to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

create policy "breezy_templates_delete" on public.breezy_templates
  for delete to authenticated
  using (public.is_company_admin());

create or replace function public.touch_breezy_template_folders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists breezy_template_folders_touch_updated_at on public.breezy_template_folders;
create trigger breezy_template_folders_touch_updated_at
before update on public.breezy_template_folders
for each row
execute function public.touch_breezy_template_folders_updated_at();

create or replace function public.touch_breezy_templates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists breezy_templates_touch_updated_at on public.breezy_templates;
create trigger breezy_templates_touch_updated_at
before update on public.breezy_templates
for each row
execute function public.touch_breezy_templates_updated_at();

