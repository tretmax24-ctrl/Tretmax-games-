-- Phase 1: private team rosters, invitations, and auditable captain controls.
-- All writes use narrowly-scoped RPCs; no direct browser DML is granted.
CREATE TABLE public.teams (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE RESTRICT,
 name text NOT NULL,
 captain_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 roster_state text NOT NULL DEFAULT 'forming' CHECK (roster_state IN ('forming','locked')),
 max_members integer NOT NULL DEFAULT 4 CHECK (max_members BETWEEN 2 AND 4),
 created_at timestamptz NOT NULL DEFAULT now(),
 locked_at timestamptz,
 CONSTRAINT teams_name_nonblank CHECK (char_length(btrim(name)) BETWEEN 3 AND 50),
 CONSTRAINT teams_lock_state_consistent CHECK (
 (roster_state='forming' AND locked_at IS NULL) OR
 (roster_state='locked' AND locked_at IS NOT NULL))
);
CREATE TABLE public.team_members (
 team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 game_account_id uuid NOT NULL REFERENCES public.player_game_accounts(id) ON DELETE RESTRICT,
 member_role text NOT NULL CHECK (member_role IN ('captain','member')),
 joined_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(team_id,user_id)
);
CREATE UNIQUE INDEX team_members_one_captain_per_team
 ON public.team_members(team_id) WHERE member_role='captain';
CREATE TABLE public.team_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
 invitee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 responded_at timestamptz,
 UNIQUE(team_id,invitee_id)
);
CREATE TABLE public.team_audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
 tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL,
 entry_id uuid REFERENCES public.tournament_entries(id) ON DELETE SET NULL,
 actor_user_id uuid,
 action text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 happened_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teams,public.team_members,public.team_invitations,public.team_audit_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.teams,public.team_members,public.team_invitations TO authenticated;
CREATE POLICY "Participants can see their teams" ON public.teams FOR SELECT TO authenticated
 USING (captain_id=(SELECT auth.uid()) OR EXISTS (
 SELECT 1 FROM public.team_members m WHERE m.team_id=id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY "Members can read own membership" ON public.team_members FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()));
CREATE POLICY "Players can read their invitations" ON public.team_invitations FOR SELECT TO authenticated
 USING (invitee_id=(SELECT auth.uid()));
-- No audit read policies or client write grants.

CREATE FUNCTION public.create_team(p_game_id uuid,p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_uid uuid:=auth.uid(); v_jwt jsonb:=auth.jwt();v_game_account uuid;v_team uuid;v_name text:=btrim(coalesce(p_name,''));
BEGIN
 IF v_uid IS NULL OR v_jwt->>'role' IS DISTINCT FROM 'authenticated'
 OR v_jwt->>'sub' IS DISTINCT FROM v_uid::text
 OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id=v_uid AND is_anonymous=false AND deleted_at IS NULL)
 THEN RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','Sign in to create a team.');END IF;
 IF char_length(v_name) NOT BETWEEN 3 AND 50 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_NAME','message','Team name must contain 3 to 50 characters.');END IF;
 IF NOT EXISTS (SELECT 1 FROM public.games WHERE id=p_game_id AND is_active) THEN
 RETURN jsonb_build_object('ok',false,'code','INVALID_GAME','message','Choose an active game.');END IF;
 SELECT a.id INTO v_game_account FROM public.player_game_accounts a
 WHERE a.user_id=v_uid AND a.game_id=p_game_id AND a.verification_status<>'rejected'
 ORDER BY a.created_at,a.id LIMIT 1;
 IF v_game_account IS NULL THEN RETURN jsonb_build_object('ok',false,'code','GAME_ACCOUNT_REQUIRED','message','Link an account for this game before creating a team.'); END IF;
 INSERT INTO public.teams(game_id,name,captain_id) VALUES(p_game_id,v_name,v_uid) RETURNING id INTO v_team;
 INSERT INTO public.team_members(team_id,user_id,game_account_id,member_role) VALUES(v_team,v_uid,v_game_account,'captain');
 INSERT INTO public.team_audit_events(team_id,actor_user_id,action) VALUES(v_team,v_uid,'team.created');
 RETURN jsonb_build_object('ok',true,'code','TEAM_CREATED','message','Team created; invite your teammates.','team_id',v_team,'captain_id',v_uid,'max_members',4,'member_count',1,'roster_state','forming');
