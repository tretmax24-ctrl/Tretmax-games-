-- Phase 4: close team usability gaps without broadening direct write rights.
-- Team participants can read the one tournament_entries row they occupy.
-- Captain transfers are explicit and audited, never allowed after roster lock.
-- Paid events are also rejected at individual check-in.

CREATE POLICY "Team participants can read their tournament entry"
 ON public.tournament_entries
 FOR SELECT TO authenticated
 USING (
   team_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM public.tournament_entry_participants p
     WHERE p.entry_id=tournament_entries.id
       AND p.user_id=(SELECT auth.uid())
   )
 );

CREATE FUNCTION public.transfer_team_captain(p_team_id uuid,p_new_captain_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_uid uuid:=auth.uid();v_jwt jsonb:=auth.jwt();v_t public.teams%ROWTYPE;
BEGIN
 IF v_uid IS NULL OR v_jwt->>'role' IS DISTINCT FROM 'authenticated'
 OR v_jwt->>'sub' IS DISTINCT FROM v_uid::text
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_uid AND is_anonymous=false AND deleted_at IS NULL)
 THEN RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','Sign in to transfer captaincy.');END IF;
 SELECT * INTO v_t FROM public.teams WHERE id=p_team_id FOR UPDATE;
 IF NOT FOUND OR v_t.captain_id<>v_uid THEN
 RETURN jsonb_build_object('ok',false,'code','FORBIDDEN','message','Only the current captain can transfer captaincy.');END IF;
 IF v_t.roster_state<>'forming' THEN
 RETURN jsonb_build_object('ok',false,'code','ROSTER_LOCKED','message','Locked rosters cannot transfer captaincy.');END IF;
 IF p_new_captain_id IS NULL OR p_new_captain_id=v_uid OR NOT EXISTS(
  SELECT 1 FROM public.team_members WHERE team_id=p_team_id AND user_id=p_new_captain_id AND member_role='member')
 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_NEW_CAPTAIN','message','Choose a different existing team member.');END IF;
 UPDATE public.team_members SET member_role='member' WHERE team_id=p_team_id AND user_id=v_uid AND member_role='captain';
 UPDATE public.team_members SET member_role='captain' WHERE team_id=p_team_id AND user_id=p_new_captain_id;
 UPDATE public.teams SET captain_id=p_new_captain_id WHERE id=p_team_id;
 INSERT INTO public.team_audit_events(team_id,actor_user_id,action,details)
 VALUES(p_team_id,v_uid,'team.captain_transferred',jsonb_build_object('new_captain_id',p_new_captain_id));
 RETURN jsonb_build_object('ok',true,'code','CAPTAIN_TRANSFERRED','message','Captaincy transferred.','team_id',p_team_id,'captain_id',p_new_captain_id);
END $fn$;
REVOKE ALL ON FUNCTION public.transfer_team_captain(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_team_captain(uuid,uuid) TO authenticated;

DO $patch$
DECLARE v_definition text:=pg_catalog.pg_get_functiondef(
 'public.check_in_tournament(uuid,uuid)'::regprocedure);
 v_needle text:=' IF v_t.status<>''check_in'' THEN';
 v_patch text:=
 ' IF v_t.entry_fee_minor<>0 THEN RETURN jsonb_build_object('||
  '''ok'',false,''code'',''PAID_EVENT_UNSUPPORTED'','||
  '''message'',''Paid event check-in is not enabled.'');END IF;'||
  E'\n' || v_needle;
BEGIN
 IF pg_catalog.strpos(v_definition,v_needle)=0 THEN
  RAISE EXCEPTION 'Expected check-in state guard not found; no patch applied';
 END IF;
 EXECUTE pg_catalog.replace(v_definition,v_needle,v_patch);
END $patch$;
REVOKE ALL ON FUNCTION public.check_in_tournament(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_tournament(uuid,uuid) TO authenticated;
