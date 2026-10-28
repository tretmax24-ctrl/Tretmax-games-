-- Tretmax Games: restrict draft tournament creation to trusted platform staff.
-- This migration changes only the existing tournament INSERT RLS policy.
-- Roles are assigned administratively in auth.users.raw_app_meta_data,
-- NEVER from user_metadata or public signup/profile writes.

ALTER POLICY "Authenticated users can create their own draft tournaments"
ON public.tournaments
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = created_by
  AND status = 'draft'
  AND (
    (SELECT auth.jwt()) -> 'app_metadata' ->> 'tretmax_role'
  ) IN ('owner', 'tournament_manager')
);
