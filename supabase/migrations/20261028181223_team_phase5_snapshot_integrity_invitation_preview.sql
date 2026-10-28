-- Phase 5: attendance snapshot referential integrity and safe invitation previews.
-- No public write privilege changes. Invitation preview is limited to the
-- authenticated invitee of a currently pending invitation.
ALTER TABLE public.tournament_entries
 ADD CONSTRAINT tournament_entries_id_tournament_unique UNIQUE(id,tournament_id);
ALTER TABLE public.tournament_entry_participants
 ADD CONSTRAINT participant_entry_tournament_consistent
 FOREIGN KEY (entry_id,tournament_id)
 REFERENCES public.tournament_entries(id,tournament_id)
 ON DELETE CASCADE;

CREATE POLICY "Pending invited players can preview team details"
 ON public.teams FOR SELECT TO authenticated
 USING (
  EXISTS (
   SELECT 1 FROM public.team_invitations i
   WHERE i.team_id=teams.id
     AND i.invitee_id=(SELECT auth.uid())
     AND i.status='pending'
  )
 );