END $fn$;

CREATE FUNCTION public.invite_team_member(p_team_id uuid,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_uid uuid:=auth.uid();v_jwt jsonb:=auth.jwt();v_team public.teams%ROWTYPE;v_invitation uuid;v_count integer;v_pending integer;v_status text;
BEGIN
 IF v_uid IS NULL OR v_jwt->>'role' IS DISTINCT FROM 'authenticated' OR v_jwt->>'sub' IS DISTINCT FROM v_uid::text
 OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id=v_uid AND is_anonymous=false AND deleted_at IS NULL)
 THEN RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','Sign in to manage invitations.');END IF;
 SELECT * INTO v_team FROM public.teams WHERE id=p_team_id FOR UPDATE;
 IF NOT FOUND OR v_team.captain_id<>v_uid THEN RETURN jsonb_build_object('ok',false,'code','FORBIDDEN','message','Only the team captain can invite players.');END IF;
 IF v_team.roster_state<>'forming' THEN RETURN jsonb_build_object('ok',false,'code','ROSTER_LOCKED','message','Locked rosters cannot accept invitations.');END IF;
 IF p_user_id IS NULL OR p_user_id=v_uid OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id AND is_anonymous=false AND deleted_at IS NULL)
 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_INVITEE','message','Select another registered player.');END IF;
 IF NOT EXISTS(SELECT 1 FROM public.player_game_accounts WHERE user_id=p_user_id AND game_id=v_team.game_id AND verification_status<>'rejected')
 THEN RETURN jsonb_build_object('ok',false,'code','INVITEE_GAME_ACCOUNT_REQUIRED','message','This player has no eligible account for the team game.');END IF;
 IF EXISTS(SELECT 1 FROM public.team_members WHERE team_id=p_team_id AND user_id=p_user_id)
 THEN RETURN jsonb_build_object('ok',false,'code','ALREADY_MEMBER','message','Player is already a member.');END IF;
 SELECT i.id,i.status INTO v_invitation,v_status FROM public.team_invitations i WHERE i.team_id=p_team_id AND i.invitee_id=p_user_id FOR UPDATE;
 IF v_status='pending' THEN RETURN jsonb_build_object('ok',false,'code','ALREADY_INVITED','message','Invitation is already pending.');END IF;
 SELECT count(*) INTO v_count FROM public.team_members WHERE team_id=p_team_id;
 SELECT count(*) INTO v_pending FROM public.team_invitations WHERE team_id=p_team_id AND status='pending';
 IF v_count+v_pending>=v_team.max_members THEN RETURN jsonb_build_object('ok',false,'code','ROSTER_FULL','message','No invitation slots remain.');END IF;
 IF v_invitation IS NULL THEN
  INSERT INTO public.team_invitations(team_id,invitee_id,invited_by) VALUES(p_team_id,p_user_id,v_uid) RETURNING id INTO v_invitation;
 ELSE
  UPDATE public.team_invitations SET status='pending',created_at=now(),responded_at=NULL,invited_by=v_uid WHERE id=v_invitation;
 END IF;
 INSERT INTO public.team_audit_events(team_id,actor_user_id,action,details)
 VALUES(p_team_id,v_uid,'team.invited',jsonb_build_object('invitee_id',p_user_id));
 RETURN jsonb_build_object('ok',true,'code','INVITED','message','Invitation sent.','invitation_id',v_invitation,'team_id',p_team_id);
END $fn$;

