# Tretmax launch readiness

Updated: 2026-10-28

## Phase 0 — schema and feature reconciliation

| Area | Status | Evidence / blocker |
|---|---|---|
| Supabase Auth | Implemented, tested in prior phase | AuthProvider restores sessions and supports sign-out. Live Owner/negative-role verification still requires environment accounts. |
| Owner permissions | Implemented, partially tested | Server-issued role drives frontend gates and the existing publishing RPC. Database policy/RPC review remains authoritative. |
| Games | Implemented, tested | Active games load from public.games; bundled art is fallback. |
| Tournament drafts | Implemented, tested | Owner-scoped draft creation and listing use Supabase. |
| Free publishing | Implemented, tested | publish_tournament is preserved; client verifies public visibility after success. |
| Paid publishing | Blocked by design | Paid drafts can be configured; server publishing restriction remains active. |
| Profiles/game IDs | Implemented, runtime untested | Profile and game-account CRUD now uses existing owner-scoped policies. Delete remains blocked by policy. |
| Registration | Implemented, RPC deployed; runtime success test pending | Public detail calls the deployed `register_for_tournament` RPC, requires Auth, a matching linked game ID and rules acknowledgement, and surfaces returned codes. No duplicate insert logic exists in the browser. |
| Teams | Frontend unavailable state implemented; backend blocked | Team registration controls explain the missing reviewed contracts. Team tables/RPCs are not present in this checkout. |
| Check-in | Frontend unavailable state implemented; backend blocked | Detail pages show the event window and a disabled check-in control. Server-time attendance/no-show contracts are documented but not deployed. |
| Brackets, results, disputes, completion, rankings | Missing | Safe mutation RPCs and supporting workflows are not deployed. |
| Payments | Disabled | Existing payment/wallet tables are retained for future work; no collection or payout is enabled. |
| Production admin | Implemented, security testing pending | App.tsx now mounts the existing role-gated AdminLayout in production; live denied-role and RLS tests remain required. |
| Public sharing | Implemented, browser tested pending | Published detail pages provide native share when supported and an encoded WhatsApp share using the public tournament URL only. |
| Player help/FAQ | Implemented | How It Works documents manual IDs, registration boundaries, check-in and result workflow availability. |
| Mobile layouts | Implemented, device matrix pending | Existing responsive layout plus registration/share/FAQ refinements; viewport verification remains to be recorded. |

The checked-in core migration defines profiles, games, tournaments, player_game_accounts, tournament_entries, matches, wallet tables and payment requests. No service-role key or browser database fallback is used.

## Phase 1 — profile and manual game IDs

- [x] Implemented authenticated profile load and save using existing profiles columns; runtime persistence test pending.
- [x] Implemented manual game ID/name editing using active public.games and player_game_accounts; runtime persistence test pending.
- [x] Text identifiers preserve leading zeroes and non-numeric formats.
- [x] Existing verification status is displayed as unverified/reviewed/rejected.
- [ ] Delete game account: blocked until a reviewed DELETE policy/RPC exists.
- [ ] Screenshot evidence: blocked until Storage bucket/policies are confirmed.
- [ ] Cross-user negative tests: requires two signed-in test accounts.

## Phase 3 — registration client

- [x] Registration form added to published free-entry detail pages.
- [x] Requires a signed-in user, matching linked game account, and rules acknowledgement.
- [x] Uses only the proposed atomic RPC contract; no direct client insert.
- [x] Supabase security review/deployment of `register_for_tournament` reported by the backend team through migration `20261028135017_secure_free_solo_tournament_registration.sql`.
- [ ] Runtime registration, slot counts, duplicate and full-event tests with real signed-in users.

## Phase 4 — teams and check-in

- [x] Team creation/invitation/roster-lock and check-in/no-show contracts prepared in [api-contracts.md](./api-contracts.md).
- [x] Public detail UI labels team registration and check-in as unavailable until reviewed RPCs are deployed.
- [ ] Reviewed team tables, RLS and RPCs deployed and concurrency-tested.
- [ ] Signed-in team registration, roster locking, check-in and no-show flows verified end to end.

## Phase gates

Phase 2 draft editing remains blocked until a reviewed Owner-only draft-edit RPC exists. Registration is now backend-deployed but still needs a signed-in runtime test. Team participation and all other competition mutations require reviewed transactional RPCs with concurrency and negative tests; UI controls alone do not count as complete.

## Verification

Commands run after this continuation:

- npm run lint
- npm run build

No migrations, RLS policies, Storage policies, or production data were changed by this continuation.

