-- Phase 3: check-in state, individual attendance and audited event staff.
-- No direct client INSERT/UPDATE/DELETE on attendance, referee or audit tables.

CREATE TABLE public.tournament_staff (
 tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 staff_role text NOT NULL CHECK(staff_role IN ('referee')),
 assigned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 assigned_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tournament_id,user_id)
);
ALTER TABLE public.tournament_staff ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tournament_staff FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.tournament_staff TO authenticated;
CREATE POLICY "Referees read own assignments"
 ON public.tournament_staff FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));

CREATE FUNCTION public.assign_tournament_referee(p_tournament_id uuid,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_uid uuid:=auth.uid();v_jwt jsonb:=auth.jwt();v_t public.tournaments%ROWTYPE;
BEGIN
 IF v_uid IS NULL OR v_jwt->>'role' IS DISTINCT FROM 'authenticated' OR v_jwt->>'sub' IS DISTINCT FROM v_uid::text
 OR v_jwt->'app_metadata'->>'tretmax_role' IS DISTINCT FROM 'owner'
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_uid AND raw_app_meta_data->>'tretmax_role'='owner' AND is_anonymous=false AND deleted_at IS NULL)
 THEN RETURN jsonb_build_object('ok',false,'code','FORBIDDEN','message','Only the platform Owner can assign referees.');END IF;
 SELECT * INTO v_t FROM public.tournaments WHERE id=p_tournament_id FOR UPDATE;
 IF NOT FOUND OR v_t.created_by<>v_uid THEN RETURN jsonb_build_object('ok',false,'code','NOT_FOUND_OR_NOT_OWNED','message','Tournament unavailable.');END IF;
 IF p_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id AND is_anonymous=false AND deleted_at IS NULL)
 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_REFEREE','message','Select a registered referee.');END IF;
 INSERT INTO public.tournament_staff(tournament_id,user_id,staff_role,assigned_by)
 VALUES(p_tournament_id,p_user_id,'referee',v_uid)
 ON CONFLICT(tournament_id,user_id) DO NOTHING;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','ALREADY_ASSIGNED','message','Referee already assigned.');END IF;
 INSERT INTO public.team_audit_events(tournament_id,actor_user_id,action,details)
 VALUES(p_tournament_id,v_uid,'tournament.referee_assigned',jsonb_build_object('referee_user_id',p_user_id));
 RETURN jsonb_build_object('ok',true,'code','REFEREE_ASSIGNED','message','Referee assigned.','tournament_id',p_tournament_id,'referee_user_id',p_user_id);
END $fn$;

CREATE FUNCTION public.open_tournament_check_in(p_tournament_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_uid uuid:=auth.uid();v_jwt jsonb:=auth.jwt();v_t public.tournaments%ROWTYPE;v_now timestamptz;
BEGIN
 IF v_uid IS NULL OR v_jwt->>'role' IS DISTINCT FROM 'authenticated' OR v_jwt->>'sub' IS DISTINCT FROM v_uid::text
 OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v_uid AND u.is_anonymous=false AND u.deleted_at IS NULL
 AND u.raw_app_meta_data->>'tretmax_role'=v_jwt->'app_metadata'->>'tretmax_role')
 OR (v_jwt->'app_metadata'->>'tretmax_role' NOT IN ('owner','tournament_manager')) THEN
 RETURN jsonb_build_object('ok',false,'code','FORBIDDEN','message','Only an authorized organizer may open check-in.');END IF;
 SELECT * INTO v_t FROM public.tournaments WHERE id=p_tournament_id FOR UPDATE;
 IF NOT FOUND OR v_t.created_by<>v_uid THEN
 RETURN jsonb_build_object('ok',false,'code','NOT_FOUND_OR_NOT_OWNED','message','Tournament unavailable.');END IF;
 IF v_t.status='check_in' THEN RETURN jsonb_build_object('ok',false,'code','ALREADY_OPEN','message','Check-in is already open.');END IF;
 IF v_t.status NOT IN ('registration_open','registration_closed') THEN
 RETURN jsonb_build_object('ok',false,'code','INVALID_STATUS','message','Only an event past registration may enter check-in.');END IF;
 IF v_t.entry_fee_minor<>0 THEN RETURN jsonb_build_object('ok',false,'code','PAID_EVENT_UNSUPPORTED','message','Paid event operations are not enabled.');END IF;
 v_now:=clock_timestamp();
 IF v_t.registration_closes_at IS NULL OR v_t.check_in_opens_at IS NULL OR v_t.check_in_closes_at IS NULL
 OR v_t.starts_at IS NULL OR v_t.check_in_opens_at>=v_t.check_in_closes_at
 OR v_t.check_in_opens_at<v_t.registration_closes_at OR v_t.check_in_closes_at>v_t.starts_at THEN
 RETURN jsonb_build_object('ok',false,'code','INVALID_WINDOW','message','Check-in schedule is invalid.');END IF;
 IF v_now<v_t.registration_closes_at OR v_now<v_t.check_in_opens_at OR v_now>=v_t.check_in_closes_at
 THEN RETURN jsonb_build_object('ok',false,'code','OUTSIDE_CHECK_IN_WINDOW','message','Check-in may only open during the scheduled server-time window.');END IF;
 UPDATE public.tournaments SET status='check_in',updated_at=v_now WHERE id=p_tournament_id;
 INSERT INTO public.team_audit_events(tournament_id,actor_user_id,action)
 VALUES(p_tournament_id,v_uid,'tournament.check_in_opened');
 RETURN jsonb_build_object('ok',true,'code','CHECK_IN_OPEN','message','Tournament check-in opened.','tournament_id',p_tournament_id,'status','check_in');
