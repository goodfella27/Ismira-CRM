create table if not exists pipelines (
  id text primary key,
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists pipeline_stages (
  pipeline_id text not null references pipelines (id) on delete cascade,
  id text not null,
  name text not null,
  "order" int not null,
  created_at timestamptz default now(),
  primary key (pipeline_id, id)
);

create table if not exists candidates (
  id text primary key,
  pipeline_id text not null references pipelines (id) on delete cascade,
  stage_id text not null,
  pool_id text,
  status text,
  "order" int,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  data jsonb not null default '{}'::jsonb,
  constraint candidates_stage_fk
    foreign key (pipeline_id, stage_id)
    references pipeline_stages (pipeline_id, id)
    on delete restrict
);

create table if not exists candidate_notes (
  id uuid primary key,
  candidate_id text not null references candidates (id) on delete cascade,
  body text not null,
  created_at timestamptz default now(),
  author_name text,
  author_email text,
  author_id uuid
);

create table if not exists candidate_note_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  candidate_id text not null references candidates (id) on delete cascade,
  last_seen_at timestamptz default now(),
  primary key (user_id, candidate_id)
);

create index if not exists candidate_note_reads_candidate_idx
  on candidate_note_reads (candidate_id);

alter table candidate_note_reads enable row level security;

drop policy if exists "candidate_note_reads_select" on candidate_note_reads;
drop policy if exists "candidate_note_reads_insert" on candidate_note_reads;
drop policy if exists "candidate_note_reads_update" on candidate_note_reads;
create policy "candidate_note_reads_select" on candidate_note_reads
  for select to authenticated
  using (user_id = auth.uid());
create policy "candidate_note_reads_insert" on candidate_note_reads
  for insert to authenticated
  with check (user_id = auth.uid());
create policy "candidate_note_reads_update" on candidate_note_reads
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists candidate_activity (
  id uuid primary key,
  candidate_id text not null references candidates (id) on delete cascade,
  type text not null,
  body text not null,
  created_at timestamptz default now(),
  author_name text,
  author_email text,
  author_id uuid
);

create table if not exists candidate_activity_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  candidate_id text not null references candidates (id) on delete cascade,
  last_seen_at timestamptz default now(),
  primary key (user_id, candidate_id)
);

create index if not exists candidate_activity_reads_candidate_idx
  on candidate_activity_reads (candidate_id);

alter table candidate_activity_reads enable row level security;

drop policy if exists "candidate_activity_reads_select" on candidate_activity_reads;
drop policy if exists "candidate_activity_reads_insert" on candidate_activity_reads;
drop policy if exists "candidate_activity_reads_update" on candidate_activity_reads;
create policy "candidate_activity_reads_select" on candidate_activity_reads
  for select to authenticated
  using (user_id = auth.uid());
create policy "candidate_activity_reads_insert" on candidate_activity_reads
  for insert to authenticated
  with check (user_id = auth.uid());
create policy "candidate_activity_reads_update" on candidate_activity_reads
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists candidate_tasks (
  candidate_id text not null references candidates (id) on delete cascade,
  id text not null,
  kind text not null default 'task',
  title text not null,
  status text not null,
  watcher_ids uuid[] not null default '{}'::uuid[],
  assigned_to uuid,
  due_at timestamptz,
  reminder_minutes_before int,
  notes text,
  created_at timestamptz default now(),
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  primary key (candidate_id, id)
);

alter table candidate_tasks
  add column if not exists kind text not null default 'task';
alter table candidate_tasks
  add column if not exists watcher_ids uuid[] not null default '{}'::uuid[];
alter table candidate_tasks
  add column if not exists completed_at timestamptz;
alter table candidate_tasks
  add column if not exists completed_by uuid;
alter table candidate_tasks
  add column if not exists assigned_to uuid;
alter table candidate_tasks
  add column if not exists due_at timestamptz;
alter table candidate_tasks
  add column if not exists reminder_minutes_before int;
alter table candidate_tasks
  add column if not exists notes text;

do $$ begin
  alter table candidate_tasks
    add constraint candidate_tasks_kind_check
    check (kind in ('task', 'request_info'));
exception when duplicate_object then null;
end $$;

create index if not exists candidate_tasks_candidate_kind_idx
  on candidate_tasks (candidate_id, kind);

