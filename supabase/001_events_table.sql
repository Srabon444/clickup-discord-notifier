create extension if not exists pgcrypto;

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  task_id text not null,
  task_name text,
  dedupe_key text not null unique,
  raw_payload jsonb not null,
  discord_status text not null default 'pending',
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists events_task_id_idx on events (task_id);
create index if not exists events_created_at_idx on events (created_at desc);
