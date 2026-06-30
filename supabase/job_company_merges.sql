create extension if not exists "pgcrypto";

drop function if exists public.merge_job_companies(uuid, uuid, uuid, uuid);
drop function if exists public.undo_job_company_merge(uuid, uuid, uuid);

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
    create table if not exists public.job_company_merge_logs (
      id uuid primary key default gen_random_uuid(),
      company_id %s not null references public.companies (id) on delete cascade,
      source_job_company_id uuid not null references public.job_companies (id) on delete cascade,
      target_job_company_id uuid not null references public.job_companies (id) on delete cascade,
      source_snapshot jsonb not null,
      target_snapshot jsonb not null,
      position_snapshots jsonb not null default '[]'::jsonb,
      copied_benefits jsonb not null default '[]'::jsonb,
      created_by uuid references auth.users (id) on delete set null,
      created_at timestamptz not null default now(),
      undone_at timestamptz,
      undone_by uuid references auth.users (id) on delete set null,
      constraint job_company_merge_logs_distinct_companies
        check (source_job_company_id <> target_job_company_id)
    );
  $fmt$, companies_id_type);
end $$;

create index if not exists job_company_merge_logs_company_idx
  on public.job_company_merge_logs (company_id, created_at desc);

create index if not exists job_company_merge_logs_source_idx
  on public.job_company_merge_logs (source_job_company_id);

create index if not exists job_company_merge_logs_target_idx
  on public.job_company_merge_logs (target_job_company_id);

alter table public.job_company_merge_logs enable row level security;

drop policy if exists "job_company_merge_logs_select" on public.job_company_merge_logs;
drop policy if exists "job_company_merge_logs_insert" on public.job_company_merge_logs;
drop policy if exists "job_company_merge_logs_update" on public.job_company_merge_logs;
drop policy if exists "job_company_merge_logs_delete" on public.job_company_merge_logs;

create policy "job_company_merge_logs_select" on public.job_company_merge_logs
  for select to authenticated
  using (public.is_company_member());

create policy "job_company_merge_logs_insert" on public.job_company_merge_logs
  for insert to authenticated
  with check (public.is_company_admin());

create policy "job_company_merge_logs_update" on public.job_company_merge_logs
  for update to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

create or replace function public.merge_job_companies(
  p_company_id text,
  p_source_job_company_id uuid,
  p_target_job_company_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $merge_job_companies$
declare
  source_row public.job_companies%rowtype;
  target_row public.job_companies%rowtype;
  merge_log_id uuid;
  position_snapshots jsonb := '[]'::jsonb;
  copied_benefits jsonb := '[]'::jsonb;
  positions_moved integer := 0;
  benefits_copied integer := 0;
  source_metadata jsonb;
begin
  if p_source_job_company_id = p_target_job_company_id then
    raise exception 'Source and target companies must be different.';
  end if;

  select * into source_row
  from public.job_companies
  where company_id::text = p_company_id
    and id = p_source_job_company_id
  for update;

  if not found then
    raise exception 'Source job company not found.';
  end if;

  select * into target_row
  from public.job_companies
  where company_id::text = p_company_id
    and id = p_target_job_company_id
  for update;

  if not found then
    raise exception 'Target job company not found.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'breezy_position_id', breezy_position_id,
        'breezy_company_id', breezy_company_id,
        'previous_job_company_id', job_company_id,
        'previous_company', company
      )
      order by breezy_position_id
    ),
    '[]'::jsonb
  )
  into position_snapshots
  from public.breezy_positions
  where company_id::text = p_company_id
    and (
      coalesce(job_company_id::text, '') = p_source_job_company_id::text
      or lower(regexp_replace(trim(coalesce(company, '')), '\s+', ' ', 'g')) = source_row.normalized_name
    );

  with inserted as (
    insert into public.job_company_benefits (
      company_id,
      job_company_id,
      tag,
      sort_order,
      enabled
    )
    select
      company_id,
      p_target_job_company_id,
      tag,
      sort_order,
      enabled
    from public.job_company_benefits
    where company_id::text = p_company_id
      and job_company_id = p_source_job_company_id
    on conflict (company_id, job_company_id, tag) do nothing
    returning id, tag
  )
  select
    coalesce(jsonb_agg(jsonb_build_object('id', id, 'tag', tag) order by tag), '[]'::jsonb),
    count(*)::integer
  into copied_benefits, benefits_copied
  from inserted;

  update public.breezy_positions
  set job_company_id = p_target_job_company_id,
      company = target_row.name
  where company_id::text = p_company_id
    and (
      coalesce(job_company_id::text, '') = p_source_job_company_id::text
      or lower(regexp_replace(trim(coalesce(company, '')), '\s+', ' ', 'g')) = source_row.normalized_name
    );

  get diagnostics positions_moved = row_count;

  source_metadata := coalesce(source_row.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'merged_into_job_company_id', p_target_job_company_id,
      'merged_into_job_company_name', target_row.name,
      'merged_at', now()
    );

  update public.job_companies
  set metadata = source_metadata
  where company_id::text = p_company_id
    and id = p_source_job_company_id;

  insert into public.job_company_merge_logs (
    company_id,
    source_job_company_id,
    target_job_company_id,
    source_snapshot,
    target_snapshot,
    position_snapshots,
    copied_benefits,
    created_by
  )
  values (
    p_company_id,
    p_source_job_company_id,
    p_target_job_company_id,
    to_jsonb(source_row),
    to_jsonb(target_row),
    position_snapshots,
    copied_benefits,
    p_actor_id
  )
  returning id into merge_log_id;

  return jsonb_build_object(
    'mergeId', merge_log_id,
    'sourceCompanyId', p_source_job_company_id,
    'targetCompanyId', p_target_job_company_id,
    'sourceName', source_row.name,
    'targetName', target_row.name,
    'positionsMoved', positions_moved,
    'benefitsCopied', benefits_copied
  );
