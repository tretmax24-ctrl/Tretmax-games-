# Tretmax Games — Teams and Tournament Check-in Backend

Status: deployed to Supabase project `mlwtwvmaograsecxegoq` on 2026-10-28. **Backend tested using SQL transaction fixtures and simulated JWT request settings; browser/real-token end-to-end integration is not yet tested.** Existing solo registration and public capacity RPCs remain in use.

## Calling convention

Use the browser Supabase client's signed-in session and a publishable/anon key only; never a service-role key. Calls return `jsonb`. For each call, check transport `error` and then `data.ok`. On rejection, `data.ok=false`, and `data.code` and `data.message` are human-readable/machine-readable error fields. Optional IDs, statuses and counts occur on successful responses or specified errors. All team/check-in RPCs accept only `authenticated` execution; the existing public `get_tournament_registration_summary` still accepts `anon` and `authenticated`.

## RPCs

| RPC and named parameters | Allowed caller | Success `code` | Important result fields |
| --- | --- | --- | --- |
| `create_team(p_game_id uuid, p_name text)` | signed-in player with eligible linked account for active game | `TEAM_CREATED` | `team_id`, `captain_id`, `max_members=4`, `member_count=1`, `roster_state='forming'` |
| `get_team_roster(p_team_id uuid)` | that team's member/captain | `ROSTER_AVAILABLE` | `team_id`, `game_id`, `captain_id`, `roster_state`, `member_count`, `members` (team-private game identities) |
| `invite_team_member(p_team_id uuid, p_user_id uuid)` | current captain before roster lock | `INVITED` | `team_id`, `invitation_id` |
| `respond_to_team_invitation(p_invitation_id uuid, p_accept boolean)` | invited player | `JOINED` or `DECLINED` | `team_id`; on join also `game_account_id`, `member_count` |
| `leave_team(p_team_id uuid)` | noncaptain member, before lock | `LEFT` | `team_id` |
| `transfer_team_captain(p_team_id uuid, p_new_captain_id uuid)` | current captain, before lock | `CAPTAIN_TRANSFERRED` | `team_id`, `captain_id` |
| `lock_team_roster(p_team_id uuid)` | current captain | `ROSTER_LOCKED` | `team_id`, `member_count`, `roster_state='locked'` |
| `register_team_for_tournament(p_tournament_id uuid, p_team_id uuid, p_rules_accepted boolean)` | captain of locked team | `REGISTERED` | `tournament_id`, `team_id`, `entry_id`, `slot_number`, `team_size`, `registered_count`, `max_players`, `slots_remaining`, `status='registered'` |
| `assign_tournament_referee(p_tournament_id uuid, p_user_id uuid)` | trusted platform Owner who owns event | `REFEREE_ASSIGNED` | `tournament_id`, `referee_user_id` |
| `open_tournament_check_in(p_tournament_id uuid)` | trusted Owner or owning tournament_manager | `CHECK_IN_OPEN` | `tournament_id`, `status='check_in'` |
| `check_in_tournament(p_tournament_id uuid, p_entry_id uuid)` | registered solo player or individual team roster member | `CHECKED_IN` | `entry_id`, `checked_in_at`, `checked_in_count`, `required_count`, `entry_checked_in` |
| `record_team_member_check_in(p_entry_id uuid)` | individual roster member; team-only convenience wrapper | `CHECKED_IN` | same fields as `check_in_tournament` |
| `mark_entry_no_show(p_entry_id uuid, p_reason text)` | Owner, owning tournament_manager, or event-assigned referee, after check-in deadline | `NO_SHOW_RECORDED` | `entry_id`, `status='disqualified'` |

## Schema and business rules

Team tables: `public.teams`, `public.team_members`, `public.team_invitations`, `public.team_audit_events`. Event tables: `public.tournament_staff`, `public.tournament_entry_participants`, existing `public.tournament_entries`. All new tables have RLS. Clients receive **no INSERT/UPDATE/DELETE privileges** on team, participant, staff, invitation or audit tables.

