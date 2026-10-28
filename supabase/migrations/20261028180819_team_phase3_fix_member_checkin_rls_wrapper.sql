-- Runtime correction: team members do not own their team's tournament_entries
-- row. Resolve the entry with a restricted SECURITY DEFINER wrapper rather
-- than broadening private tournament_entries SELECT RLS.
CREATE OR REPLACE FUNCTION public.record_team_member_check_in(p_entry_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_uid uuid:=auth.uid();v_jwt jsonb:=auth.jwt();v_tournament uuid;
BEGIN
 IF v_uid IS NULL OR v_jwt->>'role' IS DISTINCT FROM 'authenticated'
 OR v_jwt->>'sub' IS DISTINCT FROM v_uid::text
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_uid AND is_anonymous=false AND deleted_at IS NULL)
 THEN RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','Sign in to check in.');END IF;
 SELECT p.tournament_id INTO v_tournament
 FROM public.tournament_entry_participants p
 JOIN public.tournament_entries e ON e.id=p.entry_id
 WHERE p.entry_id=p_entry_id AND p.user_id=v_uid AND e.team_id IS NOT NULL;
 IF v_tournament IS NULL THEN
  RETURN jsonb_build_object('ok',false,'code','ENTRY_NOT_FOUND','message','Team registration unavailable.');
 END IF;
 RETURN public.check_in_tournament(v_tournament,p_entry_id);
END $fn$;
REVOKE ALL ON FUNCTION public.record_team_member_check_in(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_team_member_check_in(uuid) TO authenticated;