end;
$merge_job_companies$;

create or replace function public.undo_job_company_merge(
  p_company_id text,
  p_merge_log_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $undo_job_company_merge$
declare
  merge_row public.job_company_merge_logs%rowtype;
  source_metadata jsonb;
  restored_positions integer := 0;
  removed_benefits integer := 0;
begin
  select * into merge_row
  from public.job_company_merge_logs
  where company_id::text = p_company_id
    and id = p_merge_log_id
  for update;

  if not found then
    raise exception 'Merge log not found.';
  end if;

  if merge_row.undone_at is not null then
    raise exception 'This merge was already undone.';
  end if;

  source_metadata := coalesce((merge_row.source_snapshot -> 'metadata'), '{}'::jsonb);

  update public.job_companies
  set name = merge_row.source_snapshot ->> 'name',
      normalized_name = merge_row.source_snapshot ->> 'normalized_name',
      slug = merge_row.source_snapshot ->> 'slug',
      website = nullif(merge_row.source_snapshot ->> 'website', ''),
      logo_path = nullif(merge_row.source_snapshot ->> 'logo_path', ''),
      breezy_company_id = nullif(merge_row.source_snapshot ->> 'breezy_company_id', ''),
      metadata = source_metadata
  where company_id::text = p_company_id
    and id = merge_row.source_job_company_id;

  update public.breezy_positions positions
  set job_company_id = merge_row.source_job_company_id,
      company = snapshot.previous_company
  from jsonb_to_recordset(merge_row.position_snapshots) as snapshot(
    breezy_position_id text,
    breezy_company_id text,
    previous_job_company_id uuid,
    previous_company text
  )
  where positions.company_id::text = p_company_id
    and positions.breezy_position_id = snapshot.breezy_position_id;

  get diagnostics restored_positions = row_count;

  delete from public.job_company_benefits benefits
  using jsonb_to_recordset(merge_row.copied_benefits) as copied(id uuid, tag text)
  where benefits.company_id::text = p_company_id
    and benefits.job_company_id = merge_row.target_job_company_id
    and benefits.id = copied.id;

  get diagnostics removed_benefits = row_count;

  update public.job_company_merge_logs
  set undone_at = now(),
      undone_by = p_actor_id
  where id = p_merge_log_id;

  return jsonb_build_object(
    'mergeId', p_merge_log_id,
    'sourceCompanyId', merge_row.source_job_company_id,
    'targetCompanyId', merge_row.target_job_company_id,
    'positionsRestored', restored_positions,
    'benefitsRemoved', removed_benefits
  );
end;
$undo_job_company_merge$;

do $reload_pgrst$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    null;
end;
$reload_pgrst$;

notify pgrst, 'reload schema';
