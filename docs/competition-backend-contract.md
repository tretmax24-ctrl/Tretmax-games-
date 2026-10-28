# Tretmax Games — Official Competition Backend RPC Contract

Status: DEPLOYED in Supabase project mlwtwvmaograsecxegoq; migrations committed to GitHub main. Tested with restricted-role PostgreSQL requests and rollback-only fixtures; real signed-token browser integration remains unverified.

Read together with docs/api-contracts.md, docs/migrations-needed.md and docs/teams-checkin-backend.md.

## Platform boundaries

- Single-elimination is the only supported bracket format. Battle royale, double elimination and round robin return UNSUPPORTED_FORMAT rather than silently generating the wrong bracket.
- An official entrant is one tournament_entries row: Solo 1 player or a locked Duo/Trio/Squad frozen roster. A team occupies ONE match side and ONE capacity slot.
- Bracket generation requires at least 2 and at most 256 fully checked-in eligible entries, non-null reserved slot numbers, free entry, status check_in and a passed server-side check-in deadline.
- Deterministic seeding uses reserved slot_number, registration time and entry UUID; powers of two and first-round byes advance automatically. Bracket creation is locked and one per tournament. A repeated call returns BRACKET_EXISTS and does not regenerate.
- All official match state writes use trusted PostgreSQL functions with tournament-row then match-row locks, checks and audit events. No player can directly UPDATE bracket/match/winner tables.
- Owner and owning trusted tournament_manager can generate and complete tournaments. Owner, owning manager or assigned event referee can schedule, verify, resolve disputes and record forfeits. Signed-in assigned entry participants (including individual team members) can submit results and open disputes.
- New tables have RLS and no direct client read/write privileges. The legacy public.matches table was empty and its direct client write grants were revoked while keeping its prior SELECT policy.

## New tables

public.tournament_brackets
public.tournament_bracket_matches
public.match_result_submissions
public.match_disputes
public.tournament_final_standings
public.competition_audit_events

Use the new bracket RPCs, NOT the legacy public.matches table. The private helper functions are in the unexposed tretmax_internal schema and not executable by anonymous/authenticated clients.

## Exact RPC signatures and response codes

All return JSONB and follow { ok, code, message, ... }. The browser must handle transport error first, then data.ok. Optional parameters may be omitted or passed as null.

### generate_tournament_bracket(p_tournament_id uuid)
Authenticated organizer only. Success BRACKET_GENERATED returns bracket_id, tournament_id, entrant_count, bracket_size, total_rounds, byes, tournament_status=in_progress. Example:

~~~json
{"ok":true,"code":"BRACKET_GENERATED","message":"Official single-elimination bracket generated.","bracket_id":"<uuid>","tournament_id":"<uuid>","entrant_count":3,"bracket_size":4,"total_rounds":2,"byes":1,"tournament_status":"in_progress"}
~~~

Errors: FORBIDDEN, BRACKET_EXISTS (includes bracket_id), PAID_EVENT_UNSUPPORTED, UNSUPPORTED_FORMAT, UNSUPPORTED_PLAYER_FORMAT, CHECK_IN_REQUIRED, CHECK_IN_NOT_CLOSED, INSUFFICIENT_ENTRANTS, INVALID_CHECKED_IN_ROSTER, MISSING_ENTRY_SLOT, BRACKET_TOO_LARGE, LEGACY_MATCHES_EXIST.

### schedule_tournament_match(p_match_id uuid, p_scheduled_at timestamptz, p_room_label text DEFAULT NULL)
Owner, owning tournament_manager or assigned referee only. Ready match with two known opponents in an in-progress free event. Schedule at least 30 seconds in the future, not before event start and within 30 days. One official initial schedule; no rescheduling RPC yet. Private room label at most 100 safe characters.

Success MATCH_SCHEDULED returns match_id and scheduled_at. Errors ALREADY_SCHEDULED, MATCH_NOT_READY, INVALID_SCHEDULE, INVALID_ROOM, FORBIDDEN.

### submit_match_result(p_match_id uuid, p_winner_entry_id uuid, p_score jsonb, p_evidence_path text DEFAULT NULL)
Only a user in one of the assigned entries' frozen participant snapshots. Scheduled match must have started and be within its 48-hour submission window, status ready. Claimed winner must be one of two assigned *entry* IDs. Score is a compact JSON object <=2048 bytes. Only one pending submission per entrant side; rejected submissions may be replaced.

Success RESULT_SUBMITTED returns match_id, submission_id, status=pending. Errors MATCH_NOT_FOUND (also nonparticipants), ALREADY_SUBMITTED, OUTSIDE_RESULT_WINDOW, INVALID_WINNER, INVALID_SCORE, INVALID_EVIDENCE_PATH, MATCH_NOT_READY.

