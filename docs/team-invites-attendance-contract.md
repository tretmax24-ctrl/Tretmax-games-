# Tretmax Games — Opaque Team Invites and Attendance Summary

Status: **deployed to Supabase project `mlwtwvmaograsecxegoq`**. Two migrations are in GitHub `main` and Supabase migration history. All functions use JSON `{ ok, code, message, ... }` responses. Frontend integration and real signed-token HTTP end-to-end tests for these **new** RPCs have not been performed.

See also [Teams and Check-in Backend](./teams-checkin-backend.md).

## Why opaque codes

Captains do **not** need to learn or submit another player's Supabase Auth UUID. Instead they issue a private, random, single-use `tm_<64 lowercase hex chars>` invitation code and share it only with their intended recipient. Codes have **256 bits of cryptographic entropy**, are persisted **only as SHA-256 hashes**, expire on the database server, and are redeemable at most once. There is **no public player directory or player lookup**, and no emails, Auth UUIDs, roster or game IDs are exposed by invite preview. Links are bearer credentials: whoever receives an unredeemed valid code and has a suitable signed-in game account can claim it first.

Build the share URL on the frontend, ideally using a URL **fragment** (for example `/teams/join#code=tm_...`) so the code is not sent in the initial HTTP request URL. Never put the token into analytics, server logs, support reports or referrer headers; remove it from browser history once read. The backend does **not** store or return a full frontend URL, only the code once.

At most one active code may exist per team; to issue a different one, revoke the old code or wait for expiry. Maximum lifetime 7 days, minimum 10 minutes, default 24 hours. Generation is limited to 10 codes per team per rolling hour. Team locks and row locks serialize issuing, consuming and revoking codes. Codes issued by a former captain and codes for locked rosters are not redeemable.

## RPC contract

All functions return `jsonb` and grant `EXECUTE` only to `authenticated` (not `anon`). The frontend should check Supabase transport `error` first, then check `data.ok` and display `data.message`.

### 1. `create_team_invite_code(p_team_id uuid, p_expires_in_minutes integer DEFAULT 1440)`

Captain-only; requires a forming roster and remaining invitation capacity. Success:

```json
{
  "ok": true, "code": "INVITE_CREATED",
  "message": "Private one-use invitation code created.",
  "team_id": "<team UUID>",
  "invite_code": "tm_<64 lowercase hex characters>",
  "expires_at": "<ISO UTC timestamp>"
}
```

Codes are only returned once. Failures: `UNAUTHENTICATED`, `FORBIDDEN`, `ROSTER_LOCKED`, `INVALID_EXPIRY`, `ACTIVE_INVITE_EXISTS`, `ROSTER_FULL`, `INVITE_RATE_LIMITED`.

### 2. `preview_team_invite_code(p_code text)`

A signed-in recipient with the code can view the minimal target team information. Success:

```json
{
  "ok": true, "code": "INVITE_PREVIEW",
  "message": "Review the team invitation before joining.",
  "team_id": "<team UUID>",
  "team_name": "<team name>",
  "game_name": "<public game name>",
  "expires_at": "<ISO UTC timestamp>"
}
```

Does not expose `auth.users` IDs, roster members, private game UIDs or emails. Unknown, malformed, expired, redeemed, revoked, locked-team, and former-captain codes uniformly return `{ "ok": false, "code": "INVITE_UNAVAILABLE", "message": "Invitation code is invalid or unavailable." }`.

### 3. `redeem_team_invite_code(p_code text)`

Signed-in player, not already a member, must have an eligible linked game account matching the team's game. Atomic single-use redemption adds that player as a team member, consumes the code and writes a private audit event. Success:

```json
{
  "ok": true, "code": "JOINED",
  "message": "You joined the team.",
  "team_id": "<team UUID>",
  "game_account_id": "<caller-owned linked account UUID>",
  "member_count": 2
}
```

Failures: `UNAUTHENTICATED`, `INVITE_UNAVAILABLE` (also for replay), `ALREADY_MEMBER`, `ROSTER_FULL`, `GAME_ACCOUNT_REQUIRED`. No Auth UUID of any *other* player is returned. If there was an older direct invitation for this caller and team, the direct invitation is also marked accepted.

### 4. `revoke_team_invite_code(p_team_id uuid)`

Current captain-only; atomically invalidates the team's active code. Success:

```json
{
  "ok": true, "code": "INVITE_REVOKED",
  "message": "Invitation code revoked.",
  "team_id": "<team UUID>"
}
```

Failures: `UNAUTHENTICATED`, `FORBIDDEN`, `NO_ACTIVE_INVITE`. Revocation/redeem races share the same team-first lock order. Current captain can revoke an old captain's unusable active code after leadership transfer.

