# API contracts

This document records client contracts for reviewed Supabase operations. RPCs must return `{ ok, code, message, ... }`, enforce identity/role/deadlines in PostgreSQL, and never rely on hidden UI controls.

## Existing

- `publish_tournament(p_tournament_id uuid)` — Owner-only server operation. A successful result changes `draft` to `registration_open`. Paid events and invalid/expired schedules remain server-rejected.

## Required before later phases

- `update_tournament_draft(p_tournament_id uuid, ...)` — Owner-only, dates/rules/format/fee changes, audited, no direct browser UPDATE grant.
- `register_for_tournament(p_tournament_id uuid, p_game_account_id uuid, p_team_id uuid default null, p_rules_accepted boolean)` — deployed in Supabase migration `20261028135017_secure_free_solo_tournament_registration.sql`; the frontend uses it for free solo registration and does not duplicate its database logic.
- `check_in_tournament(p_tournament_id uuid, p_entry_id uuid)` — server-time window and ownership checks. Must atomically transition an eligible entry to `checked_in`, reject registration-open/closed/out-of-window calls, and return `{ ok, code, message, entry_id, checked_in_at }`.
- `generate_tournament_bracket(p_tournament_id uuid)` — idempotent organizer operation.
- `submit_match_result(...)`, `verify_match_result(...)`, `open_match_dispute(...)`, `resolve_match_dispute(...)` — evidence and audit controls.
- `complete_tournament(p_tournament_id uuid)` — verifies terminal matches, computes winner and standings, then locks completion.

Each future RPC needs allowed/denied-role, replay, deadline, duplicate, concurrency, and RLS tests before frontend use.

## Team participation contracts for security review

These are proposed contracts only. No team tables, RPCs or policies are present in the checked-in schema, and no client code should call them until approved and deployed.

- `create_team(p_game_id uuid, p_name text)` — authenticated player creates a team for an active game; normalize/validate name, make the caller captain, and return `{ ok, code, message, team_id }`.
- `invite_team_member(p_team_id uuid, p_user_id uuid)` — captain/authorized organizer creates a pending invitation; prevent self-duplicate and cross-event roster side effects; return `{ ok, code, message, invitation_id }`.
- `respond_to_team_invitation(p_invitation_id uuid, p_accept boolean)` — invited authenticated player accepts or declines; enforce invitation ownership and team game eligibility.
- `leave_team(p_team_id uuid)` — member leaves before roster lock; captain transfer must be explicit and audited, and the final member cannot leave without a team disposition.
- `lock_team_roster(p_team_id uuid)` — captain/organizer freezes an eligible roster; validate min/max roster size and all game-account ownership before returning a roster snapshot.
- `register_team_for_tournament(p_tournament_id uuid, p_team_id uuid, p_rules_accepted boolean)` — atomic free-entry team registration; enforce format, capacity measured in teams, locked roster, one event entry per player/team and deadline.

## Check-in and attendance contracts

- `check_in_tournament(p_tournament_id uuid, p_entry_id uuid)` — supports solo entries and locked team entries. For teams, require the captain or each roster member according to the event policy and return attendance progress.
- `record_team_member_check_in(p_entry_id uuid)` — optional organizer-approved team attendance operation; server validates roster membership, event window and idempotency.
- `mark_entry_no_show(p_entry_id uuid, p_reason text)` — organizer/referee-only, after the check-in deadline; writes an audit event and applies the reviewed forfeiture policy.

Every team/check-in operation must define ownership, organizer roles, UTC/server-time deadlines, idempotency, concurrency behavior, audit records, and denial codes. Frontend controls are not a security boundary.