Evidence reference must be a path shaped like match-evidence/<match UUID>/<safe-filename>, not a URL. This backend stores references privately. See IMPORTANT evidence limitation below.

### verify_match_result(p_match_id uuid, p_decision text, p_reason text DEFAULT NULL)
Owner, owning manager or assigned referee. Decision approve or reject. A reject requires a 5–500-character reason, marks pending submissions rejected and permits resubmission; success RESULT_REJECTED returns match_id. Approve requires an already-started match, at least one pending submission, and all pending winner claims agreeing; it finalizes and advances once. Success RESULT_VERIFIED returns match_id, winner_entry_id, next_match_id (null for final). Errors CONFLICTING_RESULTS, NO_PENDING_RESULT, MATCH_NOT_READY, MATCH_NOT_STARTED, INVALID_DECISION, REASON_REQUIRED.

### open_match_dispute(p_match_id uuid, p_reason text, p_evidence_path text DEFAULT NULL)
Assigned participant in started and not-final match, within 48 hours of scheduled start, with a pending result. Only one open dispute per match; reason 5–500 characters. Success DISPUTE_OPENED returns dispute_id and match_id. Errors DISPUTE_ALREADY_OPEN, NO_RESULT_TO_DISPUTE, OUTSIDE_DISPUTE_WINDOW, INVALID_REASON, MATCH_NOT_FOUND.

### resolve_match_dispute(p_dispute_id uuid, p_decision text, p_reason text, p_winner_entry_id uuid DEFAULT NULL)
Owner, owning manager or referee. Decision dismiss closes dispute and returns match to ready; success DISPUTE_DISMISSED, dispute_id. Decision uphold REQUIRES winner entry ID assigned to the match, accepts staff judgment, finalizes and advances; success DISPUTE_RESOLVED returns dispute_id, match_id, winner_entry_id and next_match_id. Reason 5–500 chars required. Replays return DISPUTE_NOT_OPEN; participants without staff rights receive FORBIDDEN.

### record_match_forfeit(p_match_id uuid, p_entry_id uuid, p_reason text)
Staff only. p_entry_id is the FORFEITING opponent entry, not the winner. Requires ready match with two assigned opponents, scheduled start already passed, active free tournament, reason 5–500 characters. Records other side as winner and advances once. Success FORFEIT_RECORDED returns match_id, winner_entry_id, next_match_id; repeat gives MATCH_NOT_READY.

### complete_tournament(p_tournament_id uuid)
Owner or owning trusted tournament_manager only. Requires an in-progress active bracket, all matches terminal with winners, no open disputes, and a verified/forfeited final. Creates ranked standings (champion=1, runner-up=2, previous losers ranked by elimination round), locks bracket completion and transitions tournament to completed. Success TOURNAMENT_COMPLETED returns tournament_id, bracket_id, champion_entry_id, standings_count and status=completed. Repeat gives ALREADY_COMPLETED. Other errors MATCHES_UNRESOLVED, DISPUTES_UNRESOLVED, FINAL_NOT_VERIFIED, PAID_EVENT_UNSUPPORTED.

## Read-only RPCs

### get_tournament_bracket(p_tournament_id uuid)
PUBLIC: anonymous and signed-in calls. Requires publicly visible tournament. Returns BRACKET_AVAILABLE with tournament_id, bracket_id, format, status, entrant_count, bracket_size, total_rounds, champion_slot_number and matches[]. Each match has match_id, round_number, match_number, status, scheduled_at, next_match_id, seed_one/seed_two, slot_one_number/slot_two_number and winner_slot_number. Tournament slots/seeds are pseudonymous labels; DO NOT treat them as private user IDs or expose team rosters. Private room_label, submissions, scores, player IDs and evidence are omitted.

Draft/unknown tournaments both return TOURNAMENT_NOT_FOUND; published event without bracket returns BRACKET_NOT_FOUND.

### get_my_match_schedule(p_tournament_id uuid DEFAULT NULL)
AUTHENTICATED OWN-PLAYER: result MATCH_SCHEDULE_AVAILABLE, match_count, matches[]. Each assigned match includes tournament_id, match_id, round_number, match_number, status, scheduled_at, room_label, own_entry_id, own_slot_number, opponent_slot_number, result (pending/won/lost). The private room label appears only to the registered participant. Null tournament ID means all owned scheduled/assigned matches in active or completed public tournaments.

### get_match_review_queue(p_tournament_id uuid)
STAFF: Owner, owning manager or event-assigned referee. Returns REVIEW_QUEUE_AVAILABLE, match_count and matches[] with pending submissions including submitting_entry_id, claimed_winner_entry_id, score, evidence_path; open disputes with dispute_id, reason and private evidence path; and staff-only room_label. This exposes NO evidence file content. Players get FORBIDDEN.

