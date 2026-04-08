-- Company branding (logo + app title)
-- Run this in Supabase SQL editor.

alter table public.companies
  add column if not exists branding_title text;

alter table public.companies
  add column if not exists branding_logo_path text;

