create extension if not exists "pgcrypto";

create table if not exists public.cv_forms (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique,
  candidate_id text not null references public.candidates (id) on delete cascade,
  candidate_name text,
  candidate_email text,
  payload jsonb,
  status text not null default 'pending',
  pdf_path text,
  created_by uuid,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  expires_at timestamptz
);

create index if not exists cv_forms_candidate_idx on public.cv_forms (candidate_id);
create index if not exists cv_forms_status_idx on public.cv_forms (status);

alter table public.cv_forms enable row level security;

drop policy if exists "cv_forms_select" on public.cv_forms;
drop policy if exists "cv_forms_insert" on public.cv_forms;
drop policy if exists "cv_forms_update" on public.cv_forms;
drop policy if exists "cv_forms_delete" on public.cv_forms;

create policy "cv_forms_select" on public.cv_forms
  for select to authenticated using (public.is_company_member());
create policy "cv_forms_insert" on public.cv_forms
  for insert to authenticated with check (public.is_company_member());
create policy "cv_forms_update" on public.cv_forms
  for update to authenticated using (public.is_company_member()) with check (public.is_company_member());
create policy "cv_forms_delete" on public.cv_forms
  for delete to authenticated using (public.is_company_member());