END $fn$;

CREATE FUNCTION public.check_in_tournament(p_tournament_id uuid,p_entry_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_uid uuid:=auth.uid();v_jwt jsonb:=auth.jwt();v_t public.tournaments%ROWTYPE;
v_e public.tournament_entries%ROWTYPE;v_p public.tournament_entry_participants%ROWTYPE;
v_total integer;v_done integer;v_now timestamptz;v_fully boolean;
BEGIN
 IF v_uid IS NULL OR v_jwt->>'role' IS DISTINCT FROM 'authenticated' OR v_jwt->>'sub' IS DISTINCT FROM v_uid::text
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_uid AND is_anonymous=false AND deleted_at IS NULL)
 THEN RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','Sign in to check in.');END IF;
 IF p_tournament_id IS NULL OR p_entry_id IS NULL THEN
 RETURN jsonb_build_object('ok',false,'code','INVALID_ID','message','Tournament and entry IDs are required.');END IF;
 -- Read lock coordinates status transitions without blocking unrelated events.
 SELECT * INTO v_t FROM public.tournaments WHERE id=p_tournament_id FOR SHARE;
 IF NOT FOUND OR v_t.status NOT IN ('registration_open','registration_closed','check_in','in_progress','completed')
 THEN RETURN jsonb_build_object('ok',false,'code','TOURNAMENT_NOT_FOUND','message','Event unavailable.');END IF;
 -- Entry lock serializes multiple members checking in the same team.
 SELECT * INTO v_e FROM public.tournament_entries WHERE id=p_entry_id AND tournament_id=p_tournament_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.tournament_entry_participants WHERE entry_id=p_entry_id AND user_id=v_uid)
 THEN RETURN jsonb_build_object('ok',false,'code','ENTRY_NOT_FOUND','message','You are not registered in this entry.');END IF;
 IF v_t.status<>'check_in' THEN
 RETURN jsonb_build_object('ok',false,'code','CHECK_IN_NOT_OPEN','message','Tournament check-in has not been opened.');END IF;
 v_now:=clock_timestamp();
 IF v_t.check_in_opens_at IS NULL OR v_t.check_in_closes_at IS NULL
 OR v_now<v_t.check_in_opens_at OR v_now>=v_t.check_in_closes_at THEN
 RETURN jsonb_build_object('ok',false,'code','OUTSIDE_CHECK_IN_WINDOW','message','Check-in is outside the scheduled time window.');END IF;
 IF v_e.status NOT IN ('registered','checked_in') THEN
 RETURN jsonb_build_object('ok',false,'code','ENTRY_INELIGIBLE','message','This entry cannot check in.');END IF;
 SELECT * INTO v_p FROM public.tournament_entry_participants WHERE entry_id=p_entry_id AND user_id=v_uid FOR UPDATE;
 IF v_p.attendance_status='checked_in' THEN
 RETURN jsonb_build_object('ok',false,'code','ALREADY_CHECKED_IN','message','You have already checked in.','entry_id',p_entry_id,'checked_in_at',v_p.checked_in_at);END IF;
 IF v_p.attendance_status='no_show' THEN
 RETURN jsonb_build_object('ok',false,'code','MARKED_NO_SHOW','message','This attendance has been marked no-show.');END IF;
 UPDATE public.tournament_entry_participants
 SET attendance_status='checked_in',checked_in_at=v_now
 WHERE entry_id=p_entry_id AND user_id=v_uid;
 SELECT count(*),count(*) FILTER(WHERE attendance_status='checked_in') INTO v_total,v_done
 FROM public.tournament_entry_participants WHERE entry_id=p_entry_id;
 v_fully:=(v_total>0 AND v_total=v_done);
 IF v_fully THEN UPDATE public.tournament_entries SET status='checked_in' WHERE id=p_entry_id AND status='registered';END IF;
 INSERT INTO public.team_audit_events(team_id,tournament_id,entry_id,actor_user_id,action,details)
 VALUES(v_e.team_id,p_tournament_id,p_entry_id,v_uid,'tournament.participant_checked_in',
 jsonb_build_object('checked_in_count',v_done,'required_count',v_total));
 RETURN jsonb_build_object('ok',true,'code','CHECKED_IN','message',
 CASE WHEN v_fully THEN 'Entry check-in completed.' ELSE 'You checked in; waiting for teammates.' END,
 'entry_id',p_entry_id,'checked_in_at',v_now,
 'checked_in_count',v_done,'required_count',v_total,'entry_checked_in',v_fully);
