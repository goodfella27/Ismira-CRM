create or replace function public.is_hr_editor()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members
    where user_id::text = (select auth.uid())::text
      and lower(trim(role)) in ('admin', 'member premium', 'member_premium', 'premium', 'recruiter')
  );
$$;

revoke all on function public.is_hr_editor() from public;
grant execute on function public.is_hr_editor() to authenticated;

create table if not exists public.job_portal_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_level text not null check (access_level in ('member_basic', 'member_premium')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  access_until timestamptz,
  access_source text not null default 'manual'
    check (access_source in ('manual', 'payment', 'recruiter')),
  payment_provider text,
  payment_customer_id text,
  payment_subscription_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_portal_access_level_idx
  on public.job_portal_access (access_level, status);

alter table public.job_portal_access enable row level security;

grant select, insert, update, delete on public.job_portal_access to authenticated;

drop policy if exists "job_portal_access_select" on public.job_portal_access;
drop policy if exists "job_portal_access_insert" on public.job_portal_access;
drop policy if exists "job_portal_access_update" on public.job_portal_access;
drop policy if exists "job_portal_access_delete" on public.job_portal_access;

create policy "job_portal_access_select" on public.job_portal_access
  for select to authenticated
  using ((select auth.uid()) = user_id or public.is_company_admin());

create policy "job_portal_access_insert" on public.job_portal_access
  for insert to authenticated
  with check (public.is_company_admin());

create policy "job_portal_access_update" on public.job_portal_access
  for update to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

create policy "job_portal_access_delete" on public.job_portal_access
  for delete to authenticated
  using (public.is_company_admin());

create table if not exists public.job_premium_details (
  company_id text not null references public.companies (id) on delete cascade,
  breezy_position_id text not null,
  salary_text text,
  tips_text text,
  additional_info text,
  enabled boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, breezy_position_id)
);

create index if not exists job_premium_details_position_idx
  on public.job_premium_details (breezy_position_id);

alter table public.job_premium_details enable row level security;

grant select, insert, update, delete on public.job_premium_details to authenticated;

drop policy if exists "job_premium_details_select" on public.job_premium_details;
drop policy if exists "job_premium_details_insert" on public.job_premium_details;
drop policy if exists "job_premium_details_update" on public.job_premium_details;
drop policy if exists "job_premium_details_delete" on public.job_premium_details;

create policy "job_premium_details_select" on public.job_premium_details
  for select to authenticated
  using (public.is_hr_editor());

create policy "job_premium_details_insert" on public.job_premium_details
  for insert to authenticated
  with check (public.is_hr_editor());

create policy "job_premium_details_update" on public.job_premium_details
  for update to authenticated
  using (public.is_hr_editor())
  with check (public.is_hr_editor());

create policy "job_premium_details_delete" on public.job_premium_details
  for delete to authenticated
  using (public.is_hr_editor());

create or replace function public.touch_job_access_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists job_portal_access_touch_updated_at on public.job_portal_access;
create trigger job_portal_access_touch_updated_at
before update on public.job_portal_access
for each row execute function public.touch_job_access_updated_at();

drop trigger if exists job_premium_details_touch_updated_at on public.job_premium_details;
create trigger job_premium_details_touch_updated_at
before update on public.job_premium_details
for each row execute function public.touch_job_access_updated_at();

-- Preserve existing recruiters as Member Premium. Existing viewers/members
-- become Member Basic and are removed from the editable HR Portal membership.
insert into public.job_portal_access (user_id, access_level, status, access_source)
select distinct
  au.id,
  case
    when lower(trim(cm.role)) in ('recruiter', 'premium', 'member premium', 'member_premium')
      then 'member_premium'
    else 'member_basic'
  end,
  'active',
  case
    when lower(trim(cm.role)) in ('recruiter', 'premium', 'member premium', 'member_premium')
      then 'recruiter'
    else 'manual'
  end
from public.company_members cm
join auth.users au on au.id::text = cm.user_id::text
where lower(trim(cm.role)) <> 'admin'
on conflict (user_id) do update
set access_level = excluded.access_level,
    status = excluded.status,
    access_source = excluded.access_source;

update public.company_members
set role = 'Member Premium'
where lower(trim(role)) in ('recruiter', 'premium', 'member premium', 'member_premium');

delete from public.company_members
where lower(trim(role)) not in ('admin', 'member premium');

-- Job configuration tables use a consistent policy naming scheme. Replace
-- only their mutation policies so recruiters can edit job content without
-- receiving Admin rights over users, company settings or payments.
do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('breezy_positions', 'breezy_positions'),
      ('breezy_position_countries', 'breezy_position_countries'),
      ('breezy_priority_types', 'breezy_priority_types'),
      ('breezy_template_folders', 'breezy_template_folders'),
      ('breezy_templates', 'breezy_templates'),
      ('job_benefit_options', 'job_benefit_options'),
      ('job_companies', 'job_companies'),
      ('job_company_benefits', 'job_company_benefits'),
      ('job_company_merge_logs', 'job_company_merge_logs'),
      ('job_country_options', 'job_country_options'),
      ('job_departments', 'job_departments'),
      ('job_position_companies', 'job_position_companies'),
      ('job_testimonials', 'job_testimonials'),
      ('jobs_hero_logos', 'jobs_hero_logos')
    ) as policies(table_name, policy_prefix)
  loop
    if to_regclass(format('public.%I', item.table_name)) is null then
      continue;
    end if;

    execute format(
      'drop policy if exists %I on public.%I',
      item.policy_prefix || '_insert',
      item.table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_hr_editor())',
      item.policy_prefix || '_insert',
      item.table_name
    );

    execute format(
      'drop policy if exists %I on public.%I',
      item.policy_prefix || '_update',
      item.table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_hr_editor()) with check (public.is_hr_editor())',
      item.policy_prefix || '_update',
      item.table_name
    );

    execute format(
      'drop policy if exists %I on public.%I',
      item.policy_prefix || '_delete',
      item.table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_hr_editor())',
      item.policy_prefix || '_delete',
      item.table_name
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
