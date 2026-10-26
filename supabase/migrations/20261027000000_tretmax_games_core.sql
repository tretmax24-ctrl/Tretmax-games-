-- Tretmax Games core schema
-- Applied directly to Supabase on 2026-10-27, then captured here for version control.
-- Idempotent table/index/policy setup so it can be reconciled with the already-provisioned project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  country_code text not null default 'UG',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length check (username is null or char_length(username) between 3 and 24)
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  publisher text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete restrict,
  title text not null,
  description text,
  format text not null default 'single_elimination'
    check (format in ('single_elimination','double_elimination','round_robin','battle_royale')),
  status text not null default 'draft'
    check (status in ('draft','registration_open','registration_closed','check_in','in_progress','completed','cancelled')),
  starts_at timestamptz,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  max_players integer check (max_players is null or max_players >= 2),
  entry_fee_minor bigint not null default 0 check (entry_fee_minor >= 0),
  prize_pool_minor bigint not null default 0 check (prize_pool_minor >= 0),
  currency_code text not null default 'UGX' check (currency_code in ('UGX','USD')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournaments_dates_valid check (
    registration_closes_at is null or registration_opens_at is null
    or registration_closes_at >= registration_opens_at
  )
);

create table if not exists public.player_game_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete restrict,
  game_uid text not null,
  in_game_name text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','pending','verified','rejected')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (game_id, game_uid),
  unique (user_id, game_id, game_uid)
);

create table if not exists public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  game_account_id uuid references public.player_game_accounts(id) on delete set null,
  status text not null default 'registered'
    check (status in ('registered','checked_in','confirmed','eliminated','withdrawn','disqualified')),
  seed integer check (seed is null or seed > 0),
  registered_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  match_number integer not null check (match_number > 0),
  player_one_entry_id uuid references public.tournament_entries(id) on delete set null,
  player_two_entry_id uuid references public.tournament_entries(id) on delete set null,
  winner_entry_id uuid references public.tournament_entries(id) on delete set null,
  status text not null default 'scheduled'
    check (status in ('scheduled','ready','in_progress','completed','disputed','cancelled')),
  scheduled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tournament_id, round_number, match_number)
);

create table if not exists public.match_room_secrets (
  match_id uuid primary key references public.matches(id) on delete cascade,
  room_code text,
  room_password text,
  reveal_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.wallet_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency_code text not null default 'UGX' check (currency_code in ('UGX','USD')),
  created_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  amount_minor bigint not null check (amount_minor <> 0),
  currency_code text not null default 'UGX' check (currency_code in ('UGX','USD')),
  transaction_type text not null
    check (transaction_type in ('deposit','withdrawal','entry_fee','prize','refund','escrow_lock','escrow_release','adjustment')),
  status text not null default 'pending'
    check (status in ('pending','processing','completed','failed','cancelled','reversed')),
  provider text,
  provider_reference text,
  idempotency_key text unique,
  tournament_id uuid references public.tournaments(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('deposit','withdrawal')),
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text not null default 'UGX' check (currency_code in ('UGX','USD')),
  mobile_money_provider text,
  phone_number text,
  status text not null default 'pending'
    check (status in ('pending','processing','completed','failed','cancelled')),
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tournaments_feed_idx on public.tournaments (status, starts_at);
create index if not exists tournaments_game_idx on public.tournaments (game_id);
create index if not exists player_game_accounts_user_idx on public.player_game_accounts (user_id);
create index if not exists tournament_entries_user_idx on public.tournament_entries (user_id);
create index if not exists tournament_entries_tournament_idx on public.tournament_entries (tournament_id, status);
create index if not exists matches_tournament_round_idx on public.matches (tournament_id, round_number, match_number);
create index if not exists wallet_transactions_user_created_idx on public.wallet_transactions (user_id, created_at desc);
create index if not exists payment_requests_user_created_idx on public.payment_requests (user_id, created_at desc);
create index if not exists matches_player_one_entry_idx on public.matches (player_one_entry_id);
create index if not exists matches_player_two_entry_idx on public.matches (player_two_entry_id);
create index if not exists matches_winner_entry_idx on public.matches (winner_entry_id);
create index if not exists tournament_entries_game_account_idx on public.tournament_entries (game_account_id);
create index if not exists tournaments_created_by_idx on public.tournaments (created_by);
create index if not exists wallet_transactions_tournament_idx on public.wallet_transactions (tournament_id);

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.tournaments enable row level security;
alter table public.player_game_accounts enable row level security;
alter table public.tournament_entries enable row level security;
alter table public.matches enable row level security;
alter table public.match_room_secrets enable row level security;
alter table public.wallet_accounts enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.payment_requests enable row level security;

drop policy if exists "Profiles are viewable by their owner" on public.profiles;
drop policy if exists "Users can create their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Active games are publicly readable" on public.games;
drop policy if exists "Published tournaments are publicly readable" on public.tournaments;
drop policy if exists "Users can read their own game accounts" on public.player_game_accounts;
drop policy if exists "Users can add their own game accounts" on public.player_game_accounts;
drop policy if exists "Users can update their own game accounts" on public.player_game_accounts;
drop policy if exists "Users can read their own tournament entries" on public.tournament_entries;
drop policy if exists "Users can register themselves" on public.tournament_entries;
drop policy if exists "Matches in published tournaments are publicly readable" on public.matches;
drop policy if exists "Users can read their own wallet account" on public.wallet_accounts;
drop policy if exists "Users can read their own wallet transactions" on public.wallet_transactions;
drop policy if exists "Users can read their own payment requests" on public.payment_requests;
drop policy if exists "Users can create their own payment requests" on public.payment_requests;

create policy "Profiles are viewable by their owner"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "Users can create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Active games are publicly readable"
  on public.games for select to anon, authenticated
  using (is_active = true);
create policy "Published tournaments are publicly readable"
  on public.tournaments for select to anon, authenticated
  using (status in ('registration_open','registration_closed','check_in','in_progress','completed'));

create policy "Users can read their own game accounts"
  on public.player_game_accounts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can add their own game accounts"
  on public.player_game_accounts for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and verification_status in ('unverified','pending')
    and verified_at is null
  );
create policy "Users can update their own game accounts"
  on public.player_game_accounts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and verification_status in ('unverified','pending')
    and verified_at is null
  );

create policy "Users can read their own tournament entries"
  on public.tournament_entries for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can register themselves"
  on public.tournament_entries for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'registered'
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.status = 'registration_open'
    )
    and (
      game_account_id is null or exists (
        select 1 from public.player_game_accounts a
        where a.id = game_account_id and a.user_id = (select auth.uid())
      )
    )
  );

create policy "Matches in published tournaments are publicly readable"
  on public.matches for select to anon, authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.status in ('registration_open','registration_closed','check_in','in_progress','completed')
    )
  );

create policy "Users can read their own wallet account"
  on public.wallet_accounts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can read their own wallet transactions"
  on public.wallet_transactions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can read their own payment requests"
  on public.payment_requests for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can create their own payment requests"
  on public.payment_requests for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'pending');

grant select on public.games, public.tournaments, public.matches to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.player_game_accounts to authenticated;
grant select, insert on public.tournament_entries to authenticated;
grant select on public.wallet_accounts, public.wallet_transactions to authenticated;
grant select, insert on public.payment_requests to authenticated;
revoke all on public.match_room_secrets from anon, authenticated;
revoke insert, update, delete on public.wallet_transactions from anon, authenticated;
revoke insert, update, delete on public.wallet_accounts from anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
