# Current code findings

The repository is an existing React + TypeScript + Vite app. Routing is defined in `src/App.tsx`; reusable visual primitives and responsive rules live in `src/components` and `src/styles.css`. Supabase access is centralized in `src/lib/supabase.ts` and feature repositories.

## Verified structure

- Public pages: home, games, tournaments, tournament detail, leaderboard, how it works, profile, login and registration.
- Admin pages: overview, tournaments, players, matches, finance, content, staff and settings.
- Auth: `AuthProvider` restores Supabase sessions. Admin access requires a server-issued `user.app_metadata.tretmax_role` recognized by `permissions.ts`.
- Tournament data: `tournamentRepository.ts` reads `games` and published/draft `tournaments`; creation and publish use existing supported contracts.
- Profile data: `playerProfile.ts` reads and updates the signed-in user's profile and manually entered `player_game_accounts`.

## Boundaries

The checked-in migrations include deployed solo registration, team lifecycle, opaque invitation-code and check-in operations. The client calls those RPCs and does not fall back to direct inserts or browser state. The registration-summary and team-attendance-summary reads are consumed through their documented contracts. Brackets, matches, disputes, winner completion, notifications and payout execution remain backend work. Real browser verification with distinct accounts is still outstanding for the newest team invite and attendance flows.

The handoff package referenced in the continuation request was absent, so this finding is reconciled from the master specification, checked-in migrations and current source.
