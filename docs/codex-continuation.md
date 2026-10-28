# Codex continuation handoff

Continue from the existing application; do not rebuild the public site or admin dashboard. Preserve migrations, RLS, the publish RPC, Auth and Owner permissions.

## Safe next work

- Verify the deployed `register_for_tournament` RPC with signed-in test accounts.
- Add reviewed team/check-in/match-result contracts as separate migrations after security approval.
- Keep launch readiness accurate in [launch-readiness.md](./launch-readiness.md).

## Current frontend notes

Public tournament detail pages support free solo registration when the RPC is available, manual game IDs, explicit paid-entry blocking, registration/check-in window display, native/WhatsApp public sharing and FAQ guidance. Public pages never share drafts or player details.

Do not use localStorage as authentication, add direct client updates that bypass RLS, expose service-role keys, or fabricate slot counts, match results, payments or payouts.
