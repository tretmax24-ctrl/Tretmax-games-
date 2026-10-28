# API contracts

This document records client contracts for reviewed Supabase operations. RPCs must return `{ ok, code, message, ... }`, enforce identity/role/deadlines in PostgreSQL, and never rely on hidden UI controls.

## Existing

- `publish_tournament(p_tournament_id uuid)` — Owner-only server operation. A successful result changes `draft` to `registration_open`. Paid events and invalid/expired schedules remain server-rejected.

## Required before later phases

- `update_tournament_draft(p_tournament_id uuid, ...)` — Owner-only, dates/rules/format/fee changes, audited, no direct browser UPDATE grant.
- `register_for_tournament(p_tournament_id uuid, p_game_account_id uuid, p_team_id uuid default null, p_rules_accepted boolean)` — deployed in Supabase migration `20261028135017_secure_free_solo_tournament_registration.sql`; the frontend uses it for free solo registration and does not duplicate its database logic.
- `check_in_tournament(p_tournament_id uuid, p_entry_id uuid)` — **deployed** in the team/check-in migrations; server-time window and participant ownership checks. Returns attendance counts and only transitions the entry to `checked_in` after every roster participant attends.
- `get_tournament_registration_summary(p_tournament_id uuid)` — deployed by the Supabase team as a public read-only aggregate for published tournaments. It returns `{ ok, code, message, tournament_id, registered_count, max_players, slots_remaining }`, exposes no player identifiers, and is consumed only when the frontend feature flag is enabled.

The frontend integration is feature-gated by `VITE_SUPABASE_REGISTRATION_SUMMARY_RPC_ENABLED`. The local `.env.local` has this enabled for verification; keep it disabled in environments where the RPC is not deployed.
- `create_team_invite_code(p_team_id uuid, p_expires_in_minutes integer default 1440)`, `preview_team_invite_code(p_code text)`, `redeem_team_invite_code(p_code text)` and `revoke_team_invite_code(p_team_id uuid)` — deployed one-use opaque-code flow. Codes are returned only at creation, stored as hashes, and must be shared through URL fragments.
- `get_team_attendance_summary(p_entry_id uuid)` — deployed authorized aggregate read for frozen team participant snapshots. It returns required, checked-in, pending, no-show and entry status counts without player identities.
- `generate_tournament_bracket(p_tournament_id uuid)` — idempotent organizer operation.
- `submit_match_result(...)`, `verify_match_result(...)`, `open_match_dispute(...)`, `resolve_match_dispute(...)` — evidence and audit controls.
- `complete_tournament(p_tournament_id uuid)` — verifies terminal matches, computes winner and standings, then locks completion.

Each future RPC needs allowed/denied-role, replay, deadline, duplicate, concurrency, and RLS tests before frontend use.

## Deployed team participation contracts

The seven team/check-in migrations listed in [teams-checkin-backend.md](./teams-checkin-backend.md) are present locally and deployed. Browser clients must use these RPCs; direct table writes remain revoked.

- `create_team(p_game_id uuid, p_name text)` — authenticated player creates a team for an active game; normalize/validate name, make the caller captain, and return `{ ok, code, message, team_id }`.
- `invite_team_member(p_team_id uuid, p_user_id uuid)` — captain/authorized organizer creates a pending invitation; prevent self-duplicate and cross-event roster side effects; return `{ ok, code, message, invitation_id }`.
- `respond_to_team_invitation(p_invitation_id uuid, p_accept boolean)` — invited authenticated player accepts or declines; enforce invitation ownership and team game eligibility.
- `leave_team(p_team_id uuid)` — member leaves before roster lock; captain transfer must be explicit and audited, and the final member cannot leave without a team disposition.
- `lock_team_roster(p_team_id uuid)` — captain/organizer freezes an eligible roster; validate min/max roster size and all game-account ownership before returning a roster snapshot.
- `register_team_for_tournament(p_tournament_id uuid, p_team_id uuid, p_rules_accepted boolean)` — atomic free-entry team registration; enforce format, capacity measured in teams, locked roster, one event entry per player/team and deadline.

## Check-in and attendance contracts

- `record_team_member_check_in(p_entry_id uuid)` — deployed convenience wrapper; validates roster membership, event window and idempotency.
- `mark_entry_no_show(p_entry_id uuid, p_reason text)` — deployed organizer/referee-only operation after the check-in deadline; writes an audit event and disqualifies the entry without releasing its reserved slot.

Every team/check-in operation must define ownership, organizer roles, UTC/server-time deadlines, idempotency, concurrency behavior, audit records, and denial codes. Frontend controls are not a security boundary.

## Competition engine contracts for security review

The browser now contains deterministic bracket and battle-royale scoring algorithms for local previews and tests. They do not write records or replace server authorization. Required operations before a live bracket can be generated:

- `generate_tournament_bracket(p_tournament_id uuid)` — owner/tournament-manager only; atomically locks check-in, reads checked-in solo entries or locked team rosters, creates a single-elimination bracket with deterministic seeds/byes and advancement links, and is idempotent.
- `schedule_tournament_match(p_match_id uuid, p_scheduled_at timestamptz, p_room_label text default null)` — organizer/referee only; validates UTC schedule and records an audit event.
- `submit_match_result(p_match_id uuid, p_winner_entry_id uuid, p_score jsonb, p_evidence_path text default null)` — assigned participant only; validates membership, stores a pending submission and private evidence reference, and rejects duplicates.
- `verify_match_result(p_match_id uuid, p_decision text, p_reason text default null)` — assigned referee/owner only; verifies one result, advances a winner once, and appends an immutable audit record.
- `record_match_forfeit(p_match_id uuid, p_entry_id uuid, p_reason text)` — referee/organizer only; applies no-show/forfeit policy and advances an eligible opponent exactly once.
- `open_match_dispute(p_match_id uuid, p_reason text, p_evidence_path text default null)` / `resolve_match_dispute(p_dispute_id uuid, p_decision text, p_reason text)` — participant then authorized referee/owner with private evidence and immutable decisions.
- `complete_tournament(p_tournament_id uuid)` — owner/organizer only; requires every terminal match verified or forfeited, computes the winner and standings transactionally, locks completion and emits an audit event.

Battle-royale events additionally require tournament-scoped placement points, elimination points, round count and ordered tie-breakers. Only verified round results may enter standings. Each operation needs role, replay, deadline, concurrency, RLS and audit tests before frontend use.