update candidate_tasks
set kind = 'request_info'
where kind = 'task'
  and (
    id like 'form_%'
    or id in (
      'email',
      'phone',
      'nationality',
      'country',
      'summary',
      'work_history',
      'education',
      'passport',
      'seaman_book',
      'medical'
    )
    or lower(title) in (
      'add email',
      'add phone number',
      'add nationality',
      'add current country',
      'add summary',
      'add work history',
      'add education',
      'collect passport',
      'collect seaman book',
      'collect medical'
    )
  );

do $$ begin
  alter table candidate_tasks
    add constraint candidate_tasks_completed_by_fkey
    foreign key (completed_by)
    references auth.users (id)
    on delete set null;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table candidate_tasks
    add constraint candidate_tasks_assigned_to_fkey
    foreign key (assigned_to)
    references auth.users (id)
    on delete set null;
exception when duplicate_object then null;
end $$;

create table if not exists task_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'completed',
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  candidate_id text not null references candidates (id) on delete cascade,
  task_id text not null,
  task_title text not null,
  candidate_name text,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_name text,
  actor_email text,
  created_at timestamptz default now(),
  read_at timestamptz
);

alter table task_notifications
  add column if not exists kind text not null default 'completed';

create table if not exists candidate_work_history (
  id uuid primary key,
  candidate_id text not null references candidates (id) on delete cascade,
  role text not null,
  company text not null,
  start text,
  "end" text,
  details text,
  created_at timestamptz default now()
);

create table if not exists candidate_education (
  id uuid primary key,
  candidate_id text not null references candidates (id) on delete cascade,
  program text not null,
  institution text not null,
  start text,
  "end" text,
  details text,
  created_at timestamptz default now()
);

create table if not exists candidate_attachments (
  id uuid primary key,
  candidate_id text not null references candidates (id) on delete cascade,
  name text,
  mime text,
  url text,
  path text,
  kind text,
  created_at timestamptz default now(),
  created_by text
);

create table if not exists candidate_scorecards (
  candidate_id text primary key references candidates (id) on delete cascade,
  thoughts text,
  overall_rating int,
  entries jsonb,
  updated_at timestamptz default now()
);