### 5. `get_team_attendance_summary(p_entry_id uuid)`

Read-only. **Authorized:** any player in this registered entry's frozen participant snapshot, the trusted platform Owner, the owning trusted `tournament_manager`, or a referee assigned to the entry's tournament. Uses the existing `tournament_entries` entry ID. Success:

```json
{
  "ok": true,
  "code": "ATTENDANCE_AVAILABLE",
  "message": "Team attendance summary available.",
  "tournament_id": "<tournament UUID>",
  "team_id": "<team UUID>",
  "entry_id": "<tournament entry UUID>",
  "entry_status": "registered",
  "required_count": 2,
  "checked_in_count": 1,
  "pending_count": 1,
  "no_show_count": 0,
  "entry_checked_in": false,
  "check_in_opens_at": "<ISO timestamp>",
  "check_in_closes_at": "<ISO timestamp>",
  "server_time": "<ISO timestamp>"
}
```

The counts come from the frozen `tournament_entry_participants` snapshot, not current roster membership. They reflect check-ins, no-shows and disqualification after refresh. The function locks tournament then entry in the same order as attendance writers and returns no player identities or private game data.

Unauthorized, unknown and non-team entries uniformly return `{ "ok": false, "code": "ENTRY_NOT_FOUND", "message": "Team attendance is not available for this entry." }`. A null ID returns `INVALID_ENTRY_ID`; a missing Auth context returns `UNAUTHENTICATED`. Anonymous callers lack EXECUTE entirely. The backend does not expose an attendance directory.

## Supabase JS integration

```ts
const issue = await supabase.rpc('create_team_invite_code', {
  p_team_id: teamId,
  p_expires_in_minutes: 1440,
});
if (issue.error) throw issue.error;
if (!issue.data?.ok) throw new Error(issue.data?.message);
const code = issue.data.invite_code;
// The captain shares the code or a frontend-built fragment link.

// Recipient is signed in; frontend reads the code from the fragment.
const preview = await supabase.rpc('preview_team_invite_code', { p_code: code });
const joined = await supabase.rpc('redeem_team_invite_code', { p_code: code });

// Captain revokes only the currently active code.
const revoked = await supabase.rpc('revoke_team_invite_code', { p_team_id: teamId });

// Registered member or assigned staff loads fresh progress after a refresh.
const attendance = await supabase.rpc('get_team_attendance_summary', { p_entry_id: entryId });
```

Existing UUID-targeted `invite_team_member` and `respond_to_team_invitation` are **unchanged** for backwards compatibility. No frontend feature flag was modified and no payment feature was enabled.

## Applied migrations

1. `20261028183636_add_secure_one_use_team_invitation_codes.sql`
2. `20261028183728_add_authorized_team_attendance_summary_rpc.sql`

Both have been committed to `supabase/migrations/` on GitHub `main`. No existing permissions, tournament publishing logic, solo/team registration, public slot-count semantics, or payment handling were changed.

## Verification

**Passed live PostgreSQL tests with transaction-scoped disposable fixtures:**
- Captain created code; second issuance rejected; code format and length correct.
- Valid code preview returned only non-sensitive team metadata.
- Wrong-game linked account rejected without consuming code.
- Unauthorized captain revocation denied.
- Valid recipient redeemed code once; replay and subsequent preview denied.
- Expired code denied; expired code superseded by newly issued code.
- Revoked code denied; repeated revoke reported `NO_ACTIVE_INVITE`.
- Malformed and unknown codes returned the same generic error.
- Anonymous clients lacked EXECUTE on new RPCs; signed-in clients could not directly SELECT/INSERT/UPDATE/DELETE hashed-code records.
- Authenticated registered team member saw 0/2, 1/2 and (after second participant checked in) 2/2 attendance.
- Owner and assigned referee could read the aggregate; unauthorized player with forged Owner claim and anonymous caller could not.
- No-shows updated the aggregate to 2 no-shows while the entry retained its reserved capacity slot.
- Deployed function owner, empty `search_path`, per-role EXECUTE, table RLS and original data preserved.

**Not completed:** true overlapping independent-session redemption/revoke stress testing, token-rotation behavior after captain transfer, real signed-token HTTP calls and browser UI integration for these new endpoints. An attempted two-contender test failed in its harness and was blocked on the second request; its temporary database records were removed. Do **not** report that concurrency stress passed. The implemented lock order and one-use state constraints are safeguards, not a substitute for the outstanding test.

The Supabase security advisor warns on authenticated `SECURITY DEFINER` RPCs and RLS tables with no SELECT policies. These code-hash/audit-table access restrictions are intentional; audit warnings should be periodically reviewed. The pre-existing leaked-password-protection warning remains unrelated to this migration.
