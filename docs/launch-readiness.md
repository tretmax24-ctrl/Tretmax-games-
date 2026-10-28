# Tretmax launch readiness

Updated: 2026-10-28

## Phase 0 — schema and feature reconciliation

| Area | Status | Evidence / blocker |
|---|---|---|
| Supabase Auth | Implemented, tested in prior phase | `AuthProvider` restores sessions and supports sign-out. Live Owner/negative-role verification still requires environment accounts. |
| Owner permissions | Implemented, partially tested | `app_metadata.tretmax_role` drives frontend gates and the existing publishing RPC. Database policy/RPC review remains authoritative. |
| Games | Implemented, tested | Active games load from `public.games`; bundled art is fallback. |
| Tournament drafts | Implemented, tested | Owner-scoped draft creation and listing use Supabase. |
| Free publishing | Implemented, tested | `publish_tournament` is preserved; client verifies public visibility after success. |
| Paid publishing | Blocked by design | Paid drafts can be configured; server publishing restriction remains active. |
| Profiles/game IDs | Phase 1 in progress | Existing `profiles` and `player_game_accounts` tables/policies support owner CRUD except deletion policy. |
| Registration, teams, check-in, brackets, results, disputes, completion, rankings | Missing | Schema primitives exist for some areas, but no safe mutation RPCs/client flows are present. |
| Payments | Disabled | Existing payment/wallet tables are retained for future work; no collection or payout is enabled. |
| Production admin | Blocked | `App.tsx` still gates the admin shell to development builds until production authorization tests are complete. |

The checked-in core migration defines `profiles`, `games`, `tournaments`, `player_game_accounts`, `tournament_entries`, `matches`, wallet tables and payment requests. Existing policies are owner-scoped for profiles/game accounts and registration inserts. No client-side service key or browser database fallback is used.

## Phase 1 — profile and manual game IDs

- [x] Implemented: authenticated profile load and save using existing `profiles` columns (runtime persistence test pending).
- [x] Implemented: manual game ID/name editing using active `public.games` and `player_game_accounts` (runtime persistence test pending).
- [x] Implemented: text identifiers preserve leading zeroes and non-numeric formats.
- [x] Implemented: existing verification status is displayed as unverified/reviewed/rejected.
- [ ] Delete game account: blocked until a reviewed DELETE policy/RPC exists.
- [ ] Screenshot evidence: blocked until Storage bucket/policies are confirmed.
- [ ] Cross-user negative tests: requires two signed-in test accounts.

## Phase gates

The next safe phase is Phase 2 only after a reviewed Owner-only draft-edit RPC exists. Registration and all competition mutations must use reviewed transactional RPCs with concurrency and negative tests; UI controls alone do not count as complete.

## Verification

Commands run after Phase 1:

- `npm run lint`
- `npm run build`

No migrations, RLS policies, storage policies, or production data were changed by this phase.

