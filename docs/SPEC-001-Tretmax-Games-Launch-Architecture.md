# SPEC-001-Tretmax Games: Complete Non-Payment Launch Architecture

**Date:** 28 October 2026  
**Purpose:** Implementation-ready plan for Codex and the separate Supabase database/security workflow.  
**Repository:** `tretmax24-ctrl/Tretmax-games-`  
**Stack:** Existing React + TypeScript + Vite, Supabase Auth/PostgreSQL/RLS/Storage.  
**Target:** Run real free-entry tournaments, from player signup to verified winner and rankings, on a production website. **Payments remain disabled but architecturally planned.**

## Background

Already implemented and tested to varying degrees: public website, five Supabase-backed games, real signup, Owner admin dashboard, database-backed draft creation, secure Owner-only `public.publish_tournament(p_tournament_id uuid)` RPC, and successful publication and public visibility of a real tournament. Preserve all of this.

Remaining major gaps from the Codex audit: editable profiles and game IDs; capacity-safe player/team registration; check-in; brackets and battle-royale scoring; result submission/verification; disputes; tournament completion; real leaderboard; notifications, media storage and production deployment. Some older audit findings reflect migrations predating newer live changes. **Inspect the live schema before assuming a missing database field or policy.**

**Game integrations:** The platform MUST operate without official game APIs. Players manually link their Free Fire, PUBG Mobile, Call of Duty: Mobile, EA SPORTS FC Mobile and eFootball in-game identifiers and display names. Verification, if needed, is human-led with private screenshot proof. Never require game login passwords, scrape publishers, or claim publisher-certified ID verification.

## Requirements

### MUST
- **R1 Identity and profiles:** Supabase Auth signup/login/logout/reset/session, profile editing, unique display handle, optional avatar, privacy-aware public profile; never fake auth.
- **R2 Manual game IDs:** Add/edit/delete game-specific in-game UID/name/region for each of five database games; support different identifier formats and leading zeroes; store as text; default status `unverified`, optionally `reviewed_by_tretmax`, `rejected`; flag suspicious duplicates without exposing another player's data.
- **R3 Public discovery:** Mobile-first homepage, searchable/filterable game/tournament listings, detail pages showing rules, format, free-entry state, prizes, dates in Uganda timezone, live confirmed slots, standings, matches and share links.
- **R4 Event lifecycle:** Existing Owner dashboard creates/edits/previews/publishes/cancels/completes events; secure editing of draft dates; retain existing `publish_tournament` RPC and paid-publish rejection. Trusted Owner role only, approved staff granular.
- **R5 Registration:** Authenticated eligible player registers with linked account, accepts rules, server validates open window, correct game, free entry, capacity and duplicate membership atomically. Return explicit codes FULL, CLOSED, ALREADY_REGISTERED, WRONG_GAME, LOGIN_REQUIRED, etc.
- **R6 Team tournaments:** Captain creates squad, invites members who accept, selects roster, roster-size constraints per event, only one roster per player per event, team-level capacity, lock roster before check-in or event start.
- **R7 Check-in:** Server-enforced deadlines and identity; player/captain check-in; organizer roster/status visibility; audited no-show/forfeit.
- **R8 Formats:** Single-elimination solo and teams with byes and winner advancement; battle-royale multi-entrant lobbies with configurable placement + kill-point standings. Unsupported formats must be hidden or explicitly disabled, not pretend functional.
- **R9 Match workflow:** Fixtures and schedule, scores/evidence, opponent confirmation or referee adjudication, disputes, no-shows, forfeits and audit log; private evidence.
- **R10 Real stats:** Verified winners, placements, tournament history, wins, game-specific leaderboard, Unranked for new users. No mock leaderboard on production.
- **R11 Authorization:** Trusted `app_metadata.tretmax_role` / server-controlled membership; RLS/RPC enforcement for all mutations. No browser service-role key, no player Admin route, no frontend-only authorization.
- **R12 Operations:** Public banners, avatars, private evidence, WhatsApp sharing and support links, in-app notifications, FAQ/rules/privacy/contact, mobile accessibility, monitoring, end-to-end and security tests.
- **R13 Payment-ready data:** UGX integer entry fee, free/paid flag, prize structure, payments/ledger/refund/payout design; no actual paid registration, claims of funding or payouts until integration verified.
- **R14 Production:** Existing audit found admin routes disabled under production Vite build via dev-only routing. Safely enable protected production Admin, configure URLs and deployment, test denied roles.
- **R15 Preserve:** No redesign/replacement of existing dashboard or pages, no duplicate tables, no deletion/reset of production data, no weakening of current RLS or publishing protection.

