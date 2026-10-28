-- Opaque one-use team invitation codes. No public directory and no Auth UUID lookup.
-- High-entropy codes are returned only at issue time, stored only as SHA-256 hashes.
-- Every mutation executes under a verified signed-in identity and locks its team.
CREATE TABLE public.team_invite_codes (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  issued_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  code_hash bytea NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','redeemed','revoked','expired')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  redeemed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  CONSTRAINT team_invite_codes_lifecycle CHECK (
    (status='active' AND redeemed_at IS NULL AND revoked_at IS NULL AND redeemed_by IS NULL)
    OR (status='redeemed' AND redeemed_at IS NOT NULL AND redeemed_by IS NOT NULL AND revoked_at IS NULL)
    OR (status='revoked' AND revoked_at IS NOT NULL AND redeemed_at IS NULL AND redeemed_by IS NULL)
    OR (status='expired' AND redeemed_at IS NULL AND revoked_at IS NULL AND redeemed_by IS NULL)
  ),
  CONSTRAINT team_invite_codes_expiry CHECK (expires_at > created_at)
);
CREATE UNIQUE INDEX team_invite_one_active_code_per_team
  ON public.team_invite_codes(team_id) WHERE status='active';
CREATE INDEX team_invite_codes_team_created_idx
  ON public.team_invite_codes(team_id,created_at DESC);
ALTER TABLE public.team_invite_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_invite_codes FROM PUBLIC,anon,authenticated;
-- No SELECT policies or grants: the code hashes, redemption and audit metadata
-- never become queryable through the Data API.

