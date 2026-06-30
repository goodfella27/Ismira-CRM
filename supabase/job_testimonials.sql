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
    create table if not exists public.job_testimonials (
      id uuid primary key default gen_random_uuid(),
      company_id %s not null references public.companies (id) on delete cascade,
      name text not null default '',
      role text not null default '',
      country text not null default '',
      quote text not null default '',
      image_path text,
      is_active boolean not null default true,
      sort_order integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  $fmt$, companies_id_type);
end $$;

create index if not exists job_testimonials_company_idx
  on public.job_testimonials (company_id);

create index if not exists job_testimonials_public_order_idx
  on public.job_testimonials (company_id, is_active, sort_order, created_at);

alter table public.job_testimonials enable row level security;

drop policy if exists "job_testimonials_select" on public.job_testimonials;
drop policy if exists "job_testimonials_insert" on public.job_testimonials;
drop policy if exists "job_testimonials_update" on public.job_testimonials;
drop policy if exists "job_testimonials_delete" on public.job_testimonials;

create policy "job_testimonials_select" on public.job_testimonials
  for select to authenticated
  using (public.is_company_member());

create policy "job_testimonials_insert" on public.job_testimonials
  for insert to authenticated
  with check (public.is_company_admin());

create policy "job_testimonials_update" on public.job_testimonials
  for update to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

create policy "job_testimonials_delete" on public.job_testimonials
  for delete to authenticated
  using (public.is_company_admin());

create or replace function public.touch_job_testimonials_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists job_testimonials_touch_updated_at on public.job_testimonials;
create trigger job_testimonials_touch_updated_at
before update on public.job_testimonials
for each row
execute function public.touch_job_testimonials_updated_at();

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    null;
end $$;

notify pgrst, 'reload schema';