END $fn$;

-- The frontend may use the one-argument team check-in convenience wrapper.
-- Its identity and row visibility are verified by the core check-in RPC.
CREATE FUNCTION public.record_team_member_check_in(p_entry_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE v_tournament uuid;
BEGIN
 SELECT p.tournament_id INTO v_tournament
 FROM public.tournament_entry_participants p
 JOIN public.tournament_entries e ON e.id=p.entry_id
 WHERE p.entry_id=p_entry_id AND p.user_id=auth.uid() AND e.team_id IS NOT NULL;
 IF v_tournament IS NULL THEN
 RETURN jsonb_build_object('ok',false,'code','ENTRY_NOT_FOUND','message','Team registration unavailable.');END IF;
 RETURN public.check_in_tournament(v_tournament,p_entry_id);
END $fn$;

CREATE FUNCTION public.mark_entry_no_show(p_entry_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_uid uuid:=auth.uid();v_jwt jsonb:=auth.jwt();v_t public.tournaments%ROWTYPE;
v_e public.tournament_entries%ROWTYPE;v_now timestamptz;
v_trusted text;v_reason text:=btrim(coalesce(p_reason,''));v_authorized boolean;
BEGIN
 IF v_uid IS NULL OR v_jwt->>'role' IS DISTINCT FROM 'authenticated' OR v_jwt->>'sub' IS DISTINCT FROM v_uid::text
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_uid AND deleted_at IS NULL AND is_anonymous=false)
 THEN RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','Sign in to record a no-show.');END IF;
 IF p_entry_id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','INVALID_ID','message','Entry ID is required.');END IF;
 IF char_length(v_reason)<5 OR char_length(v_reason)>500 THEN
 RETURN jsonb_build_object('ok',false,'code','INVALID_REASON','message','A reason of 5 to 500 characters is required.');END IF;
 SELECT tournament_id INTO v_e.tournament_id FROM public.tournament_entries WHERE id=p_entry_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','ENTRY_NOT_FOUND','message','Entry unavailable.');END IF;
 SELECT * INTO v_t FROM public.tournaments WHERE id=v_e.tournament_id FOR SHARE;
 SELECT * INTO v_e FROM public.tournament_entries WHERE id=p_entry_id FOR UPDATE;
 SELECT raw_app_meta_data->>'tretmax_role' INTO v_trusted FROM auth.users WHERE id=v_uid;
 v_authorized:=(
  v_trusted='owner' AND v_jwt->'app_metadata'->>'tretmax_role'='owner'
 ) OR (
  v_trusted='tournament_manager' AND v_jwt->'app_metadata'->>'tretmax_role'='tournament_manager'
  AND v_t.created_by=v_uid
 ) OR EXISTS(
  SELECT 1 FROM public.tournament_staff s
  WHERE s.tournament_id=v_t.id AND s.user_id=v_uid AND s.staff_role='referee'
 );
 IF NOT v_authorized THEN RETURN jsonb_build_object('ok',false,'code','FORBIDDEN','message','Only event organizers or assigned referees can mark no-shows.');END IF;
 v_now:=clock_timestamp();
 IF v_t.status<>'check_in' OR v_t.check_in_closes_at IS NULL OR v_now<v_t.check_in_closes_at THEN
 RETURN jsonb_build_object('ok',false,'code','CHECK_IN_NOT_CLOSED','message','No-shows can be marked only after the check-in deadline.');END IF;
 IF v_e.status<>'registered' THEN RETURN jsonb_build_object('ok',false,'code','ENTRY_INELIGIBLE','message','Entry is not awaiting check-in.');END IF;
 UPDATE public.tournament_entries SET status='disqualified' WHERE id=p_entry_id;
 UPDATE public.tournament_entry_participants
 SET attendance_status='no_show'
 WHERE entry_id=p_entry_id AND attendance_status='pending';
 INSERT INTO public.team_audit_events(team_id,tournament_id,entry_id,actor_user_id,action,details)
 VALUES(v_e.team_id,v_t.id,p_entry_id,v_uid,'tournament.entry_no_show',
 jsonb_build_object('reason',v_reason));
 RETURN jsonb_build_object('ok',true,'code','NO_SHOW_RECORDED','message','No-show recorded.','entry_id',p_entry_id,'status','disqualified');
END $fn$;

REVOKE ALL ON FUNCTION public.assign_tournament_referee(uuid,uuid),public.open_tournament_check_in(uuid),public.check_in_tournament(uuid,uuid),public.record_team_member_check_in(uuid),public.mark_entry_no_show(uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assign_tournament_referee(uuid,uuid),public.open_tournament_check_in(uuid),public.check_in_tournament(uuid,uuid),public.record_team_member_check_in(uuid),public.mark_entry_no_show(uuid,text)
 TO authenticated;