create table if not exists questionnaires (
  id text primary key,
  name text not null,
  status text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists candidate_questionnaires (
  id uuid primary key,
  candidate_id text not null references candidates (id) on delete cascade,
  questionnaire_id text references questionnaires (id) on delete set null,
  name text,
  status text,
  sent_at timestamptz default now(),
  sent_by text
);

create index if not exists candidates_pipeline_stage_idx
  on candidates (pipeline_id, stage_id);
create index if not exists candidates_pipeline_created_id_idx
  on candidates (pipeline_id, created_at desc, id desc);
create index if not exists candidate_notes_candidate_id_idx
  on candidate_notes (candidate_id);
create index if not exists candidate_notes_candidate_created_idx
  on candidate_notes (candidate_id, created_at desc);
create index if not exists candidate_activity_candidate_id_idx
  on candidate_activity (candidate_id);
create index if not exists candidate_activity_candidate_created_idx
  on candidate_activity (candidate_id, created_at desc);
create index if not exists candidate_tasks_candidate_id_idx
  on candidate_tasks (candidate_id);
create index if not exists candidate_tasks_assigned_to_due_idx
  on candidate_tasks (assigned_to, due_at);
create index if not exists task_notifications_recipient_created_idx
  on task_notifications (recipient_user_id, created_at desc);
create index if not exists task_notifications_unread_idx
  on task_notifications (recipient_user_id)
  where read_at is null;
create index if not exists task_notifications_recipient_kind_created_idx
  on task_notifications (recipient_user_id, kind, created_at desc);
create index if not exists candidate_work_history_candidate_id_idx
  on candidate_work_history (candidate_id);
create index if not exists candidate_education_candidate_id_idx
  on candidate_education (candidate_id);
create index if not exists candidate_attachments_candidate_id_idx
  on candidate_attachments (candidate_id);
create index if not exists candidate_questionnaires_candidate_id_idx
  on candidate_questionnaires (candidate_id);

alter table pipelines enable row level security;
alter table pipeline_stages enable row level security;
alter table candidates enable row level security;
alter table candidate_notes enable row level security;
alter table candidate_activity enable row level security;
alter table candidate_tasks enable row level security;
alter table task_notifications enable row level security;
alter table candidate_work_history enable row level security;
alter table candidate_education enable row level security;
alter table candidate_attachments enable row level security;
alter table candidate_scorecards enable row level security;
alter table questionnaires enable row level security;
alter table candidate_questionnaires enable row level security;

do $$ begin
  alter publication supabase_realtime add table pipelines;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table pipeline_stages;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table candidates;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table candidate_notes;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table candidate_activity;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table candidate_tasks;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table task_notifications;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table candidate_work_history;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table candidate_education;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table candidate_attachments;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table candidate_scorecards;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table questionnaires;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table candidate_questionnaires;
exception when duplicate_object then null;
end $$;

create or replace function public.candidate_tasks_set_completion_fields()
returns trigger
language plpgsql
as $$
begin
  if new.watcher_ids is null then
    new.watcher_ids := '{}'::uuid[];
  end if;

  if new.status = 'done' then
    if tg_op = 'INSERT' then
      new.completed_at := coalesce(new.completed_at, now());
      new.completed_by := auth.uid();
    elsif old.status is distinct from 'done' then
      new.completed_at := coalesce(new.completed_at, now());
      new.completed_by := auth.uid();
    else
      new.completed_at := coalesce(new.completed_at, old.completed_at);
      new.completed_by := coalesce(new.completed_by, old.completed_by);
    end if;
  else
    new.completed_at := null;
    new.completed_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists candidate_tasks_set_completion_fields on candidate_tasks;
create trigger candidate_tasks_set_completion_fields
before insert or update on candidate_tasks
for each row
execute function public.candidate_tasks_set_completion_fields();

create or replace function public.candidate_tasks_notify_completed()
returns trigger
language plpgsql
security definer
set search_path = public, auth
set row_security = off
as $$
declare
  recipient uuid;
  candidate_name text;
  actor_name text;
  actor_email text;
  v_company_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'done' then
      return new;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status <> 'done' or old.status = 'done' then
      return new;
    end if;
  else
    return new;
  end if;

  if coalesce(new.kind, 'task') <> 'task' then
    return new;
  end if;

  if to_regclass('public.task_notifications') is null then
    return new;
  end if;
  if to_regclass('public.companies') is null then
    return new;
  end if;
  if to_regclass('public.company_members') is null then
    return new;
  end if;
  if to_regclass('public.company_task_watchers') is null then
    return new;
  end if;

  select coalesce(nullif(c.data->>'name', ''), c.id)
    into candidate_name
    from public.candidates c
    where c.id = new.candidate_id;

  select
    coalesce(
      nullif(trim(concat_ws(' ',
        raw_user_meta_data->>'first_name',
        raw_user_meta_data->>'last_name'
      )), ''),
      nullif(raw_user_meta_data->>'full_name', ''),
      nullif(raw_user_meta_data->>'name', ''),
      nullif(email, ''),
      auth.uid()::text
    ),
    email
    into actor_name, actor_email
    from auth.users
    where id = auth.uid();

  select id
    into v_company_id
    from public.companies
    order by created_at asc
    limit 1;

  if v_company_id is null then
    return new;
  end if;

  for recipient in
    select distinct w.user_id
    from public.company_task_watchers w
    join public.company_members cm
      on cm.company_id = w.company_id
     and cm.user_id = w.user_id
    where w.company_id = v_company_id
      and lower(cm.role) = 'admin'
  loop
    if recipient is null then
      continue;
    end if;

    insert into public.task_notifications (
      kind,
      recipient_user_id,
      candidate_id,
      task_id,
      task_title,
      candidate_name,
      actor_user_id,
      actor_name,
      actor_email,
      created_at
    ) values (
      'completed',
      recipient,
      new.candidate_id,
      new.id,
      new.title,
      candidate_name,
      auth.uid(),
      actor_name,
      actor_email,
      now()
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists candidate_tasks_notify_completed on candidate_tasks;
create trigger candidate_tasks_notify_completed
after insert or update on candidate_tasks
for each row
execute function public.candidate_tasks_notify_completed();

create or replace function public.candidate_tasks_notify_assigned()
returns trigger
language plpgsql
security definer
set search_path = public, auth
set row_security = off
as $$
declare
  recipient uuid;
  candidate_name text;
  actor_name text;
  actor_email text;
  v_company_id uuid;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  if coalesce(new.kind, 'task') <> 'task' then
    return new;
  end if;

  if to_regclass('public.task_notifications') is null then
    return new;
  end if;
  if to_regclass('public.companies') is null then
    return new;
  end if;
  if to_regclass('public.company_members') is null then
    return new;
  end if;
  if to_regclass('public.company_task_watchers') is null then
    return new;
  end if;

  select coalesce(nullif(c.data->>'name', ''), c.id)
    into candidate_name
    from public.candidates c
    where c.id = new.candidate_id;

  select
    coalesce(
      nullif(trim(concat_ws(' ',
        raw_user_meta_data->>'first_name',
        raw_user_meta_data->>'last_name'
      )), ''),
      nullif(raw_user_meta_data->>'full_name', ''),
      nullif(raw_user_meta_data->>'name', ''),
      nullif(email, ''),
      auth.uid()::text
    ),
    email
    into actor_name, actor_email
    from auth.users
    where id = auth.uid();

  select id
    into v_company_id
    from public.companies
    order by created_at asc
    limit 1;

  if v_company_id is null then
    return new;
  end if;

  for recipient in
    select distinct w.user_id
    from public.company_task_watchers w
    join public.company_members cm
      on cm.company_id = w.company_id
     and cm.user_id = w.user_id
    where w.company_id = v_company_id
      and lower(cm.role) = 'admin'
  loop
    if recipient is null then
      continue;
    end if;

    insert into public.task_notifications (
      kind,
      recipient_user_id,
      candidate_id,
      task_id,
      task_title,
      candidate_name,
      actor_user_id,
      actor_name,
      actor_email,
      created_at
    ) values (
      'created',
      recipient,
      new.candidate_id,
      new.id,
      new.title,
      candidate_name,
      auth.uid(),
      actor_name,
      actor_email,
      now()
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists candidate_tasks_notify_assigned on candidate_tasks;
create trigger candidate_tasks_notify_assigned
after insert on candidate_tasks
for each row
execute function public.candidate_tasks_notify_assigned();

create or replace function public.candidate_tasks_notify_assignee()
returns trigger
language plpgsql
security definer
set search_path = public, auth
set row_security = off
as $$
declare
  candidate_name text;
  actor_name text;
  actor_email text;
begin
  if coalesce(new.kind, 'task') <> 'task' then
    return new;
  end if;

  if to_regclass('public.task_notifications') is null then
    return new;
  end if;

  if new.assigned_to is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.assigned_to is not distinct from new.assigned_to then
      return new;
    end if;
  end if;

  select coalesce(nullif(c.data->>'name', ''), c.id)
    into candidate_name
    from public.candidates c
    where c.id = new.candidate_id;

  select
    coalesce(
      nullif(trim(concat_ws(' ',
        raw_user_meta_data->>'first_name',
        raw_user_meta_data->>'last_name'
      )), ''),
      nullif(raw_user_meta_data->>'full_name', ''),
      nullif(raw_user_meta_data->>'name', ''),
      nullif(email, ''),
      auth.uid()::text
    ),
    email
    into actor_name, actor_email
    from auth.users
    where id = auth.uid();

  insert into public.task_notifications (
    kind,
    recipient_user_id,
    candidate_id,
    task_id,
    task_title,
    candidate_name,
    actor_user_id,
    actor_name,
    actor_email,
    created_at
  ) values (
    'assigned',
    new.assigned_to,
    new.candidate_id,
    new.id,
    new.title,
    candidate_name,
    auth.uid(),
    actor_name,
    actor_email,
    now()
  );

  return new;
end;
$$;

drop trigger if exists candidate_tasks_notify_assignee on candidate_tasks;
create trigger candidate_tasks_notify_assignee
after insert or update on candidate_tasks
for each row
execute function public.candidate_tasks_notify_assignee();


drop policy if exists "pipelines_select" on pipelines;
drop policy if exists "pipelines_insert" on pipelines;
drop policy if exists "pipelines_update" on pipelines;
drop policy if exists "pipelines_delete" on pipelines;
create policy "pipelines_select" on pipelines
  for select
  to authenticated
  using (public.is_company_member());
create policy "pipelines_insert" on pipelines
  for insert
  to authenticated
  with check (public.is_company_admin());
create policy "pipelines_update" on pipelines
  for update
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());
create policy "pipelines_delete" on pipelines
  for delete
  to authenticated
  using (public.is_company_admin());

drop policy if exists "pipeline_stages_select" on pipeline_stages;
drop policy if exists "pipeline_stages_insert" on pipeline_stages;
drop policy if exists "pipeline_stages_update" on pipeline_stages;
drop policy if exists "pipeline_stages_delete" on pipeline_stages;
create policy "pipeline_stages_select" on pipeline_stages
  for select
  to authenticated
  using (public.is_company_member());
create policy "pipeline_stages_insert" on pipeline_stages
  for insert
  to authenticated
  with check (public.is_company_admin());
create policy "pipeline_stages_update" on pipeline_stages
  for update
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());
create policy "pipeline_stages_delete" on pipeline_stages
  for delete
  to authenticated
  using (public.is_company_admin());

drop policy if exists "candidates_select" on candidates;
drop policy if exists "candidates_insert" on candidates;
drop policy if exists "candidates_update" on candidates;
drop policy if exists "candidates_delete" on candidates;
create policy "candidates_select" on candidates
  for select
  to authenticated
  using (public.is_company_member());
create policy "candidates_insert" on candidates
  for insert
  to authenticated
  with check (public.is_company_member());
create policy "candidates_update" on candidates
  for update
  to authenticated
  using (public.is_company_member())
  with check (public.is_company_member());
create policy "candidates_delete" on candidates
  for delete
  to authenticated
  using (public.is_company_member());

drop policy if exists "candidate_notes_select" on candidate_notes;
drop policy if exists "candidate_notes_insert" on candidate_notes;
drop policy if exists "candidate_notes_update" on candidate_notes;
drop policy if exists "candidate_notes_delete" on candidate_notes;
create policy "candidate_notes_select" on candidate_notes
  for select
  to authenticated
  using (public.is_company_member());
create policy "candidate_notes_insert" on candidate_notes
  for insert
  to authenticated
  with check (public.is_company_member());
create policy "candidate_notes_update" on candidate_notes
  for update
  to authenticated
  using (public.is_company_member())
  with check (public.is_company_member());
create policy "candidate_notes_delete" on candidate_notes
  for delete
  to authenticated
  using (public.is_company_member());

drop policy if exists "candidate_activity_select" on candidate_activity;
drop policy if exists "candidate_activity_insert" on candidate_activity;
drop policy if exists "candidate_activity_update" on candidate_activity;
drop policy if exists "candidate_activity_delete" on candidate_activity;
create policy "candidate_activity_select" on candidate_activity
  for select
  to authenticated
  using (public.is_company_member());
create policy "candidate_activity_insert" on candidate_activity
  for insert
  to authenticated
  with check (public.is_company_member());
create policy "candidate_activity_update" on candidate_activity
  for update
  to authenticated
  using (public.is_company_member())
  with check (public.is_company_member());
create policy "candidate_activity_delete" on candidate_activity
  for delete
  to authenticated
  using (public.is_company_member());

drop policy if exists "candidate_tasks_select" on candidate_tasks;
drop policy if exists "candidate_tasks_insert" on candidate_tasks;
drop policy if exists "candidate_tasks_update" on candidate_tasks;
drop policy if exists "candidate_tasks_delete" on candidate_tasks;
create policy "candidate_tasks_select" on candidate_tasks
  for select
  to authenticated
  using (public.is_company_member());
create policy "candidate_tasks_insert" on candidate_tasks
  for insert
  to authenticated
  with check (public.is_company_member());
create policy "candidate_tasks_update" on candidate_tasks
  for update
  to authenticated
  using (public.is_company_member())
  with check (public.is_company_member());
create policy "candidate_tasks_delete" on candidate_tasks
  for delete
  to authenticated
  using (public.is_company_member());

drop policy if exists "task_notifications_select" on task_notifications;
drop policy if exists "task_notifications_update" on task_notifications;
create policy "task_notifications_select" on task_notifications
  for select
  to authenticated
  using (public.is_company_member() and recipient_user_id = auth.uid());
create policy "task_notifications_update" on task_notifications
  for update
  to authenticated
  using (public.is_company_member() and recipient_user_id = auth.uid())
  with check (public.is_company_member() and recipient_user_id = auth.uid());

drop policy if exists "candidate_work_history_select" on candidate_work_history;
drop policy if exists "candidate_work_history_insert" on candidate_work_history;
drop policy if exists "candidate_work_history_update" on candidate_work_history;
drop policy if exists "candidate_work_history_delete" on candidate_work_history;
create policy "candidate_work_history_select" on candidate_work_history
  for select
  to authenticated
  using (public.is_company_member());
create policy "candidate_work_history_insert" on candidate_work_history
  for insert
  to authenticated
  with check (public.is_company_member());
create policy "candidate_work_history_update" on candidate_work_history
  for update
  to authenticated
  using (public.is_company_member())
  with check (public.is_company_member());
create policy "candidate_work_history_delete" on candidate_work_history
  for delete
  to authenticated
  using (public.is_company_member());

drop policy if exists "candidate_education_select" on candidate_education;
drop policy if exists "candidate_education_insert" on candidate_education;
drop policy if exists "candidate_education_update" on candidate_education;
drop policy if exists "candidate_education_delete" on candidate_education;
create policy "candidate_education_select" on candidate_education
  for select
  to authenticated
  using (public.is_company_member());
create policy "candidate_education_insert" on candidate_education
  for insert
  to authenticated
  with check (public.is_company_member());
create policy "candidate_education_update" on candidate_education
  for update
  to authenticated
  using (public.is_company_member())
  with check (public.is_company_member());
create policy "candidate_education_delete" on candidate_education
  for delete
  to authenticated
  using (public.is_company_member());

drop policy if exists "candidate_attachments_select" on candidate_attachments;
drop policy if exists "candidate_attachments_insert" on candidate_attachments;
drop policy if exists "candidate_attachments_update" on candidate_attachments;
drop policy if exists "candidate_attachments_delete" on candidate_attachments;
create policy "candidate_attachments_select" on candidate_attachments
  for select
  to authenticated
  using (public.is_company_member());
create policy "candidate_attachments_insert" on candidate_attachments
  for insert
  to authenticated
  with check (public.is_company_member());
create policy "candidate_attachments_update" on candidate_attachments
  for update
  to authenticated
  using (public.is_company_member())
  with check (public.is_company_member());
create policy "candidate_attachments_delete" on candidate_attachments
  for delete
  to authenticated
  using (public.is_company_member());

drop policy if exists "candidate_scorecards_select" on candidate_scorecards;
drop policy if exists "candidate_scorecards_insert" on candidate_scorecards;
drop policy if exists "candidate_scorecards_update" on candidate_scorecards;
drop policy if exists "candidate_scorecards_delete" on candidate_scorecards;
create policy "candidate_scorecards_select" on candidate_scorecards
  for select
  to authenticated
  using (public.is_company_member());
create policy "candidate_scorecards_insert" on candidate_scorecards
  for insert
  to authenticated
  with check (public.is_company_member());
create policy "candidate_scorecards_update" on candidate_scorecards
  for update
  to authenticated
  using (public.is_company_member())
  with check (public.is_company_member());
create policy "candidate_scorecards_delete" on candidate_scorecards
  for delete
  to authenticated
  using (public.is_company_member());

drop policy if exists "questionnaires_select" on questionnaires;
drop policy if exists "questionnaires_insert" on questionnaires;
drop policy if exists "questionnaires_update" on questionnaires;
drop policy if exists "questionnaires_delete" on questionnaires;
create policy "questionnaires_select" on questionnaires
  for select
  to authenticated
  using (public.is_company_member());
create policy "questionnaires_insert" on questionnaires
  for insert
  to authenticated
  with check (public.is_company_admin());
create policy "questionnaires_update" on questionnaires
  for update
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());
create policy "questionnaires_delete" on questionnaires
  for delete
  to authenticated
  using (public.is_company_admin());

drop policy if exists "candidate_questionnaires_select" on candidate_questionnaires;
drop policy if exists "candidate_questionnaires_insert" on candidate_questionnaires;
drop policy if exists "candidate_questionnaires_update" on candidate_questionnaires;
drop policy if exists "candidate_questionnaires_delete" on candidate_questionnaires;
create policy "candidate_questionnaires_select" on candidate_questionnaires
  for select
  to authenticated
  using (public.is_company_member());
create policy "candidate_questionnaires_insert" on candidate_questionnaires
  for insert
  to authenticated
  with check (public.is_company_member());
create policy "candidate_questionnaires_update" on candidate_questionnaires
  for update
  to authenticated
  using (public.is_company_member())
  with check (public.is_company_member());
create policy "candidate_questionnaires_delete" on candidate_questionnaires
  for delete
  to authenticated
  using (public.is_company_member());
