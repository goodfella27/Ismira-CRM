create extension if not exists "pgcrypto";

create table if not exists public.intake_forms (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique,
  candidate_id text not null,
  candidate_name text,
  candidate_email text,
  fields text[] not null,
  payload jsonb,
  status text not null default 'pending',
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);

create index if not exists intake_forms_candidate_idx on public.intake_forms (candidate_id);
create index if not exists intake_forms_status_idx on public.intake_forms (status);
