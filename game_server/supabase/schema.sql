-- Kartfalls Supabase schema
-- Run this in Supabase SQL Editor (Project > SQL Editor > New query)

create table if not exists public.player_profiles (
  privy_user_id text primary key,
  wallet_address text not null default '',
  display_name text not null default '',
  total_kills integer not null default 0,
  total_deaths integer not null default 0,
  total_wins integer not null default 0,
  total_games integer not null default 0,
  xp integer not null default 0,
  coins integer not null default 0,
  created_at bigint not null default ((extract(epoch from now()) * 1000)::bigint),
  last_seen bigint not null default ((extract(epoch from now()) * 1000)::bigint)
);

create table if not exists public.match_history (
  id bigserial primary key,
  privy_user_id text not null references public.player_profiles(privy_user_id) on delete cascade,
  room_code text,
  kills integer not null default 0,
  deaths integer not null default 0,
  won boolean not null default false,
  xp_earned integer not null default 0,
  coins_earned integer not null default 0,
  played_at bigint not null default ((extract(epoch from now()) * 1000)::bigint)
);

create index if not exists idx_player_profiles_last_seen
  on public.player_profiles (last_seen desc);

create index if not exists idx_match_history_privy_user_id
  on public.match_history (privy_user_id);

create index if not exists idx_match_history_played_at
  on public.match_history (played_at desc);
