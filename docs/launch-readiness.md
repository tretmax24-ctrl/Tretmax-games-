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
| Player registrations | Implemented, runtime read pending | Own `tournament_entries` reads power My Tournaments, repeat-registration detection and profile tournament totals. Other players' entries are never queried. |
| Registration counts | Implemented and browser-verified | With `VITE_SUPABASE_REGISTRATION_SUMMARY_RPC_ENABLED=true`, cards and details displayed 2 registered / 32 max and 30 remaining from Supabase. |
| Profile statistics | Partially implemented | Tournament totals come from own entries; wins and rank remain `—`/`Unranked` until verified result and ranking systems exist. |
| Teams | Implemented, runtime browser verification pending | Deployed team tables/RLS/RPCs are consumed by Profile team management. Create, roster, invitations, accept/decline, leave, captain transfer and lock use RPCs; invite discovery remains intentionally unavailable without a secure player-search operation. |
| Team registration | Implemented, runtime browser verification pending | Duo/Trio/Squad detail flow calls `register_team_for_tournament`; server enforces exact roster size, locked roster, capacity and duplicate occupancy. |
| Tournament format selection | Implemented, automated tests passed | Create Tournament uses canonical game slugs, offers Solo/Duo/Trio/Squad only for team-capable battle-royale games, stores exact `player_format` values, and labels capacity as player or team slots. |
| Check-in | Implemented, runtime browser verification pending | Player detail flow calls deployed check-in RPCs and displays returned attendance progress. Owner/manager admin control calls `open_tournament_check_in`; no-show remains available through backend contract but has no fabricated UI queue. |
| Brackets, results, disputes, completion, rankings | Competition algorithms implemented and tested; live workflow blocked | Deterministic single-elimination/byes and configurable battle-royale scoring are pure frontend code with automated tests and a local admin preview. Secure generation, match writes, evidence, verification, disputes, completion and rankings require reviewed RPCs and tables. |
| Payments | Disabled | Existing payment/wallet tables are retained for future work; no collection or payout is enabled. |
| Production admin | Implemented, security testing pending | App.tsx now mounts the existing role-gated AdminLayout in production; live denied-role and RLS tests remain required. |
| Public sharing | Implemented, browser tested pending | Published detail pages provide native share when supported and an encoded WhatsApp share using the public tournament URL only. |
| Player help/FAQ | Implemented | How It Works documents manual IDs, registration boundaries, check-in and result workflow availability. |
| Mobile layouts | Implemented, device matrix pending | Existing responsive layout plus registration/share/FAQ refinements; viewport verification remains to be recorded. |
| Vercel/PWA staging release | Implemented, deployment and device testing pending | `vercel.json` provides SPA rewrites; the installable manifest, branded icons and a safe static-shell service worker are included. No Vercel deployment or physical-phone test has been performed. |

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
- [ ] Runtime registration, duplicate and full-event tests with real signed-in users; public count rendering is browser-verified.

## Phase 4 — teams and check-in

- [x] Team creation, private roster reads, invitations, accept/decline, leave, captain transfer and roster lock connected to deployed RPCs.
- [x] Duo/Trio/Squad team registration connected to `register_team_for_tournament`; capacity remains one entry slot per team.
- [x] Solo and team-member check-in connected to deployed server-time RPCs; team completion waits for every member.
- [x] Owner/manager check-in opening connected to `open_tournament_check_in` in Admin → Matches.
- [x] One-use invitation code creation, fragment links, recipient preview, explicit redemption, copy/share and captain revocation connected to deployed RPCs.
- [x] Authorized team attendance summary connected with required, checked-in, pending, no-show and entry status counts plus manual refresh.
- [ ] Browser verification with distinct captain, invitee, team and Owner accounts.
- [ ] Secure invitee player search/read API; current UI requires a known account UUID and exposes no directory.
- [ ] Admin no-show/referee queue UI; backend RPC is deployed but private participant/referee reads remain limited.

## Phase 5 — competition engine

- [x] Deterministic single-elimination bracket generation supports 2, 3, 4, 7, 8, 16 and 32 participants, byes and advancement links.
- [x] Configurable battle-royale placement/elimination scoring and ordered tie-breakers implemented as pure TypeScript; unverified or duplicate round results are rejected.
- [x] Automated Node tests cover bracket sizes, bye generation, duplicate winner prevention and scoring tie-breakers.
- [x] Admin Matches includes an explicitly local, unsaved bracket preview for participant IDs.
- [ ] Secure bracket-generation, match scheduling, result/evidence, referee verification, dispute, forfeit and completion RPCs reviewed and deployed.
- [ ] Player bracket/schedule and real standings connected to authorized backend reads.

## Phase gates

Phase 2 draft editing remains blocked until a reviewed Owner-only draft-edit RPC exists. Registration and team/check-in RPCs are deployed but still need browser tests with distinct signed-in users. Brackets, match results, disputes and completion still require reviewed transactional RPCs; UI controls alone do not count as complete.

## Verification

Commands run after this continuation:

- npm run lint

The staging release must be configured with the documented Vite environment variables in Vercel and the deployed HTTPS origin must be added to Supabase Auth redirect settings before browser authentication and invitation-link testing.
- npm run build
- npm test

No migrations, RLS policies, Storage policies, or production data were changed by this continuation.

