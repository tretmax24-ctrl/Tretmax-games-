# Tretmax implementation roadmap

This reconciled roadmap reflects the current repository and the launch architecture in [SPEC-001](./SPEC-001-Tretmax-Games-Launch-Architecture.md).

## Completed foundation

- React, TypeScript and Vite application with responsive public and admin routes.
- Supabase Auth session restore, sign-in, registration and sign-out.
- Server-issued Owner role gating for the admin dashboard and owner-only publishing action.
- Active games, tournament drafts, published tournament reads and the existing publish RPC client.
- Profile and manually entered game IDs using existing tables and policies.
- Payment-ready integer UGX fields with paid registration and publishing disabled.

## Current phase

- Public free-entry registration calls the reviewed/deployed `register_for_tournament` RPC; a signed-in end-to-end success test is still outstanding.
- Public sharing, player guidance and responsive polish are implemented in the frontend.
- Team/check-in contracts and honest unavailable states are now prepared without adding client persistence.

## Next backend-gated phases

1. Run signed-in registration duplicate/full/deadline tests against the deployed RPC.
2. Review and deploy team tables/RPCs, roster locking and team registration.
3. Deploy reviewed check-in, attendance and no-show operations.
4. Add reviewed bracket, match-result and dispute RPCs.
5. Add verified completion, winners, rankings and notifications.
6. Complete production security, observability and device testing.

No migration, RLS policy or payment flow is changed by this roadmap update.
