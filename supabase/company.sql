create extension if not exists "pgcrypto";

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists public.company_members (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'Member',
  created_at timestamptz default now(),
  primary key (company_id, user_id)
);

create index if not exists company_members_user_idx
  on public.company_members (user_id);

alter table public.companies enable row level security;
alter table public.company_members enable row level security;

create table if not exists public.company_task_watchers (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz default now(),
  primary key (company_id, user_id)
);

create index if not exists company_task_watchers_company_idx
  on public.company_task_watchers (company_id);

alter table public.company_task_watchers enable row level security;

create or replace function public.is_company_member()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists(
    select 1
    from public.company_members
    where user_id = auth.uid()
  );
$$;

create or replace function public.is_company_admin()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists(
    select 1
    from public.company_members
    where user_id = auth.uid()
      and lower(role) = 'admin'
  );
$$;

drop policy if exists "companies_select" on public.companies;
drop policy if exists "companies_insert" on public.companies;
drop policy if exists "companies_update" on public.companies;
drop policy if exists "companies_delete" on public.companies;
create policy "companies_select" on public.companies
  for select to authenticated
  using (public.is_company_member());
create policy "companies_insert" on public.companies
  for insert to authenticated
  with check (public.is_company_admin());
create policy "companies_update" on public.companies
  for update to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());
create policy "companies_delete" on public.companies
  for delete to authenticated
  using (public.is_company_admin());

drop policy if exists "company_members_select" on public.company_members;
drop policy if exists "company_members_insert" on public.company_members;
drop policy if exists "company_members_update" on public.company_members;
drop policy if exists "company_members_delete" on public.company_members;
create policy "company_members_select" on public.company_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_company_admin()
  );
create policy "company_members_insert" on public.company_members
  for insert to authenticated
  with check (public.is_company_admin());
create policy "company_members_update" on public.company_members
  for update to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());
create policy "company_members_delete" on public.company_members
  for delete to authenticated
  using (public.is_company_admin());

drop policy if exists "company_task_watchers_select" on public.company_task_watchers;
drop policy if exists "company_task_watchers_insert" on public.company_task_watchers;
drop policy if exists "company_task_watchers_delete" on public.company_task_watchers;
create policy "company_task_watchers_select" on public.company_task_watchers
  for select to authenticated
  using (public.is_company_admin());
create policy "company_task_watchers_insert" on public.company_task_watchers
  for insert to authenticated
  with check (public.is_company_admin());
create policy "company_task_watchers_delete" on public.company_task_watchers
  for delete to authenticated
  using (public.is_company_admin());

create or replace function public.company_task_watchers_require_admin()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not exists (
    select 1
    from public.company_members cm
    where cm.company_id = new.company_id
      and cm.user_id = new.user_id
      and lower(cm.role) = 'admin'
  ) then
    raise exception 'Only admin users can be task watchers';
  end if;
  return new;
end;
$$;

drop trigger if exists company_task_watchers_require_admin on public.company_task_watchers;
create trigger company_task_watchers_require_admin
before insert on public.company_task_watchers
for each row
execute function public.company_task_watchers_require_admin();
