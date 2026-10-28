-- Phase 2: team entry slots, roster snapshots and cross-solo/team uniqueness.
-- One team occupies ONE tournament_entries row and ONE capacity slot.
-- The public registration-summary RPC continues to count all entry rows unchanged.
ALTER TABLE public.tournament_entries
 ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE RESTRICT;
ALTER TABLE public.tournament_entries
 ADD CONSTRAINT tournament_entries_team_shape
 CHECK (team_id IS NULL OR game_account_id IS NULL);
CREATE UNIQUE INDEX tournament_entries_one_team_per_tournament
 ON public.tournament_entries(tournament_id,team_id) WHERE team_id IS NOT NULL;

CREATE TABLE public.tournament_entry_participants (
 entry_id uuid NOT NULL REFERENCES public.tournament_entries(id) ON DELETE CASCADE,
 tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 game_account_id uuid REFERENCES public.player_game_accounts(id) ON DELETE SET NULL,
 game_uid_snapshot text,
 attendance_status text NOT NULL DEFAULT 'pending'
 CHECK (attendance_status IN ('pending','checked_in','no_show')),
 checked_in_at timestamptz,
 PRIMARY KEY(entry_id,user_id),
 UNIQUE(tournament_id,user_id),
 CONSTRAINT participation_attendance_consistent CHECK (
  (attendance_status='checked_in' AND checked_in_at IS NOT NULL)
  OR (attendance_status<>'checked_in' AND checked_in_at IS NULL)
 )
);
ALTER TABLE public.tournament_entry_participants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tournament_entry_participants FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.tournament_entry_participants TO authenticated;
CREATE POLICY "Players can read their own event participation"
 ON public.tournament_entry_participants FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()));

-- Existing solo registration data must keep its ownership and future
-- duplicate protections. Backfill is additive and preserves existing entries.
INSERT INTO public.tournament_entry_participants
 (entry_id,tournament_id,user_id,game_account_id,game_uid_snapshot,
  attendance_status,checked_in_at)
SELECT e.id,e.tournament_id,e.user_id,e.game_account_id,a.game_uid,
 CASE WHEN e.status='checked_in' THEN 'checked_in' ELSE 'pending' END,
 CASE WHEN e.status='checked_in' THEN e.registered_at ELSE NULL END
FROM public.tournament_entries e
LEFT JOIN public.player_game_accounts a ON a.id=e.game_account_id
ON CONFLICT (entry_id,user_id) DO NOTHING;

-- Ensure the existing (unchanged-signature) solo RPC also reserves a global
-- tournament/player claim. A trusted AFTER INSERT trigger writes the claim.
CREATE FUNCTION public.reserve_solo_participant_claim()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
 IF NEW.team_id IS NULL THEN
  INSERT INTO public.tournament_entry_participants
   (entry_id,tournament_id,user_id,game_account_id,game_uid_snapshot)
  SELECT NEW.id,NEW.tournament_id,NEW.user_id,NEW.game_account_id,a.game_uid
  FROM (SELECT 1) AS singleton
  LEFT JOIN public.player_game_accounts a ON a.id=NEW.game_account_id;
 END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER tournament_entries_claim_solo_participant
 AFTER INSERT ON public.tournament_entries FOR EACH ROW
 EXECUTE FUNCTION public.reserve_solo_participant_claim();
REVOKE ALL ON FUNCTION public.reserve_solo_participant_claim() FROM PUBLIC,anon,authenticated;

-- Return structured duplicate errors if a user already occupies a team roster
-- slot. The existing solo registration RPC logic, locks and permissions remain.
DO $patch$
DECLARE
 v_definition text:=pg_catalog.pg_get_functiondef(
  'public.register_for_tournament(uuid,uuid,uuid,boolean)'::regprocedure);
 v_needle text:='  SELECT e.* INTO v_existing_entry';
 v_replacement text:=
  '  IF EXISTS (SELECT 1 FROM public.tournament_entry_participants p'||
  E'\n'||
  '    WHERE p.tournament_id=p_tournament_id AND p.user_id=v_uid) THEN'||
  E'\n'||
  '    RETURN pg_catalog.jsonb_build_object('||
  E'\n'||
  '      ''ok'',false,''code'',''ALREADY_REGISTERED'','||
  E'\n'||
  '      ''message'',''You already occupy a slot in this tournament.'');'||
  E'\n'||
  '  END IF;'||E'\n'||
  v_needle;
