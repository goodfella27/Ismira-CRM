alter table public.job_premium_details
  add column if not exists position_compensation_type text,
  add column if not exists contract_length text,
  add column if not exists stripes text,
  add column if not exists cabin_type text,
  add column if not exists salary_note text;

alter table public.job_premium_details
  drop constraint if exists job_premium_details_position_compensation_type_check,
  drop constraint if exists job_premium_details_stripes_check,
  drop constraint if exists job_premium_details_cabin_type_check;

alter table public.job_premium_details
  add constraint job_premium_details_position_compensation_type_check
    check (position_compensation_type is null or position_compensation_type in ('tipping', 'non_tipping')),
  add constraint job_premium_details_stripes_check
    check (stripes is null or stripes in ('1', '1.5', '2')),
  add constraint job_premium_details_cabin_type_check
    check (cabin_type is null or cabin_type in ('single', 'shared'));

notify pgrst, 'reload schema';