CREATE FUNCTION public.create_team_invite_code(
  p_team_id uuid,
  p_expires_in_minutes integer DEFAULT 1440
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_uid uuid:=auth.uid();
 v_jwt jsonb:=auth.jwt();
 v_team public.teams%ROWTYPE;
 v_now timestamptz;
 v_token text;
 v_code_id uuid;
 v_expires_at timestamptz;
 v_members integer;
 v_pending integer;
 v_active integer;
BEGIN
 IF v_uid IS NULL OR v_jwt->>'role' IS DISTINCT FROM 'authenticated'
    OR v_jwt->>'sub' IS DISTINCT FROM v_uid::text
    OR NOT EXISTS (
      SELECT 1 FROM auth.users u WHERE u.id=v_uid
      AND u.deleted_at IS NULL AND u.is_anonymous=false
    )
 THEN
   RETURN pg_catalog.jsonb_build_object('ok',false,'code','UNAUTHENTICATED',
     'message','Sign in to create an invitation.');
 END IF;

 SELECT * INTO v_team FROM public.teams WHERE id=p_team_id FOR UPDATE;
 IF NOT FOUND OR v_team.captain_id<>v_uid THEN
   RETURN pg_catalog.jsonb_build_object('ok',false,'code','FORBIDDEN',
     'message','Only the current captain may create invitation codes.');
 END IF;
 IF v_team.roster_state<>'forming' THEN
   RETURN pg_catalog.jsonb_build_object('ok',false,'code','ROSTER_LOCKED',
     'message','Locked rosters cannot create invitations.');
 END IF;
 IF p_expires_in_minutes IS NULL OR p_expires_in_minutes NOT BETWEEN 10 AND 10080 THEN
   RETURN pg_catalog.jsonb_build_object('ok',false,'code','INVALID_EXPIRY',
     'message','Choose an expiry between 10 minutes and 7 days.');
 END IF;

 v_now:=pg_catalog.clock_timestamp();
 -- Retire old expired codes before testing the partial unique constraint.
 UPDATE public.team_invite_codes
 SET status='expired'
 WHERE team_id=p_team_id AND status='active' AND expires_at<=v_now;

 SELECT count(*) INTO v_active FROM public.team_invite_codes
 WHERE team_id=p_team_id AND status='active';
 IF v_active>0 THEN
   RETURN pg_catalog.jsonb_build_object('ok',false,'code','ACTIVE_INVITE_EXISTS',
     'message','Revoke your existing invitation code before creating another.');
 END IF;

 SELECT count(*) INTO v_members FROM public.team_members WHERE team_id=p_team_id;
 SELECT count(*) INTO v_pending FROM public.team_invitations
   WHERE team_id=p_team_id AND status='pending';
 IF v_members+v_pending>=v_team.max_members THEN
   RETURN pg_catalog.jsonb_build_object('ok',false,'code','ROSTER_FULL',
     'message','No invitation capacity remains.');
 END IF;
 IF (SELECT count(*) FROM public.team_invite_codes
     WHERE team_id=p_team_id AND created_at>v_now-interval '1 hour')>=10 THEN
   RETURN pg_catalog.jsonb_build_object('ok',false,'code','INVITE_RATE_LIMITED',
     'message','Too many codes were generated recently. Try later.');
 END IF;

 v_token:='tm_' || pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
 v_expires_at:=v_now+pg_catalog.make_interval(mins=>p_expires_in_minutes);
 INSERT INTO public.team_invite_codes
   (team_id,issued_by,code_hash,created_at,expires_at)
 VALUES (p_team_id,v_uid,extensions.digest(v_token,'sha256'),v_now,v_expires_at)
 RETURNING id INTO v_code_id;

 INSERT INTO public.team_audit_events(team_id,actor_user_id,action,details)
 VALUES (p_team_id,v_uid,'team.invite_code_issued',
   pg_catalog.jsonb_build_object('invite_code_id',v_code_id,'expires_at',v_expires_at));

 -- Return plaintext only once. Never persist it or include it in audit records.
 RETURN pg_catalog.jsonb_build_object('ok',true,'code','INVITE_CREATED',
   'message','Private one-use invitation code created.',
   'team_id',p_team_id,'invite_code',v_token,'expires_at',v_expires_at);
END;
$function$;

CREATE FUNCTION public.revoke_team_invite_code(p_team_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_uid uuid:=auth.uid();v_jwt jsonb:=auth.jwt();
 v_team public.teams%ROWTYPE;
 v_code_id uuid;
BEGIN
 IF v_uid IS NULL OR v_jwt->>'role' IS DISTINCT FROM 'authenticated'
 OR v_jwt->>'sub' IS DISTINCT FROM v_uid::text
 OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id=v_uid AND is_anonymous=false AND deleted_at IS NULL)
 THEN RETURN pg_catalog.jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','Sign in to revoke invitations.'); END IF;
 SELECT * INTO v_team FROM public.teams WHERE id=p_team_id FOR UPDATE;
 IF NOT FOUND OR v_team.captain_id<>v_uid THEN
 RETURN pg_catalog.jsonb_build_object('ok',false,'code','FORBIDDEN','message','Only the team captain can revoke codes.');END IF;
 SELECT id INTO v_code_id FROM public.team_invite_codes
 WHERE team_id=p_team_id AND status='active' FOR UPDATE;
 IF NOT FOUND THEN
 RETURN pg_catalog.jsonb_build_object('ok',false,'code','NO_ACTIVE_INVITE','message','No active invitation code exists.');END IF;
 UPDATE public.team_invite_codes SET status='revoked',revoked_at=pg_catalog.clock_timestamp()
 WHERE id=v_code_id AND status='active';
 INSERT INTO public.team_audit_events(team_id,actor_user_id,action,details)
 VALUES(p_team_id,v_uid,'team.invite_code_revoked',
  pg_catalog.jsonb_build_object('invite_code_id',v_code_id));
 RETURN pg_catalog.jsonb_build_object('ok',true,'code','INVITE_REVOKED','message','Invitation code revoked.','team_id',p_team_id);
END;
$function$;

CREATE FUNCTION public.preview_team_invite_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_uid uuid:=auth.uid();v_jwt jsonb:=auth.jwt();
 v_inv public.team_invite_codes%ROWTYPE;v_team public.teams%ROWTYPE;
 v_game_name text;
BEGIN
 IF v_uid IS NULL OR v_jwt->>'role' IS DISTINCT FROM 'authenticated'
 OR v_jwt->>'sub' IS DISTINCT FROM v_uid::text
 OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id=v_uid AND is_anonymous=false AND deleted_at IS NULL)
 THEN RETURN pg_catalog.jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','Sign in to preview an invitation.'); END IF;
 IF p_code IS NULL OR p_code !~ '^tm_[0-9a-f]{64}$' THEN
 RETURN pg_catalog.jsonb_build_object('ok',false,'code','INVITE_UNAVAILABLE','message','Invitation code is invalid or unavailable.'); END IF;
 SELECT * INTO v_inv FROM public.team_invite_codes
 WHERE code_hash=extensions.digest(p_code,'sha256');
 IF NOT FOUND OR v_inv.status<>'active' OR v_inv.expires_at<=pg_catalog.clock_timestamp() THEN
 RETURN pg_catalog.jsonb_build_object('ok',false,'code','INVITE_UNAVAILABLE','message','Invitation code is invalid or unavailable.'); END IF;
 SELECT * INTO v_team FROM public.teams WHERE id=v_inv.team_id;
 IF NOT FOUND OR v_team.roster_state<>'forming' OR v_team.captain_id<>v_inv.issued_by THEN
 RETURN pg_catalog.jsonb_build_object('ok',false,'code','INVITE_UNAVAILABLE','message','Invitation code is invalid or unavailable.'); END IF;
 SELECT name INTO v_game_name FROM public.games WHERE id=v_team.game_id;
 RETURN pg_catalog.jsonb_build_object('ok',true,'code','INVITE_PREVIEW',
 'message','Review the team invitation before joining.',
 'team_id',v_team.id,'team_name',v_team.name,'game_name',v_game_name,'expires_at',v_inv.expires_at);
END;
$function$;

