# Migration and security review queue

The team/check-in migrations are now present in this checkout and deployed according to [teams-checkin-backend.md](./teams-checkin-backend.md). The SQL proposal below is retained as historical review context and must not be re-applied. Future changes must reconcile the live schema first.

## Deployment update — official single-elimination brackets

The six official-competition migrations are applied and present in GitHub main. The deployed RPCs for bracket generation, match scheduling, results, disputes, referee verification, forfeits, completion and bracket/schedule/standings reads are documented in [docs/competition-backend-contract.md](./competition-backend-contract.md). The checklist and SQL proposals further down are retained as historical context and should **not be re-applied**. Private evidence Storage bucket/policies, battle-royale scoring, real browser checks and true overlapping-session stress tests remain outstanding.

## Required schema/policy review

1. Add or reconcile an Owner-only draft edit RPC and its restricted EXECUTE grant.
2. Run browser and concurrent security tests for the deployed team/check-in RPCs; do not duplicate their tables or functions.
3. Add bracket, result, evidence, dispute and completion tables/RPCs only where the live schema lacks them.
4. Add standings/history/notification/audit structures after the event lifecycle contract is approved.
5. Confirm Supabase Storage buckets and policies for public banners, user avatars and private evidence.
6. Preserve the existing publishing RPC and paid-publish rejection.

Any `SECURITY DEFINER` function must set `search_path = ''`, fully qualify objects, validate `auth.uid()` and role, restrict execution, and have negative tests. No service-role key belongs in frontend code.

## Historical team and check-in proposal (superseded by deployed migrations)

The following was the minimum shape before deployment. It is retained for audit context; do not apply it because the deployed migrations already define the tables, policies and RPCs.

```sql
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id),
  captain_user_id uuid not null references auth.users(id),
  name text not null check (char_length(trim(name)) between 3 and 40),
  roster_locked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  membership_status text not null check (membership_status in ('invited','active','declined','removed')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (team_id, user_id)
);

create table public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  invited_user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id),
  status text not null check (status in ('pending','accepted','declined','expired','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

alter table public.tournament_entries
  add column team_id uuid references public.teams(id),
  add column checked_in_at timestamptz,
  add column no_show_at timestamptz,
  add column no_show_reason text;
create unique index tournament_entries_team_once
  on public.tournament_entries(tournament_id, team_id)
  where team_id is not null;
```

The reviewed migration must also define roster-size configuration per tournament, immutable roster snapshots at team registration, and constraints preventing a player from entering the same event through both a solo and team entry. RLS should expose a user's own teams/invitations/memberships and organizer views only through approved roles; direct browser updates to captain, lock, team entry, check-in or no-show fields should remain revoked. All mutations should be RPCs with server-time windows, idempotency keys or equivalent replay protection, and audit records.

For check-in, `check_in_tournament` should verify the signed-in user owns the solo entry or is an active member of the locked team, the tournament is in its configured check-in window, the entry is not withdrawn/disqualified/no-show, and then atomically set `checked_in_at` plus the existing `checked_in` status. `mark_entry_no_show` should be organizer/referee-only and reject calls before the deadline.

## Historical competition engine proposal (partially superseded)

The current `matches` table is not sufficient for bracket advancement, evidence review or disputes. A separate security-reviewed migration should add `tournament_brackets` (one per tournament), `tournament_bracket_matches` (round, match number, entry references, `next_match_id`, schedule, status, private room reference and winner), `match_result_submissions`, `match_disputes`, `tournament_scoring_rules` and `battle_royale_results`, plus an append-only `competition_audit_events` table. Unique constraints must prevent duplicate match positions, duplicate results per participant/round and duplicate tournament completion.

All browser writes must be revoked from these base tables and exposed through the RPCs in [api-contracts.md](./api-contracts.md). Policies must limit private room references/evidence to assigned participants and authorized staff, enforce tournament roles, and lock terminal matches and completed tournaments. The reviewed single-elimination subset has been applied; see the official competition contract above. Battle-royale scoring and private evidence file Storage remain undeployed.
