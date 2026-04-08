-- Shared inbox + candidate email threads + tracking events.

create table if not exists public.company_mailboxes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  provider text not null,
  email_address text not null,
  display_name text,
  is_shared boolean not null default true,

  -- OAuth (Google Workspace / Outlook, etc.)
  oauth_access_token text,
  oauth_refresh_token text,
  oauth_scope text,
  oauth_token_type text,
  oauth_expires_at timestamptz,

  -- SMTP/IMAP fallback for non-Google providers
  imap_host text,
  imap_port int,
  imap_user text,
  imap_password text,
  imap_tls boolean not null default true,
  smtp_host text,
  smtp_port int,
  smtp_user text,
  smtp_password text,
  smtp_tls boolean not null default true,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists company_mailboxes_shared_unique
  on public.company_mailboxes (company_id)
  where is_shared is true;

create index if not exists company_mailboxes_company_idx
  on public.company_mailboxes (company_id);

alter table public.company_mailboxes enable row level security;

drop policy if exists "company_mailboxes_select" on public.company_mailboxes;
drop policy if exists "company_mailboxes_insert" on public.company_mailboxes;
drop policy if exists "company_mailboxes_update" on public.company_mailboxes;
drop policy if exists "company_mailboxes_delete" on public.company_mailboxes;

create policy "company_mailboxes_select" on public.company_mailboxes
  for select to authenticated
  using (public.is_company_admin());

create policy "company_mailboxes_insert" on public.company_mailboxes
  for insert to authenticated
  with check (public.is_company_admin());

create policy "company_mailboxes_update" on public.company_mailboxes
  for update to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

create policy "company_mailboxes_delete" on public.company_mailboxes
  for delete to authenticated
  using (public.is_company_admin());

create or replace function public.touch_company_mailboxes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists company_mailboxes_touch_updated_at on public.company_mailboxes;
create trigger company_mailboxes_touch_updated_at
before update on public.company_mailboxes
for each row
execute function public.touch_company_mailboxes_updated_at();

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  candidate_id text not null references public.candidates (id) on delete cascade,
  mailbox_id uuid references public.company_mailboxes (id) on delete set null,

  provider text not null,
  provider_message_id text not null,
  provider_thread_id text,
  direction text not null,

  from_email text,
  from_name text,
  to_emails text[] not null default array[]::text[],
  cc_emails text[] not null default array[]::text[],
  bcc_emails text[] not null default array[]::text[],

  subject text,
  snippet text,
  body_html text,
  body_text text,

  sent_at timestamptz,
  received_at timestamptz,

  -- Only set for outgoing messages created by the platform.
  tracking_token text,
  opens_count int not null default 0,
  clicks_count int not null default 0,

  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create unique index if not exists email_messages_provider_unique
  on public.email_messages (mailbox_id, provider_message_id);

create index if not exists email_messages_candidate_sent_idx
  on public.email_messages (candidate_id, sent_at desc nulls last);

create index if not exists email_messages_candidate_created_idx
  on public.email_messages (candidate_id, created_at desc);

alter table public.email_messages enable row level security;

drop policy if exists "email_messages_select" on public.email_messages;
drop policy if exists "email_messages_insert" on public.email_messages;
drop policy if exists "email_messages_update" on public.email_messages;
drop policy if exists "email_messages_delete" on public.email_messages;

create policy "email_messages_select" on public.email_messages
  for select to authenticated
  using (public.is_company_member());

create policy "email_messages_insert" on public.email_messages
  for insert to authenticated
  with check (public.is_company_member());

create policy "email_messages_update" on public.email_messages
  for update to authenticated
  using (public.is_company_member())
  with check (public.is_company_member());

create policy "email_messages_delete" on public.email_messages
  for delete to authenticated
  using (public.is_company_admin());

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.email_messages (id) on delete cascade,
  type text not null,
  url text,
  ip text,
  user_agent text,
  created_at timestamptz default now()
);

create index if not exists email_events_message_idx
  on public.email_events (message_id, created_at desc);

alter table public.email_events enable row level security;

drop policy if exists "email_events_select" on public.email_events;
drop policy if exists "email_events_insert" on public.email_events;
drop policy if exists "email_events_delete" on public.email_events;

create policy "email_events_select" on public.email_events
  for select to authenticated
  using (public.is_company_member());

-- Inserts happen via server routes using the service role key.
create policy "email_events_insert" on public.email_events
  for insert to authenticated
  with check (public.is_company_member());

create policy "email_events_delete" on public.email_events
  for delete to authenticated
  using (public.is_company_admin());

-- Atomic counters for tracking endpoints (avoid race conditions).
create or replace function public.increment_email_opens(message_id uuid)
returns void
language sql
security definer
set search_path = public
set row_security = off
as $$
  update public.email_messages
  set opens_count = opens_count + 1
  where id = message_id;
$$;

create or replace function public.increment_email_clicks(message_id uuid)
returns void
language sql
security definer
set search_path = public
set row_security = off
as $$
  update public.email_messages
  set clicks_count = clicks_count + 1
  where id = message_id;
$$;
