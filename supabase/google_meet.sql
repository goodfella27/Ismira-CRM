create table if not exists google_oauth_tokens (
  user_id uuid primary key,
  access_token text not null,
  refresh_token text,
  scope text,
  token_type text,
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists google_oauth_tokens_expires_at_idx
  on google_oauth_tokens (expires_at);