### SHOULD
Pagination, filters, accurate real-time slot counters, downloadable admin roster, accessible mobile forms, in-app notification center, sportsmanship/rules acknowledgement, idempotent server actions, clear error and loading messages.

### COULD (later)
Round robin, Swiss, seasons, advanced rankings, publisher API integrations only if explicitly permitted, automated opt-in WhatsApp Business messages, payments and payouts.

### WON'T in this release
Live mobile-money charging, wallets carrying real money, real payouts, fake screenshots as “official verification,” scraping game publisher services.

## Method

### A. High-level architecture

```text
Existing React/Vite public site + Player Profile + Existing Admin Dashboard
                           | normal Supabase JS client / JWT
              Supabase Auth (identity + trusted role)
                           |
    +----------------------+--------------------------+
    |                      |                          |
Postgres RLS reads    Narrow transactional RPCs  Supabase Storage
profiles/events       register/check-in/results  banners/avatars/
                     publish/edit/complete       private evidence
    |                      |
    +---------- Audit + notifications + verified standings
```

Client checks improve UX but are NOT security. The database must validate caller, permissions, deadlines, capacity, status changes and eligibility. For database-intensive atomic operations prefer narrow Postgres RPC transactions. For any `SECURITY DEFINER`, set `search_path = ''`, fully qualify references, check identity/role/record ownership, restrict EXECUTE grants and add negative tests. Do not expose privileged keys in `VITE_*`.

### B. Existing schema and desired extensions

**Codex must first inspect live DB tables, RLS policies, applied migrations, enum/CHECK statuses, foreign keys and repository types.** Reuse existing `profiles`, `games`, `tournaments`, `player_game_accounts`, `tournament_entries`, `matches`, and existing finance tables. Proposed field/table names below are **contracts to reconcile**, not claims of what live DB already contains.

| Entity | Target columns / invariants |
|---|---|
| `profiles` | `id uuid` FK auth user, `display_name text`, unique normalized `handle text`, `avatar_path text?`, `created_at`, `updated_at`; owner-only safe edits. |
| `games` | Existing ID/slug/name/active plus optional per-game ID guidance; public active reads. |
| `player_game_accounts` | UUID ID, user_id, game_id, in_game_name, in_game_id **text**, region optional, `verification_status`, timestamps; user-scoped CRUD with sensible duplicate controls. |
| `tournaments` | Existing fields: ID, creator, game, title, description, mode, player_format, max_players (interpret slots as individuals or teams), schedule/check-in timestamps, rules, prize_description, banner_url, status; add format/scoring/fee fields only after schema review. |
| `tournament_entries` | Existing ID, tournament/user, status, registration/check-in timestamps; linked game account and immutable ID snapshot; UNIQUE constraints prevent repeats; server capacity. |
| `teams` (if absent) | ID, captain_user_id, game_id, name, created_at. |
| `team_members` (if absent) | team_id, user_id, invite/accepted status, accepted_at; roster permissions and uniqueness. |
| `tournament_team_entries` or compatible extension | tournament_id, team_id, captain, frozen roster snapshot, status; enforce no individual on two competing teams in same event. |
| `matches` (existing) | Tournament/round/match index, entry IDs, scheduled_at, winner_entry_id, status; only verified results advance. |
| `match_results` (if absent) | Match, actor, proposed score/winner, evidence refs, submitted_at, verified_by/at, status. |
| `match_disputes` (if absent) | Match, opener, reason, evidence refs, status, decision, resolver, timestamps. |
| `battle_royale_lobbies` and `lobby_results` (if absent) | Tournament/round/lobby/game index; entry, placement, kills, penalties, derived points, verified_by/at. |
| `tournament_standings` secure view/materialization | tournament_id, entry_id, matches played, wins, points, tiebreak, rank; only verified data. |
| `notifications` (if absent) | Recipient, event_type, safe payload, read_at, created_at, idempotency key. |
| `audit_events` (if absent) | Actor, action, target, before/after safe values, created_at; trusted append only. |
| `tournament_prize_allocations` (if absent) | tournament_id, place, planned_amount_ugx integer/bigint, description, funding label. |
| Existing finance tables | Reuse for future payment intents, ledger, refunds and payouts; inspect before proposing migrations. |

