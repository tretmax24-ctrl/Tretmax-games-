# Migration and security review queue

No migration is created or applied by the current frontend phase.

## Required schema/policy review

1. Add or reconcile an Owner-only draft edit RPC and its restricted EXECUTE grant.
2. Add atomic registration capacity and eligibility RPCs. Confirm team tables/roster constraints before adding duplicate structures.
3. Add check-in, bracket, result, evidence, dispute and completion tables/RPCs only where the live schema lacks them.
4. Add standings/history/notification/audit structures after the event lifecycle contract is approved.
5. Confirm Supabase Storage buckets and policies for public banners, user avatars and private evidence.
6. Preserve the existing publishing RPC and paid-publish rejection.

Any `SECURITY DEFINER` function must set `search_path = ''`, fully qualify objects, validate `auth.uid()` and role, restrict execution, and have negative tests. No service-role key belongs in frontend code.