### get_tournament_standings(p_tournament_id uuid)
PUBLIC only after completion. Returns STANDINGS_AVAILABLE with champion_slot_number, standings[] of { slot_number, rank, eliminated_round }. No Auth, game account or participant identities.

## Browser integration example

~~~ts
const bracket = await supabase.rpc('get_tournament_bracket', { p_tournament_id: tournamentId });
const generated = await supabase.rpc('generate_tournament_bracket', { p_tournament_id: tournamentId });
const scheduled = await supabase.rpc('schedule_tournament_match', {
  p_match_id: matchId, p_scheduled_at: scheduledIso, p_room_label: roomLabel
});
const personal = await supabase.rpc('get_my_match_schedule', { p_tournament_id: tournamentId });
const submitted = await supabase.rpc('submit_match_result', {
  p_match_id: matchId, p_winner_entry_id: winningEntryId, p_score: { score: 2 }, p_evidence_path: null
});
const queue = await supabase.rpc('get_match_review_queue', { p_tournament_id: tournamentId });
const verified = await supabase.rpc('verify_match_result', { p_match_id: matchId, p_decision: 'approve', p_reason: null });
const disputed = await supabase.rpc('open_match_dispute', {
  p_match_id: matchId, p_reason: 'Reported result contradicts match record', p_evidence_path: null
});
const resolved = await supabase.rpc('resolve_match_dispute', {
  p_dispute_id: disputeId, p_decision: 'uphold', p_reason: 'Reviewed match evidence',
  p_winner_entry_id: winningEntryId
});
const forfeited = await supabase.rpc('record_match_forfeit', {
  p_match_id: matchId, p_entry_id: forfeitingEntryId, p_reason: 'Match no-show confirmed'
});
const finished = await supabase.rpc('complete_tournament', { p_tournament_id: tournamentId });
const ranks = await supabase.rpc('get_tournament_standings', { p_tournament_id: tournamentId });
~~~

## Applied migration history (in exact order)

1. 20261028210505_competition_phase1_persistent_brackets_and_generation.sql
2. 20261028210621_competition_phase1_correct_bye_seed_labels.sql
3. 20261028210730_competition_phase2_secure_results_disputes_forfeits.sql
4. 20261028210903_competition_phase3_completion_standings_read_rpcs.sql
5. 20261028210953_competition_phase3_fix_uuid_winner_aggregate.sql
6. 20261028211409_competition_phase4_bound_bracket_sizes_and_slot_validation.sql

The two small runtime corrections fixed wrong bye-seed labels and MIN(uuid) in winner claim verification, caught during SQL execution. These were separate tracked, applied migrations.

## Tests completed on live PostgreSQL with rollback-only fixtures

- Organizer generates one bracket after check-in deadline; forged Owner denied; second invocation BRACKET_EXISTS. Three entrants create a four-position bracket with one bye and stable seed labels.
- Two real user identities: bracket, match scheduling/replay denial, private participant room schedule, result submitted/replay denial, staff-only review queue, winner verification, final completion and rankings; repeat completion rejected.
- Three entrants: first-round bye advances; first match forfeit advances other opponent; final becomes ready; final forfeit resolves; all three entrants appear in standings; duplicate forfeit denied.
- Two locked Duo teams with FOUR individual roster participants occupy TWO match slots. Teammate schedule and submission work; specifically assigned tournament referee reads review and verifies.
- Two conflicting result claims cause CONFLICTING_RESULTS; player can dispute but not resolve; duplicate dispute denied; staff dismissal does not override conflict; upheld dispute with explicit winner advances once and replay rejected.
- Unauthorized participant and staff actions, public draft privacy, private room/evidence response separation, direct RLS write/read bypass attempts, legacy matches direct write denied.
- Paid event, battle royale format, open registration, unclosed check-in, insufficient checked-in entrants rejected without allocating a bracket.
- A two-request generation test yielded one bracket, one BRACKET_EXISTS, zero duplicate matches. START TIMES DID NOT OVERLAP; this is NOT a true simultaneous lock-contention result. All disposable race fixtures were deleted.

## IMPORTANT outstanding work before production

- Supabase Storage has NO configured buckets. Evidence REFERENCES are private but uploads, downloads, existence checks and object access policies are NOT implemented; keep actual evidence uploads disabled until a reviewed private Storage policy is deployed.
- No verified true overlapping transaction stress test of bracket generation/verification/winner advancement yet.
- No real signed-token HTTP tests or full browser integration of new RPCs yet.
- Dedicated Trio and Squad test fixtures and real-client flows remain to be exercised, although the code validates their frozen roster sizes.
- The Supabase security advisor flags callable SECURITY DEFINER functions and RLS tables without policies. New data access is intentionally routed through limited RPCs; these flags need periodic review. Leaked-password protection remains a pre-existing Auth warning.
- No existing tournament or registration was modified or completed by the tests. No payment processing was enabled.
