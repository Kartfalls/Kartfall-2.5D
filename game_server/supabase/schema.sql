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

-- ── Yellow match channels ────────────────────────────────────────────────

create table if not exists public.match_channels (
  match_id text primary key,
  channel_id text,
  participants text[] not null default '{}',
  asset text not null default '',
  chain_id bigint not null default 0,
  mode text not null default 'free',
  stake_amount bigint not null default 0,
  status text not null default 'open',
  version bigint not null default 0,
  created_at bigint not null default ((extract(epoch from now()) * 1000)::bigint),
  closed_at bigint
);

create table if not exists public.channel_balances (
  channel_id text not null,
  wallet text not null,
  unredeemed_amount bigint not null default 0,
  last_updated bigint not null default ((extract(epoch from now()) * 1000)::bigint),
  primary key (channel_id, wallet)
);

create table if not exists public.channel_history (
  id bigserial primary key,
  channel_id text not null,
  match_id text not null,
  wallet text not null,
  payouts jsonb not null default '{}'::jsonb,
  bet_breakdown jsonb not null default '{}'::jsonb,
  stake_breakdown jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  created_at bigint not null default ((extract(epoch from now()) * 1000)::bigint)
);

create index if not exists idx_match_channels_status
  on public.match_channels (status);

create index if not exists idx_channel_balances_wallet
  on public.channel_balances (wallet);

create index if not exists idx_channel_history_wallet
  on public.channel_history (wallet);

create index if not exists idx_channel_history_match
  on public.channel_history (match_id);
