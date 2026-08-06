create table if not exists clickup_users (
  clickup_user_id bigint primary key,
  username text not null,
  email text not null unique,
  discord_user_id text,
  updated_at timestamptz not null default now()
);
