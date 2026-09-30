-- Run this entire file in project ckumubzfjkmhywsmerbt → SQL Editor.
-- Stores applications and private CVs locally. No Breezy connection is used.
begin;
create table if not exists public.application_submissions (
  id uuid primary key,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  department text not null,
  desired_position text not null,
  experience text not null,
  is_adult boolean not null,
  citizenship text not null check (char_length(citizenship) = 2),
  english_level text not null,
  language text not null default 'en',
  position_id text,
  consent_at timestamptz not null default now(),
  cv_path text,
  cv_name text,
  cv_size integer,
  created_at timestamptz not null default now()
);
create index if not exists application_submissions_created_idx on public.application_submissions (created_at desc);
create index if not exists application_submissions_email_idx on public.application_submissions (email);
alter table public.application_submissions enable row level security;
revoke all on public.application_submissions from public, anon, authenticated;
grant select, insert, update, delete on public.application_submissions to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('application-cvs', 'application-cvs', false, 8388608,
  array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
-- Restrict this bucket even if older generic storage policies permit client access.
drop policy if exists application_cvs_server_only on storage.objects;
create policy application_cvs_server_only on storage.objects as restrictive
  for all to anon, authenticated
  using (bucket_id <> 'application-cvs')
  with check (bucket_id <> 'application-cvs');
-- Uploads and short-lived downloads go through protected server APIs.

-- Communication routing only: these records do not determine recruitment eligibility.
create table if not exists public.application_routing_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  groups jsonb not null default '{}'::jsonb check (jsonb_typeof(groups) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.application_mailerlite_deliveries (
  id text primary key,
  candidate_id text not null,
  email text not null,
  bucket text not null check (bucket in ('main', 'improvement', 'country_followup', 'age_followup', 'unlisted')),
  group_id text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  subscriber_id text,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists application_mailerlite_delivery_retry_idx
  on public.application_mailerlite_deliveries (status, created_at) where status <> 'sent';

alter table public.application_routing_settings enable row level security;
alter table public.application_mailerlite_deliveries enable row level security;
revoke all on public.application_routing_settings from public, anon, authenticated;
revoke all on public.application_mailerlite_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.application_routing_settings to service_role;
grant select, insert, update, delete on public.application_mailerlite_deliveries to service_role;
-- Access is exclusively via server endpoints which verify current admin membership.
insert into public.application_routing_settings (id) values (true) on conflict (id) do nothing;

alter table public.application_mailerlite_deliveries
  add column if not exists application_id uuid references public.application_submissions(id);

-- Application and optional delivery are committed in one transaction.
-- Only the trusted server can invoke this function.
create or replace function public.save_application_submission(p_application jsonb, p_delivery jsonb default null)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare saved_id uuid;
begin
  saved_id := (p_application->>'id')::uuid;
  insert into public.application_submissions (
    id, first_name, last_name, email, phone, department, desired_position, experience,
    is_adult, citizenship, english_level, language, position_id, cv_path, cv_name, cv_size
  ) values (
    saved_id, p_application->>'first_name', p_application->>'last_name', p_application->>'email',
    p_application->>'phone', p_application->>'department', p_application->>'desired_position',
    p_application->>'experience', (p_application->>'is_adult')::boolean,
    p_application->>'citizenship', p_application->>'english_level', p_application->>'language',
    p_application->>'position_id', p_application->>'cv_path', p_application->>'cv_name',
    (p_application->>'cv_size')::integer
  ) on conflict (id) do nothing;
  if p_delivery is not null then
    insert into public.application_mailerlite_deliveries (
      id, candidate_id, application_id, email, bucket, group_id, payload
    ) values (
      p_delivery->>'id', saved_id::text, saved_id, p_application->>'email',
      p_delivery->>'bucket', p_delivery->>'group_id', p_delivery->'payload'
    ) on conflict (id) do nothing;
  end if;
  return saved_id;
end;
$$;
revoke all on function public.save_application_submission(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_application_submission(jsonb, jsonb) to service_role;
commit;