CREATE FUNCTION public.respond_to_team_invitation(p_invitation_id uuid,p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_uid uuid:=auth.uid();v_jwt jsonb:=auth.jwt();v_team public.teams%ROWTYPE;v_inv public.team_invitations%ROWTYPE;v_account uuid;v_count integer;
BEGIN
 IF v_uid IS NULL OR v_jwt->>'role' IS DISTINCT FROM 'authenticated' OR v_jwt->>'sub' IS DISTINCT FROM v_uid::text
 OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id=v_uid AND is_anonymous=false AND deleted_at IS NULL)
 THEN RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','Sign in to respond to invitations.');END IF;
 -- Always take team lock first (consistent with captain invitation and roster changes).
 SELECT i.* INTO v_inv FROM public.team_invitations i WHERE i.id=p_invitation_id AND i.invitee_id=v_uid;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','INVITATION_NOT_FOUND','message','Invitation unavailable.');END IF;
 SELECT * INTO v_team FROM public.teams WHERE id=v_inv.team_id FOR UPDATE;
 SELECT * INTO v_inv FROM public.team_invitations WHERE id=p_invitation_id AND invitee_id=v_uid FOR UPDATE;
 IF v_inv.status<>'pending' THEN RETURN jsonb_build_object('ok',false,'code','INVITATION_HANDLED','message','This invitation has already been handled.');END IF;
 IF v_team.roster_state<>'forming' THEN RETURN jsonb_build_object('ok',false,'code','ROSTER_LOCKED','message','The team roster has been locked.');END IF;
 IF p_accept IS DISTINCT FROM true THEN
 UPDATE public.team_invitations SET status='declined',responded_at=now() WHERE id=v_inv.id;
 INSERT INTO public.team_audit_events(team_id,actor_user_id,action) VALUES(v_team.id,v_uid,'team.invitation_declined');
 RETURN jsonb_build_object('ok',true,'code','DECLINED','message','Invitation declined.','team_id',v_team.id);END IF;
 SELECT count(*) INTO v_count FROM public.team_members WHERE team_id=v_team.id;
 IF v_count>=v_team.max_members THEN RETURN jsonb_build_object('ok',false,'code','ROSTER_FULL','message','Team roster is full.');END IF;
 SELECT id INTO v_account FROM public.player_game_accounts
 WHERE user_id=v_uid AND game_id=v_team.game_id AND verification_status<>'rejected'
 ORDER BY created_at,id LIMIT 1;
 IF v_account IS NULL THEN RETURN jsonb_build_object('ok',false,'code','GAME_ACCOUNT_REQUIRED','message','Link a game account before accepting.');END IF;
 IF EXISTS(SELECT 1 FROM public.team_members WHERE team_id=v_team.id AND user_id=v_uid)
 THEN RETURN jsonb_build_object('ok',false,'code','ALREADY_MEMBER','message','You are already in the team.');END IF;
 INSERT INTO public.team_members(team_id,user_id,game_account_id,member_role) VALUES(v_team.id,v_uid,v_account,'member');
 UPDATE public.team_invitations SET status='accepted',responded_at=now() WHERE id=v_inv.id;
 INSERT INTO public.team_audit_events(team_id,actor_user_id,action) VALUES(v_team.id,v_uid,'team.invitation_accepted');
 RETURN jsonb_build_object('ok',true,'code','JOINED','message','You joined the team.','team_id',v_team.id,'game_account_id',v_account,'member_count',v_count+1);
END $fn$;

CREATE FUNCTION public.leave_team(p_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_uid uuid:=auth.uid();v_jwt jsonb:=auth.jwt();v_team public.teams%ROWTYPE;
BEGIN
 IF v_uid IS NULL OR v_jwt->>'role' IS DISTINCT FROM 'authenticated' OR v_jwt->>'sub' IS DISTINCT FROM v_uid::text
 THEN RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','Sign in to leave a team.');END IF;
 SELECT * INTO v_team FROM public.teams WHERE id=p_team_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.team_members WHERE team_id=p_team_id AND user_id=v_uid)
 THEN RETURN jsonb_build_object('ok',false,'code','NOT_MEMBER','message','You are not a team member.');END IF;
 IF v_team.captain_id=v_uid THEN RETURN jsonb_build_object('ok',false,'code','CAPTAIN_CANNOT_LEAVE','message','Captain transfer is required before leaving.');END IF;
 IF v_team.roster_state<>'forming' THEN RETURN jsonb_build_object('ok',false,'code','ROSTER_LOCKED','message','Locked rosters cannot be changed.');END IF;
 DELETE FROM public.team_members WHERE team_id=p_team_id AND user_id=v_uid;
 UPDATE public.team_invitations SET status='declined',responded_at=now() WHERE team_id=p_team_id AND invitee_id=v_uid AND status='accepted';
 INSERT INTO public.team_audit_events(team_id,actor_user_id,action) VALUES(p_team_id,v_uid,'team.left');
 RETURN jsonb_build_object('ok',true,'code','LEFT','message','You left the team.','team_id',p_team_id);
END $fn$;

