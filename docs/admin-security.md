# Admin authorization and first Owner provisioning

## Current state and root cause

The public application uses Supabase Auth for identity. Admin access now reads only the server-issued `app_metadata.tretmax_role` claim (`owner`, `tournament_manager`, `match_referee`, or `finance_officer`). The browser never reads `user_metadata`, stores a role, or provides a role switcher. Admin routes, navigation, and tournament creation are hidden or blocked when the session has no recognized role.

The current database migration does **not** define a staff-membership table, role column, authorization helper, or audit log. Its existing tournament INSERT policy allows any authenticated user to insert a row when `created_by = auth.uid()` and `status = 'draft'`. Therefore the frontend gate is defense in depth only: the database currently remains the authoritative blocker that must be tightened before this authorization can be called secure.

## Smallest trusted provisioning path

1. Create or invite the permanent Owner through Supabase Auth.
2. From the Supabase Dashboard's server-side/admin workflow, or a protected Edge Function/operator script, set `app_metadata.tretmax_role` to `owner` with the Supabase Admin API. Never set it from browser code, public signup, `user_metadata`, or a `VITE_*` variable. A service-role key, if used for this operation, must stay in the protected server environment.
3. Set `tournament_manager` only for explicitly approved organizers. Do not expose a public role-assignment endpoint.
4. Sign the Owner out and back in (or otherwise refresh the access token) after changing metadata so the JWT contains the current claim.
5. Record the provisioning action and keep a recovery path for the last active Owner.

No account was provisioned by this frontend change.

## Reviewed RLS change required before launch

Do not paste this into the browser or run it as part of this task. It is a review proposal for a future migration or controlled SQL review. The current draft INSERT policy should be replaced with a policy that checks the trusted JWT claim:

```sql
drop policy if exists "Authenticated users can create their own draft tournaments" on public.tournaments;

create policy "Approved organizers can create their own draft tournaments"
on public.tournaments for insert to authenticated
with check (
  (select auth.uid()) = created_by
  and status = 'draft'
  and coalesce((select auth.jwt()->'app_metadata'->>'tretmax_role'), '')
      in ('owner', 'tournament_manager')
);
```

Publishing and updates need a separate reviewed policy. Decide whether an Owner may manage every tournament or only records they created, then enforce that decision in `using` and `with check` clauses. The same authorization must be enforced by trusted server functions for operations that need validation, idempotency, or audit records. Do not rely on hidden buttons or route guards.

For promptly revocable staff membership, the stronger long-term design is a private `staff_memberships` table with constrained roles, active status, actor/timestamps, helper functions, and an immutable audit table. That requires a separately reviewed migration and policies; none are created or applied here.

## Frontend enforcement points

- `adminRoleFromUser` accepts only a recognized value in server-issued `app_metadata`.
- `AdminLayout` requires a Supabase session and recognized role, then filters navigation by centralized permissions.
- `AdminPermissionGate` blocks pages and actions without the required permission.
- The Create Tournament action is disabled unless the role has `tournaments.manage`.
- The repository repeats the role check before attempting an insert and surfaces the actual Supabase error. This is not a replacement for RLS.
- Draft reads remain scoped to the signed-in user's `created_by` and `status = 'draft'`.

## Security status

Authorization is **not verified secure yet** because the live INSERT policy still permits any authenticated user to create a draft and no staff source has been provisioned. Before launch, apply and review the RLS/function design, provision the Owner through a trusted server-side operation, test allowed and denied users against the live database, and add audit coverage for role changes and tournament mutations.