Use UUID PK/FK, `timestamptz` in UTC and display `Africa/Kampala`, integer/bigint UGX, bounds and CHECK constraints, indexes, immutable audit. Never floats for money. No passwords/game login credentials in player-game-account records.

### C. Manual game-ID workflow

Profile → Linked Game Accounts → choose an ACTIVE game → type in-game UID and display name → optionally region and proof screenshot → Save. Account is **Unverified** by default. Tretmax staff may manually review and mark **Reviewed by Tretmax**, not “publisher verified.” Validation is game-configurable but conservative; no assumption that all games use numeric IDs. IDs might include leading zeroes. A tournament entry snapshots selected game-account ID/name/UID so later edits do not alter match identity. Player can see private fields; moderation access controlled. Duplicate/impersonation conflicts go to reviewer, not another player's private details.

### D. Event state machine

```text
draft -- existing secure Owner publish RPC --> registration_open
                  | registration cutoff
                  v
              check-in / closed
                  | Owner starts + locks eligible roster
                  v
              in_progress
                  | all results verified + disputes resolved
                  v
               completed
```

Only use state strings actually supported by live DB constraints; propose additive migration if intermediate states are absent. Cancellation path authorized/audited. Draft edits (especially dates) require a narrow trusted Owner RPC, not direct UPDATE grants. Publishing must continue to reject invalid/expired windows and paid events. Registration/check-in windows enforced by server time; never rely on browser clock. Owner may edit published tournament only under explicit audited rules with notifications and roster/capacity protections.

### E. Atomic registration (essential)

Proposed contract (confirm final schema): `register_for_tournament(p_tournament_id uuid, p_game_account_id uuid, p_team_id uuid DEFAULT NULL)` returns `{ok, code, message, entry_id, status, slots_remaining}`.

Within a single Postgres transaction:
1. Check `auth.uid()`, tournament status `registration_open`, `now()` within registration times, and `entry_fee_ugx = 0`.
2. Lock tournament row `FOR UPDATE` or use equivalent concurrency-safe serialization.
3. Validate linked game account belongs to caller and matches tournament game, eligibility, rules consent.
4. For team entry, validate captain, accepted roster, team size, distinct members, every member has event game ID and belongs to no other roster in event; freeze roster.
5. Count **confirmed** entries under lock: count users for solo, count teams for team events. If at max, reject FULL or optionally enqueue waitlist (never call waitlist confirmed).
6. Insert uniquely/idempotently, audit, return authoritative count; user sees confirmation only after transaction commits.

**Required concurrency test:** for a 1-slot tournament with 20 simultaneous requests, EXACTLY 1 confirmed registration; other 19 rejected or otherwise not confirmed. Duplicate calls must never consume another slot.

### F. Check-in and seeding

Proposed `check_in_tournament(p_tournament_id, p_entry_id)` verifies owner of entry/captain, accepted registration, exact server check-in window, and prevents duplicate check-in. No-shows are auditable referee decisions.

Head-to-head single elimination: freeze eligible checked-in contestants, generate persisted random seed/order, calculate `B = 2^ceil(log2(N))`, assign round-1 byes and pairings, persist unique round/match numbers, only advance from verified outcomes. Support solo and team entries. Validate N=1 and cancellation/forfeit cases. Never generate brackets twice for same event/version.

Battle royale: generate lobbies/rounds and collect placements + kills per participant/team; use **tournament-specific, pre-start frozen** scoring table, e.g. `placement_points[position] + kill_points * kills - penalties`; scoring values selected by organizer, not assumed publisher standards. Aggregate only verified lobby results. Tie-break: most first places, total kills, best final-lobby placement, then authorized adjudication. Display provisional vs final distinctly.

### G. Result confirmation, disputes, completion

Player/captain submits claim and optional screenshot; opponent confirms or disputes within stated window; referee/Owner approves/corrects with actor/time/reason; protect against self-confirmation and double winners. Private media through secure Storage RLS/signed URLs. Match terminal decision immutable except audited correction. A privileged completion operation verifies all required matches/lobbies, no open disputes, computes champion/standings, locks competition and updates player history/leaderboards from verified outcomes. No hardcoded player statistics.

### H. Money architecture NOW, no real money yet

Tournament config: FREE vs PAID (PAID may remain draft-only), `currency = 'UGX'`, nonnegative integer `entry_fee_ugx`, planned prize placements/amounts and source. Keep free entry fully functional; current Owner publishing RPC rejecting PAID remains unchanged. Display prizes as **planned** until funding verified, never “guaranteed cash” without actual funding.