- Team captain joins automatically at creation; 2–4 active non-rejected game accounts matching the team's game are required to lock roster. Once locked, no invitation, transfer or departure is allowed.
- `Duo` means exactly 2 members, `Trio` exactly 3 and `Squad` exactly 4. Other player formats—including `Solo`—are rejected by team registration. Captain accepts rules on the team's behalf. Only free registration-open events with a valid *server-time* registration window can register.
- **Capacity counts ENTRY ROWS, not participant rows.** A team creates one `tournament_entries` row with `team_id` and consumes one tournament slot; a solo player creates one row. Every entry counts, including withdrawn and disqualified entries, matching the existing summary. `tournament_entry_participants` stores one roster snapshot per player and enforces `UNIQUE(tournament_id,user_id)`, preventing solo/team or multi-team duplicate occupancy. Existing solo entries were backfilled, and the existing solo registration RPC now automatically creates participant claims via trigger.
- Game account matching is rechecked at team registration, and a game UID snapshot is stored privately. Team members can see their own participation and the entry their team occupies. The public capacity summary does not expose participants.
- An organizer calls `open_tournament_check_in` **during** the scheduled check-in window, after registration closes. `check_in_tournament` requires status `check_in` and verifies `clock_timestamp()` is in `[check_in_opens_at,check_in_closes_at)`. Each player records only their own attendance; only when the full snapshot roster checks in does the team entry become `checked_in`.
- After the deadline, `mark_entry_no_show` may disqualify an entry that remains `registered`, marking pending participants `no_show` without releasing its reserved slot. Referees are appointed per tournament by the Owner; player and captain roles alone cannot mark no-shows.
- Team, check-in, referee and no-show state changes write private audit rows. User-editable `user_metadata` cannot grant Owner or organizer rights. Payment operations were not changed.

## Example frontend use

```ts
const created = await supabase.rpc('create_team', { p_game_id: gameId, p_name: teamName });
const invite = await supabase.rpc('invite_team_member', { p_team_id: teamId, p_user_id: inviteeUserId });
const reply = await supabase.rpc('respond_to_team_invitation', { p_invitation_id: invitationId, p_accept: true });
const locked = await supabase.rpc('lock_team_roster', { p_team_id: teamId });
const registered = await supabase.rpc('register_team_for_tournament', { p_tournament_id: tournamentId, p_team_id: teamId, p_rules_accepted: true });
const opened = await supabase.rpc('open_tournament_check_in', { p_tournament_id: tournamentId });
const checked = await supabase.rpc('check_in_tournament', { p_tournament_id: tournamentId, p_entry_id: entryId });
```

## Migrations applied in order

1. `20261028180315_team_phase1_rosters_invitations_audit.sql`
2. `20261028180454_team_phase2_registration_capacity_participants.sql`
3. `20261028180700_team_phase3_checkin_referees_no_show.sql`
4. `20261028180819_team_phase3_fix_member_checkin_rls_wrapper.sql`
5. `20261028180933_team_phase3_harden_no_show_null_auth.sql`
6. `20261028181040_team_phase4_participant_reads_captain_transfer_paid_guard.sql`
7. `20261028181223_team_phase5_snapshot_integrity_invitation_preview.sql`

## Verified and outstanding

Passed PostgreSQL transaction tests: create/invite/accept/decline/reinvite/leave/transfer/lock; invalid invitation/game, duplicate and locked-roster denials; valid Duo registration as a single slot with two private player claims; duplicate and paid/expired/closed/wrong-game/wrong-size/full/solo-format denials; solo registration compatibility and capacity summary; authorized and unauthorized team member attendance; partial and full team check-in; solo check-in, replay and early deadline denials; Owner assignment of a referee; unauthorized referee and premature no-show denials; authorized post-deadline no-show, replay and audit; RLS privacy, grants and existing-row preservation.

**Not yet done:** browser integration, real user-token HTTP tests, and independent simultaneously overlapping transaction stress tests. The migrations use tournament-row FOR UPDATE serialization, team-row FOR UPDATE and unique indexes as concurrency safeguards; do not claim stress-tested behavior from sequential test sessions. For a live production rollout, implement frontend invitation/roster/team registration/check-in UI and test with distinct signed-in users. No test fixtures were retained.