BEGIN
 IF pg_catalog.strpos(v_definition,v_needle)=0 THEN
  RAISE EXCEPTION 'Expected solo RPC body not found; refusing unsafe replacement';
 END IF;
 IF pg_catalog.strpos(v_definition,'tournament_entry_participants p')>0 THEN
  RAISE EXCEPTION 'Solo RPC already patched';
 END IF;
 EXECUTE pg_catalog.replace(v_definition,v_needle,v_replacement);
END $patch$;
REVOKE ALL ON FUNCTION public.register_for_tournament(uuid,uuid,uuid,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_tournament(uuid,uuid,uuid,boolean)
 TO authenticated;

CREATE FUNCTION public.register_team_for_tournament(
 p_tournament_id uuid,p_team_id uuid,p_rules_accepted boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_uid uuid:=auth.uid();v_jwt jsonb:=auth.jwt();
 v_t public.tournaments%ROWTYPE;v_team public.teams%ROWTYPE;
 v_size integer;v_eligible integer;v_expected integer;
 v_count integer;v_entry uuid;v_now timestamptz;v_slot integer;
BEGIN
 IF v_uid IS NULL OR v_jwt->>'role' IS DISTINCT FROM 'authenticated'
 OR v_jwt->>'sub' IS DISTINCT FROM v_uid::text
 OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=v_uid AND u.deleted_at IS NULL AND u.is_anonymous=false)
 THEN RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','Sign in to register a team.');END IF;
 IF p_rules_accepted IS DISTINCT FROM true THEN
 RETURN jsonb_build_object('ok',false,'code','RULES_NOT_ACCEPTED','message','Captain must accept tournament rules for the team.');END IF;
 IF p_team_id IS NULL OR p_tournament_id IS NULL THEN
 RETURN jsonb_build_object('ok',false,'code','INVALID_ID','message','Tournament and team IDs are required.');END IF;
 -- Same tournament FOR UPDATE lock used by the solo RPC. The single entry
 -- row consumes the same capacity unit as a solo registration.
 SELECT * INTO v_t FROM public.tournaments WHERE id=p_tournament_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','TOURNAMENT_NOT_FOUND','message','Tournament unavailable.');END IF;
 IF v_t.status<>'registration_open' THEN RETURN jsonb_build_object('ok',false,'code','REGISTRATION_NOT_OPEN','message','Registration is not open.');END IF;
 IF v_t.entry_fee_minor<>0 THEN RETURN jsonb_build_object('ok',false,'code','PAID_TOURNAMENT_NOT_SUPPORTED','message','Paid registrations are unavailable.');END IF;
 v_expected:=CASE lower(btrim(coalesce(v_t.player_format,'')))
 WHEN 'duo' THEN 2 WHEN 'trio' THEN 3 WHEN 'squad' THEN 4 ELSE NULL END;
 IF v_expected IS NULL THEN RETURN jsonb_build_object('ok',false,'code','TEAM_FORMAT_NOT_SUPPORTED','message','Event must use Duo, Trio or Squad format.');END IF;
 IF v_t.max_players IS NULL OR v_t.max_players<2
 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_CAPACITY','message','Tournament capacity is not configured.');END IF;
 IF NOT EXISTS(SELECT 1 FROM public.games WHERE id=v_t.game_id AND is_active)
 THEN RETURN jsonb_build_object('ok',false,'code','GAME_UNAVAILABLE','message','Tournament game unavailable.');END IF;
 IF v_t.registration_opens_at IS NULL OR v_t.registration_closes_at IS NULL
 OR v_t.starts_at IS NULL OR v_t.registration_opens_at>=v_t.registration_closes_at
 OR v_t.registration_closes_at>v_t.starts_at THEN
 RETURN jsonb_build_object('ok',false,'code','INVALID_WINDOW','message','Invalid registration schedule.');END IF;
 v_now:=clock_timestamp();
 IF v_now<v_t.registration_opens_at THEN RETURN jsonb_build_object('ok',false,'code','REGISTRATION_NOT_STARTED','message','Registration has not opened.');END IF;
 IF v_now>=v_t.registration_closes_at OR v_now>=v_t.starts_at THEN
 RETURN jsonb_build_object('ok',false,'code','REGISTRATION_CLOSED','message','Registration has closed.');END IF;
 -- Team lock prevents roster changes during snapshot and registration.
 SELECT * INTO v_team FROM public.teams WHERE id=p_team_id FOR UPDATE;
 IF NOT FOUND OR v_team.captain_id<>v_uid THEN
 RETURN jsonb_build_object('ok',false,'code','FORBIDDEN','message','Only this team captain can register.');END IF;
 IF v_team.game_id<>v_t.game_id THEN RETURN jsonb_build_object('ok',false,'code','GAME_MISMATCH','message','Team game differs from tournament game.');END IF;
 IF v_team.roster_state<>'locked' THEN RETURN jsonb_build_object('ok',false,'code','ROSTER_NOT_LOCKED','message','Lock the roster before registering.');END IF;
 SELECT count(*),count(*) FILTER(WHERE a.id IS NOT NULL
 AND a.user_id=m.user_id AND a.game_id=v_team.game_id
 AND a.verification_status<>'rejected')
 INTO v_size,v_eligible
 FROM public.team_members m
 LEFT JOIN public.player_game_accounts a ON a.id=m.game_account_id
 WHERE m.team_id=p_team_id;
 IF v_size<>v_expected OR v_size<>v_eligible THEN
 RETURN jsonb_build_object('ok',false,'code','INVALID_ROSTER','message','Locked roster must exactly match event size and game accounts.','required_members',v_expected,'actual_members',v_size);END IF;
 IF EXISTS(SELECT 1 FROM public.tournament_entries WHERE tournament_id=p_tournament_id AND team_id=p_team_id)
 THEN RETURN jsonb_build_object('ok',false,'code','ALREADY_REGISTERED','message','Team already registered.');END IF;
 IF EXISTS(SELECT 1 FROM public.team_members m JOIN public.tournament_entry_participants p ON p.user_id=m.user_id AND p.tournament_id=p_tournament_id WHERE m.team_id=p_team_id)
 THEN RETURN jsonb_build_object('ok',false,'code','PLAYER_ALREADY_REGISTERED','message','A roster member already has a tournament slot.');END IF;
 SELECT count(*) INTO v_count FROM public.tournament_entries WHERE tournament_id=p_tournament_id;
 IF v_count>=v_t.max_players THEN RETURN jsonb_build_object('ok',false,'code','TOURNAMENT_FULL','message','Tournament is full.','registered_count',v_count,'max_players',v_t.max_players,'slots_remaining',0);END IF;
 v_slot:=v_count+1;
 INSERT INTO public.tournament_entries
 (tournament_id,user_id,game_account_id,team_id,status,slot_number,rules_accepted_at)
 VALUES(p_tournament_id,v_uid,NULL,p_team_id,'registered',v_slot,v_now)
 RETURNING id INTO v_entry;
 -- Frozen membership and game UID snapshots; every roster user uniquely
 -- occupies a tournament, across both solo and team registrations.
 INSERT INTO public.tournament_entry_participants
 (entry_id,tournament_id,user_id,game_account_id,game_uid_snapshot)
 SELECT v_entry,p_tournament_id,m.user_id,m.game_account_id,a.game_uid
 FROM public.team_members m JOIN public.player_game_accounts a ON a.id=m.game_account_id
 WHERE m.team_id=p_team_id;
 INSERT INTO public.team_audit_events(team_id,tournament_id,entry_id,actor_user_id,action,details)
 VALUES(p_team_id,p_tournament_id,v_entry,v_uid,'tournament.team_registered',
 jsonb_build_object('team_size',v_size,'slot_number',v_slot));
 RETURN jsonb_build_object('ok',true,'code','REGISTERED','message','Team registration confirmed.','tournament_id',p_tournament_id,'team_id',p_team_id,'entry_id',v_entry,'slot_number',v_slot,'team_size',v_size,'registered_count',v_count+1,'max_players',v_t.max_players,'slots_remaining',v_t.max_players-v_count-1,'status','registered');
END $fn$;

REVOKE ALL ON FUNCTION public.register_team_for_tournament(uuid,uuid,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_team_for_tournament(uuid,uuid,boolean)
 TO authenticated;