Future model: `payment_intents` with provider (MTN/Airtel later), amount_ugx, currency, payer, event, registration/reservation, idempotency key, provider reference, `initiated/pending/succeeded/failed/refunded`; append-only ledger and provider callback log, signed webhook verification, reconciliation, refunds, disputes, payout approval. A paid slot is confirmed only on trusted verified payment and valid reserved capacity; provider failure/timeout releases reservation. Never write a fake paid success from browser. Reuse existing finance tables, don't make duplicates.

### I. Notifications, uploads and public content

In-app notifications for registration, invitations, check-in, match schedule, results/disputes and completion; recipient RLS and event dedupe. WhatsApp `wa.me` share/contact links, not unsolicited messages. Future WhatsApp Business automation requires consent/templates/credentials. Storage: public event banners, privacy-aware avatars, **private** result evidence; content-type/size restrictions, per-user object paths, restricted reads, timely retention. Public rules/privacy/FAQ/support and accurate payment-disabled language.

### J. Production and non-functional

Existing admin routing is reportedly gated by dev mode: inspect `App.tsx` and enable **secure role-guarded admin** in production after authorization tests. Configure HTTPS/site redirect URLs, env checks, loading/error UX, analytics/monitoring/backups, non-destructive migration rollback, mobile UI at 360/390 px and desktop, keyboard/accessibility. Test anonymous/player/owner/referee route and database permissions separately. No service-role key or secret in frontend.


## Implementation

**Codex operating instructions:** Work on the existing repository and continue automatically through phases where safe. Do not rebuild existing pages or database tables. First inspect the actual live schema, migration history and source; prioritize newer verified facts over stale audit snapshots. Make small cohesive changes, run lint/build/tests at each gate, keep implementation logs in `docs/launch-readiness.md`, and keep migration proposals separate for review by the Supabase chat. If blocked on unapproved privileged DB changes, document exact SQL contract/migration/grants/tests and continue other independent safe tasks rather than faking backend behavior. Never mark a feature complete from UI alone.

**Required coding conventions:** TypeScript strictness as configured; use existing Supabase client/AuthProvider; no new dependency unless needed and documented; inspect current official API docs before introducing packages; use existing styles and components. Design clear `ok`, `code`, `message`, resource ID result types for RPCs; handle both transport errors and `{ok:false}` responses. No reliance on browser storage as database fallback. Never expose service-role keys.

### Phase 0: Reconcile schema, permissions, and existing features
1. Audit source files and current migrations, especially the newly applied Owner publishing RPC, profile/game account policies, event statuses, entry/match constraints, production admin guard, finance tables and storage buckets.
2. Separate working/verified, implemented/untested, demo and missing features. Note schema drift and the exact additive migrations required.
3. Ensure current live public published tournament, Owner login and existing Publish action remain intact.
4. Create/update `docs/launch-readiness.md`, `docs/api-contracts.md`, `docs/migrations-needed.md`. No DB changes yet.

### Phase 1: Real player profile and game ID management
1. Wire `profiles` and `player_game_accounts` to existing `/profile`.
2. Add display name, unique handle, linked games form, privacy, unverified/reviewed status, edit/delete; optional evidence after secured Storage setup.
3. Add user-scoped tests and proper empty/error/loading states.
**Gate:** After refresh/logout/login, linked IDs persist; different user cannot read/change them; no official API requirement.

### Phase 2: Owner tournament editing and complete event form
1. Design narrow Owner-only draft edit operation: dates, title, rules, format, banner, roster size, game, planned prizes and integer UGX fee.
2. Have Supabase workflow review/apply the update RPC and grant changes; Codex connects it in existing admin dashboard.
3. Preserve existing publishing RPC; paid tournaments still cannot publish.
**Gate:** Owner repairs past draft schedule and publishes valid free tournament; non-owner edit rejected.

### Phase 3: Atomic free registration and teams
1. Propose/review server RPC for capacity-locked entries; add client Register UX, selected game ID, rules acknowledgment, accurate slots.
2. Team creation/invitations/roster acceptance, per-event player uniqueness, frozen roster and captain registration.
3. Add direct denied-role tests, duplicate tests, high-concurrency tests.
**Gate:** 20 parallel attempts into 1 free slot => exactly 1 confirmed; solo and eligible team registration work with real signed-in accounts.

