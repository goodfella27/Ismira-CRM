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
    create table if not exists public.breezy_priority_types (
      id uuid primary key default gen_random_uuid(),
      company_id %s not null references public.companies (id) on delete cascade,
      key text not null,
      label text not null,
      sort_order integer not null default 0,
      show_on_frontpage boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (company_id, key)
    );
  $fmt$, companies_id_type);
end $$;

alter table if exists public.breezy_priority_types
  add column if not exists show_on_frontpage boolean not null default false;

update public.breezy_priority_types
set show_on_frontpage = true
where key in ('ongoing-interview', 'urgent-joining')
  or lower(label) in ('ongoing interview', 'urgent joining');

update public.breezy_priority_types
set show_on_frontpage = false
where key = 'on-hold'
  or lower(label) = 'on hold';

create index if not exists breezy_priority_types_company_idx
  on public.breezy_priority_types (company_id, sort_order, label);

alter table public.breezy_priority_types enable row level security;

drop policy if exists "breezy_priority_types_select" on public.breezy_priority_types;
drop policy if exists "breezy_priority_types_insert" on public.breezy_priority_types;
drop policy if exists "breezy_priority_types_update" on public.breezy_priority_types;
drop policy if exists "breezy_priority_types_delete" on public.breezy_priority_types;

create policy "breezy_priority_types_select" on public.breezy_priority_types
  for select to authenticated
  using (public.is_company_member());

create policy "breezy_priority_types_insert" on public.breezy_priority_types
  for insert to authenticated
  with check (public.is_company_admin());

create policy "breezy_priority_types_update" on public.breezy_priority_types
  for update to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

create policy "breezy_priority_types_delete" on public.breezy_priority_types
  for delete to authenticated
  using (public.is_company_admin());

create or replace function public.touch_breezy_priority_types_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists breezy_priority_types_touch_updated_at on public.breezy_priority_types;
create trigger breezy_priority_types_touch_updated_at
before update on public.breezy_priority_types
for each row
execute function public.touch_breezy_priority_types_updated_at();