CREATE FUNCTION public.lock_team_roster(p_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_uid uuid:=auth.uid();v_jwt jsonb:=auth.jwt();v_team public.teams%ROWTYPE;v_count integer;v_valid integer;
BEGIN
 IF v_uid IS NULL OR v_jwt->>'role' IS DISTINCT FROM 'authenticated' OR v_jwt->>'sub' IS DISTINCT FROM v_uid::text
 THEN RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','Sign in to lock a roster.');END IF;
 SELECT * INTO v_team FROM public.teams WHERE id=p_team_id FOR UPDATE;
 IF NOT FOUND OR v_team.captain_id<>v_uid THEN RETURN jsonb_build_object('ok',false,'code','FORBIDDEN','message','Only the captain may lock the roster.');END IF;
 IF v_team.roster_state='locked' THEN RETURN jsonb_build_object('ok',false,'code','ALREADY_LOCKED','message','This roster is already locked.');END IF;
 SELECT count(*),count(*) FILTER (WHERE a.id IS NOT NULL AND a.user_id=m.user_id AND a.game_id=v_team.game_id AND a.verification_status<>'rejected')
 INTO v_count,v_valid
 FROM public.team_members m LEFT JOIN public.player_game_accounts a ON a.id=m.game_account_id WHERE m.team_id=p_team_id;
 IF v_count<2 OR v_count>v_team.max_members OR v_count<>v_valid THEN
 RETURN jsonb_build_object('ok',false,'code','INVALID_ROSTER','message','Roster requires 2–4 eligible linked game accounts.','member_count',v_count);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.team_members WHERE team_id=p_team_id AND user_id=v_uid AND member_role='captain')
 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_CAPTAIN','message','Captain membership is missing.');END IF;
 UPDATE public.teams SET roster_state='locked',locked_at=now() WHERE id=p_team_id;
 UPDATE public.team_invitations SET status='expired',responded_at=now() WHERE team_id=p_team_id AND status='pending';
 INSERT INTO public.team_audit_events(team_id,actor_user_id,action,details)
 VALUES(p_team_id,v_uid,'team.roster_locked',jsonb_build_object('member_count',v_count));
 RETURN jsonb_build_object('ok',true,'code','ROSTER_LOCKED','message','Team roster locked.','team_id',p_team_id,'member_count',v_count,'roster_state','locked');
END $fn$;

CREATE FUNCTION public.get_team_roster(p_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_uid uuid:=auth.uid();v_jwt jsonb:=auth.jwt();v_team public.teams%ROWTYPE;v_roster jsonb;
BEGIN
 IF v_uid IS NULL OR v_jwt->>'role' IS DISTINCT FROM 'authenticated' OR v_jwt->>'sub' IS DISTINCT FROM v_uid::text
 THEN RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','Sign in to view your team.');END IF;
 SELECT * INTO v_team FROM public.teams WHERE id=p_team_id;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.team_members WHERE team_id=p_team_id AND user_id=v_uid)
 THEN RETURN jsonb_build_object('ok',false,'code','FORBIDDEN','message','Team unavailable.');END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.member_role,'game_account_id',m.game_account_id,'game_uid',a.game_uid,'in_game_name',a.in_game_name) ORDER BY m.joined_at,m.user_id),'[]'::jsonb)
 INTO v_roster FROM public.team_members m JOIN public.player_game_accounts a ON a.id=m.game_account_id WHERE m.team_id=p_team_id;
 RETURN jsonb_build_object('ok',true,'code','ROSTER_AVAILABLE','message','Team roster available.','team_id',p_team_id,'name',v_team.name,'game_id',v_team.game_id,'roster_state',v_team.roster_state,'captain_id',v_team.captain_id,'max_members',v_team.max_members,'member_count',jsonb_array_length(v_roster),'members',v_roster);
END $fn$;

-- All RPCs explicitly limited to authenticated, never anon/public.
REVOKE ALL ON FUNCTION public.create_team(uuid,text),public.invite_team_member(uuid,uuid),public.respond_to_team_invitation(uuid,boolean),public.leave_team(uuid),public.lock_team_roster(uuid),public.get_team_roster(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_team(uuid,text),public.invite_team_member(uuid,uuid),public.respond_to_team_invitation(uuid,boolean),public.leave_team(uuid),public.lock_team_roster(uuid),public.get_team_roster(uuid) TO authenticated;