CREATE FUNCTION public.redeem_team_invite_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_uid uuid:=auth.uid();v_jwt jsonb:=auth.jwt();
 v_code_team_id uuid;
 v_team public.teams%ROWTYPE;
 v_inv public.team_invite_codes%ROWTYPE;
 v_account_id uuid;
 v_member_count integer;
 v_now timestamptz;
BEGIN
 IF v_uid IS NULL OR v_jwt->>'role' IS DISTINCT FROM 'authenticated'
 OR v_jwt->>'sub' IS DISTINCT FROM v_uid::text
 OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id=v_uid AND is_anonymous=false AND deleted_at IS NULL)
 THEN RETURN pg_catalog.jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','Sign in to join a team.'); END IF;
 IF p_code IS NULL OR p_code !~ '^tm_[0-9a-f]{64}$' THEN
 RETURN pg_catalog.jsonb_build_object('ok',false,'code','INVITE_UNAVAILABLE','message','Invitation code is invalid or unavailable.'); END IF;
 -- First lookup does not lock the code. Resolve the team and then always lock
 -- team before code, matching captain/roster locks and preventing deadlocks.
 SELECT team_id INTO v_code_team_id FROM public.team_invite_codes
 WHERE code_hash=extensions.digest(p_code,'sha256');
 IF v_code_team_id IS NULL THEN
 RETURN pg_catalog.jsonb_build_object('ok',false,'code','INVITE_UNAVAILABLE','message','Invitation code is invalid or unavailable.'); END IF;
 SELECT * INTO v_team FROM public.teams WHERE id=v_code_team_id FOR UPDATE;
 IF NOT FOUND THEN
 RETURN pg_catalog.jsonb_build_object('ok',false,'code','INVITE_UNAVAILABLE','message','Invitation code is invalid or unavailable.'); END IF;
 SELECT * INTO v_inv FROM public.team_invite_codes
 WHERE code_hash=extensions.digest(p_code,'sha256') AND team_id=v_team.id FOR UPDATE;
 v_now:=pg_catalog.clock_timestamp();
 IF NOT FOUND OR v_inv.status<>'active' OR v_inv.expires_at<=v_now
 OR v_team.roster_state<>'forming' OR v_team.captain_id<>v_inv.issued_by THEN
 RETURN pg_catalog.jsonb_build_object('ok',false,'code','INVITE_UNAVAILABLE','message','Invitation code is invalid or unavailable.'); END IF;
 IF EXISTS(SELECT 1 FROM public.team_members WHERE team_id=v_team.id AND user_id=v_uid) THEN
 RETURN pg_catalog.jsonb_build_object('ok',false,'code','ALREADY_MEMBER','message','You already belong to this team.'); END IF;
 SELECT count(*) INTO v_member_count FROM public.team_members WHERE team_id=v_team.id;
 IF v_member_count>=v_team.max_members THEN
 RETURN pg_catalog.jsonb_build_object('ok',false,'code','ROSTER_FULL','message','Team roster is full.'); END IF;
 SELECT a.id INTO v_account_id FROM public.player_game_accounts a
 WHERE a.user_id=v_uid AND a.game_id=v_team.game_id
   AND a.verification_status<>'rejected'
 ORDER BY a.created_at,a.id LIMIT 1;
 IF v_account_id IS NULL THEN
 RETURN pg_catalog.jsonb_build_object('ok',false,'code','GAME_ACCOUNT_REQUIRED','message','Link an eligible account for this team game before joining.'); END IF;
 INSERT INTO public.team_members(team_id,user_id,game_account_id,member_role)
 VALUES(v_team.id,v_uid,v_account_id,'member');
 UPDATE public.team_invite_codes SET status='redeemed',redeemed_at=v_now,redeemed_by=v_uid
 WHERE id=v_inv.id AND status='active';
 -- If a targeted invitation existed for this player, consume it too.
 UPDATE public.team_invitations SET status='accepted',responded_at=v_now
 WHERE team_id=v_team.id AND invitee_id=v_uid AND status='pending';
 INSERT INTO public.team_audit_events(team_id,actor_user_id,action,details)
 VALUES(v_team.id,v_uid,'team.invite_code_redeemed',
  pg_catalog.jsonb_build_object('invite_code_id',v_inv.id));
 RETURN pg_catalog.jsonb_build_object('ok',true,'code','JOINED','message','You joined the team.',
 'team_id',v_team.id,'game_account_id',v_account_id,'member_count',v_member_count+1);
END;
$function$;

-- New functions must not receive PostgreSQL's default PUBLIC EXECUTE.
REVOKE ALL ON FUNCTION public.create_team_invite_code(uuid,integer),
 public.revoke_team_invite_code(uuid),
 public.preview_team_invite_code(text),
 public.redeem_team_invite_code(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_team_invite_code(uuid,integer),
 public.revoke_team_invite_code(uuid),
 public.preview_team_invite_code(text),
 public.redeem_team_invite_code(text)
 TO authenticated;
