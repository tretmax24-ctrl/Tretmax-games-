# Phase 2 integration notes

Phase 2 is backend-gated. The frontend preserves the existing Supabase client and uses only published tournament reads, owner draft operations and the existing owner-only publish RPC.

The public detail page now prepares a free solo registration request through:

`supabase.rpc('register_for_tournament', { p_tournament_id, p_game_account_id, p_team_id: null, p_rules_accepted: true })`

This client contract is intentionally not implemented as a table insert. Until the reviewed RPC is deployed and tested, the UI reports the returned/transport error and does not claim a registration succeeded.

The remaining Phase 2 security review must verify authentication, tournament status, matching game account, deadline, capacity, duplicate prevention and concurrent requests in the database transaction.
