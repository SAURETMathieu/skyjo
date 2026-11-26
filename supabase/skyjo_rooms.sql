create table if not exists public.skyjo_rooms (
  code text primary key,
  payload jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.skyjo_rooms enable row level security;

revoke all on table public.skyjo_rooms from anon, authenticated;