### Phase 4: Check-in and rosters
1. Add check-in RPC based on server deadline; player/captain controls, confirmed vs checked-in counts, admin export/roster.
2. Define no-show/forfeit rules; no direct client bypass.
**Gate:** Early/late/duplicate check-in rejected; correct check-in persists and is auditable.

### Phase 5: Matches, brackets, battle royale and disputes
1. Implement persisted, idempotent single-elimination seeding with byes and bracket UI.
2. Implement battle-royale lobbies and scoring configuration and verified points.
3. Result submission, evidence, opponent confirmation, referee verification, dispute/forfeit workflow, scheduling and audit.
**Gate:** 3/5/8/16-person bracket cases and BR total scoring tests pass; cannot advance two winners, cannot self-approve illicit results; private evidence protected.

### Phase 6: Completion, verified player stats, leaderboards
1. Implement trusted competition completion; produce winner, placements and results.
2. Connect actual profile wins/tournament count/rank and remove hardcoded leaderboard data.
3. Public completed event pages show final brackets and verified winners.
**Gate:** Full free test tournament from 5 real test players to a persisted verified champion, and accurate profile history.

### Phase 7: Notifications, media, mobile and content
1. In-app notification inbox; WhatsApp share/contact links (no automated spam), public event banner, avatar and private evidence policies.
2. Mobile test account signup, ID entry, registration, team roster, check-in and public results on 360px and 390px widths.
3. Rules, privacy, FAQ, report-abuse and contact pages. Add precise loading/error/empty states.
**Gate:** Real mobile workflows, no private media leakage, links share correct event.

### Phase 8: Deployment, security and launch
1. Enable real role-guarded admin in production (not dev-only); run full role-negative frontend and direct database tests.
2. Deploy with HTTPS, correct Supabase Auth URLs, monitoring, error reporting and backups.
3. Execute end-to-end UAT with Owner, ordinary players, optionally referee/organizer, and anonymous user.
4. Keep all live payment actions unavailable; financial draft configuration allowed only if server schema supports it.
**Gate:** Real players can discover, register, check in, compete, submit and verify results, see champion/history/rank; unauthorized users cannot alter data. Production-ready **free-entry** platform.

## Milestones

| Milestone | Definition of done |
|---|---|
| M0 Existing work protected | Schema and latest RPCs reconciled, current publication flow unbroken |
| M1 Player identity | Persistent profile and manually linked game IDs with secure ownership |
| M2 Owner event editing | Correct invalid draft schedules; edit safely; publish free event |
| M3 Player/team registration | Verified entry flow, no duplicate or excess capacity under load |
| M4 Check-in | Server-time enforcement and reliable rosters |
| M5 Tournament engine | H2H bracket/byes and BR scoring, referee verified results and disputes |
| M6 Winner and history | Competition completed and real profile/leaderboard changes |
| M7 Engagement polish | Notifications, WhatsApp share, safe media, mobile layouts |
| M8 Launch | Production deployment, audit/negative/E2E tests, non-payment UAT |
| M9 Later — payments | Provider authorization, signed callbacks, ledger, reconciliation, payouts |

## Gathering Results

**End-to-end acceptance:** One Owner creates/edits/publishes a free event; ordinary test players create accounts and manually link game IDs; each registers once without exceeding capacity; eligible users check in; Owner starts event; matches or BR lobbies run; result evidence is recorded and independently verified; disputes resolve; winner is announced; profile history and leaderboard update from verified results; anonymous public sees published results but not private evidence or drafts. Owner admin functions work in production, player cannot access them. The whole test is done without real payments.

**Negative test matrix:** anonymous (no admin/private reads), signed-in player (no publish/other profile edit), Owner (can operate own approved events), referee (results only when authorized), full/closed/duplicate registration, 20 concurrent signups for 1 slot, team double membership, roster changes after lock, expired check-in, two conflicting score submissions, role spoofing via `user_metadata`, private Storage file guess, RPC replay, and expired/revoked role claims.

**Operational metrics:** signup success, registration conversion, slot consistency, check-in rate, match completion, dispute resolution latency, page load/mobile errors, unexpected RLS denials and incident response. Define numerical goals after pilot measurement rather than inventing actual performance.

**Status discipline:** `Implemented` != `tested` != `production verified`. Codex must record exact test commands, screenshots/paths or error outputs and known blockers.

## Need Professional Help in Developing Your Architecture?

Please contact me at [sammuti.com](https://sammuti.com) :)
