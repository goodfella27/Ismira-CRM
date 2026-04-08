-- Breezy candidates table for CSV imports
create extension if not exists pgcrypto;

create table if not exists public.breezy_candidates (
  id uuid primary key default gen_random_uuid(),
  name text,
  match_score numeric,
  score numeric,
  email text,
  phone text,
  address text,
  desired_salary text,
  position text,
  stage text,
  source text,
  sourced_by text,
  "addedDate" text,
  "addedTime" text,
  "lastActivityDate" text,
  "lastActivityTime" text,
  created_at timestamptz not null default now()
);

create index if not exists breezy_candidates_email_idx
  on public.breezy_candidates (lower(email));
