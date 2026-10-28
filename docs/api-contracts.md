# API contracts

This document records client contracts for reviewed Supabase operations. RPCs must return `{ ok, code, message, ... }`, enforce identity/role/deadlines in PostgreSQL, and never rely on hidden UI controls.

## Existing

- `publish_tournament(p_tournament_id uuid)` — Owner-only server operation. A successful result changes `draft` to `registration_open`. Paid events and invalid/expired schedules remain server-rejected.

## Required before later phases

- `update_tournament_draft(p_tournament_id uuid, ...)` — Owner-only, dates/rules/format/fee changes, audited, no direct browser UPDATE grant.
- `register_for_tournament(p_tournament_id uuid, p_game_account_id uuid, p_team_id uuid default null, p_rules_accepted boolean)` — atomic free-entry capacity and eligibility checks.
- `check_in_tournament(p_tournament_id uuid, p_entry_id uuid)` — server-time window and ownership checks.
- `generate_tournament_bracket(p_tournament_id uuid)` — idempotent organizer operation.
- `submit_match_result(...)`, `verify_match_result(...)`, `open_match_dispute(...)`, `resolve_match_dispute(...)` — evidence and audit controls.
- `complete_tournament(p_tournament_id uuid)` — verifies terminal matches, computes winner and standings, then locks completion.

Each future RPC needs allowed/denied-role, replay, deadline, duplicate, concurrency, and RLS tests before frontend use.
