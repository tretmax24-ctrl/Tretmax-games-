-- Phase B: secure match scheduling, private result evidence, disputes, forfeits and
-- winner propagation. Every write takes the tournament lock first, then match.
CREATE TABLE public.match_result_submissions (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 match_id uuid NOT NULL REFERENCES public.tournament_bracket_matches(id) ON DELETE RESTRICT,
 tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE RESTRICT,
 submitting_entry_id uuid NOT NULL REFERENCES public.tournament_entries(id) ON DELETE RESTRICT,
 submitted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 claimed_winner_entry_id uuid NOT NULL REFERENCES public.tournament_entries(id) ON DELETE RESTRICT,
 score jsonb NOT NULL,
 evidence_path text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 submitted_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 decided_at timestamptz,
 decided_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 CHECK (pg_catalog.octet_length(score::text)<=2048),
 CHECK (evidence_path IS NULL OR pg_catalog.char_length(evidence_path)<=200)
);
CREATE UNIQUE INDEX match_result_one_pending_per_side ON public.match_result_submissions(match_id,submitting_entry_id)
 WHERE status='pending';
CREATE TABLE public.match_disputes (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 match_id uuid NOT NULL REFERENCES public.tournament_bracket_matches(id) ON DELETE RESTRICT,
 tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE RESTRICT,
 opened_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 entry_id uuid NOT NULL REFERENCES public.tournament_entries(id) ON DELETE RESTRICT,
 reason text NOT NULL CHECK (pg_catalog.char_length(reason) BETWEEN 5 AND 500),
 evidence_path text,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','upheld','dismissed')),
 opened_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 resolved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 resolved_at timestamptz,
 resolution_reason text,
 CHECK (evidence_path IS NULL OR pg_catalog.char_length(evidence_path)<=200),
 CHECK ((status='open' AND resolved_by IS NULL AND resolved_at IS NULL)
    OR (status<>'open' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL))
);
CREATE UNIQUE INDEX match_disputes_one_open_per_match ON public.match_disputes(match_id) WHERE status='open';
ALTER TABLE public.match_result_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_disputes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.match_result_submissions,public.match_disputes FROM PUBLIC,anon,authenticated;

CREATE FUNCTION tretmax_internal.finalize_match(
 p_match_id uuid, p_winner_entry_id uuid, p_outcome text, p_actor uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $func$
DECLARE v_match public.tournament_bracket_matches%ROWTYPE;
 v_next public.tournament_bracket_matches%ROWTYPE;
 v_seed integer;
 v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
 IF p_outcome NOT IN ('completed','forfeit') OR p_actor IS NULL THEN
  RAISE EXCEPTION 'Invalid privileged finalization arguments';
 END IF;
 SELECT * INTO v_match FROM public.tournament_bracket_matches WHERE id=p_match_id FOR UPDATE;
 IF NOT FOUND OR v_match.status NOT IN ('ready','disputed')
 OR v_match.slot_one_entry_id IS NULL OR v_match.slot_two_entry_id IS NULL
 OR p_winner_entry_id NOT IN (v_match.slot_one_entry_id,v_match.slot_two_entry_id)
 OR v_match.winner_entry_id IS NOT NULL THEN
  RAISE EXCEPTION 'Match is not finalizable';
 END IF;
 v_seed:=CASE WHEN p_winner_entry_id=v_match.slot_one_entry_id THEN v_match.seed_one ELSE v_match.seed_two END;
 UPDATE public.tournament_bracket_matches SET status=p_outcome,
  winner_entry_id=p_winner_entry_id,verified_by=p_actor,completed_at=v_now
 WHERE id=p_match_id;
 IF v_match.next_match_id IS NOT NULL THEN
  SELECT * INTO v_next FROM public.tournament_bracket_matches
   WHERE id=v_match.next_match_id FOR UPDATE;
  IF NOT FOUND OR v_next.bracket_id<>v_match.bracket_id
   OR v_next.round_number<>v_match.round_number+1
   OR v_next.match_number<>(v_match.match_number+1)/2
   OR v_next.status NOT IN ('pending','ready') THEN
   RAISE EXCEPTION 'Invalid advancement target; operation rolled back';
  END IF;
  IF (v_match.next_slot=1 AND v_next.slot_one_entry_id IS NOT NULL)
     OR (v_match.next_slot=2 AND v_next.slot_two_entry_id IS NOT NULL) THEN
   RAISE EXCEPTION 'Advancement slot already filled; operation rolled back';
  END IF;
  UPDATE public.tournament_bracket_matches p SET
   slot_one_entry_id=CASE WHEN v_match.next_slot=1 THEN p_winner_entry_id ELSE p.slot_one_entry_id END,
   slot_two_entry_id=CASE WHEN v_match.next_slot=2 THEN p_winner_entry_id ELSE p.slot_two_entry_id END,
   seed_one=CASE WHEN v_match.next_slot=1 THEN v_seed ELSE p.seed_one END,
   seed_two=CASE WHEN v_match.next_slot=2 THEN v_seed ELSE p.seed_two END,
   status=CASE WHEN
     (v_match.next_slot=1 AND p.slot_two_entry_id IS NOT NULL)
     OR (v_match.next_slot=2 AND p.slot_one_entry_id IS NOT NULL)
     THEN 'ready' ELSE 'pending' END
  WHERE p.id=v_match.next_match_id;
 END IF;
 INSERT INTO public.competition_audit_events(tournament_id,match_id,actor_id,action,details)
 VALUES(v_match.tournament_id,p_match_id,p_actor,'match.'||p_outcome,
  pg_catalog.jsonb_build_object('winner_entry_id',p_winner_entry_id,'next_match_id',v_match.next_match_id));
 RETURN pg_catalog.jsonb_build_object('winner_entry_id',p_winner_entry_id,
   'next_match_id',v_match.next_match_id,'status',p_outcome);
END $func$;
REVOKE ALL ON FUNCTION tretmax_internal.finalize_match(uuid,uuid,text,uuid)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.schedule_tournament_match(
 p_match_id uuid,p_scheduled_at timestamptz,p_room_label text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $func$
DECLARE v_tid uuid;v_t public.tournaments%ROWTYPE;v_m public.tournament_bracket_matches%ROWTYPE;
 v_now timestamptz;
BEGIN
 IF NOT tretmax_internal.valid_actor() THEN
  RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','Sign in to schedule a match.');END IF;
 SELECT tournament_id INTO v_tid FROM public.tournament_bracket_matches WHERE id=p_match_id;
 IF v_tid IS NULL OR NOT tretmax_internal.authorized_staff(v_tid,true) THEN
  RETURN jsonb_build_object('ok',false,'code','FORBIDDEN','message','Only event staff can schedule matches.');END IF;
 SELECT * INTO v_t FROM public.tournaments WHERE id=v_tid FOR UPDATE;
 SELECT * INTO v_m FROM public.tournament_bracket_matches WHERE id=p_match_id FOR UPDATE;
 IF v_t.status<>'in_progress' OR v_t.entry_fee_minor<>0 THEN
  RETURN jsonb_build_object('ok',false,'code','TOURNAMENT_NOT_ACTIVE','message','Tournament is not an active free event.');END IF;
 IF v_m.status<>'ready' OR v_m.slot_one_entry_id IS NULL OR v_m.slot_two_entry_id IS NULL THEN
  RETURN jsonb_build_object('ok',false,'code','MATCH_NOT_READY','message','Wait for both opponents.');END IF;
 IF v_m.scheduled_at IS NOT NULL THEN
  RETURN jsonb_build_object('ok',false,'code','ALREADY_SCHEDULED','message','Match already has an official schedule.');END IF;
 v_now:=clock_timestamp();
 IF p_scheduled_at IS NULL OR p_scheduled_at<v_now+interval '30 seconds'
 OR p_scheduled_at<v_t.starts_at OR p_scheduled_at>v_now+interval '30 days' THEN
  RETURN jsonb_build_object('ok',false,'code','INVALID_SCHEDULE','message','Schedule must be in the future, after event start, within 30 days.');END IF;
 IF p_room_label IS NOT NULL AND (char_length(p_room_label)>100 OR
 p_room_label !~ '^[A-Za-z0-9 _.-]+$' OR btrim(p_room_label)='') THEN
  RETURN jsonb_build_object('ok',false,'code','INVALID_ROOM','message','Invalid private room label.');END IF;
 UPDATE public.tournament_bracket_matches SET scheduled_at=p_scheduled_at,
 room_label=nullif(btrim(p_room_label),'') WHERE id=p_match_id;
 INSERT INTO public.competition_audit_events(tournament_id,match_id,actor_id,action,details)
 VALUES(v_tid,p_match_id,auth.uid(),'match.scheduled',
 jsonb_build_object('scheduled_at',p_scheduled_at,'has_room',p_room_label IS NOT NULL));
 RETURN jsonb_build_object('ok',true,'code','MATCH_SCHEDULED','message','Match scheduled.',
  'match_id',p_match_id,'scheduled_at',p_scheduled_at);
END $func$;

CREATE FUNCTION public.submit_match_result(
 p_match_id uuid,p_winner_entry_id uuid,p_score jsonb,p_evidence_path text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $func$
DECLARE v_tid uuid;v_t public.tournaments%ROWTYPE;v_m public.tournament_bracket_matches%ROWTYPE;
 v_entry uuid;v_id uuid;
BEGIN
 IF NOT tretmax_internal.valid_actor() THEN
  RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','Sign in to submit results.');END IF;
 SELECT tournament_id INTO v_tid FROM public.tournament_bracket_matches WHERE id=p_match_id;
 IF v_tid IS NULL THEN
  RETURN jsonb_build_object('ok',false,'code','MATCH_NOT_FOUND','message','Match unavailable.');END IF;
 -- Reject nonparticipants before returning match details or taking the write lock.
 SELECT e.id INTO v_entry FROM public.tournament_entries e
 WHERE e.id IN (SELECT slot_one_entry_id FROM public.tournament_bracket_matches WHERE id=p_match_id
  UNION ALL SELECT slot_two_entry_id FROM public.tournament_bracket_matches WHERE id=p_match_id)
 AND EXISTS(SELECT 1 FROM public.tournament_entry_participants p WHERE p.entry_id=e.id AND p.user_id=auth.uid())
 LIMIT 1;
 IF v_entry IS NULL THEN
  RETURN jsonb_build_object('ok',false,'code','MATCH_NOT_FOUND','message','Match unavailable.');END IF;
 SELECT * INTO v_t FROM public.tournaments WHERE id=v_tid FOR UPDATE;
 SELECT * INTO v_m FROM public.tournament_bracket_matches WHERE id=p_match_id FOR UPDATE;
 IF v_t.status<>'in_progress' OR v_t.entry_fee_minor<>0 OR v_m.status<>'ready' THEN
  RETURN jsonb_build_object('ok',false,'code','MATCH_NOT_READY','message','Match is not accepting results.');END IF;
 IF v_m.scheduled_at IS NULL OR clock_timestamp()<v_m.scheduled_at
 OR clock_timestamp()>v_m.scheduled_at+interval '48 hours' THEN
  RETURN jsonb_build_object('ok',false,'code','OUTSIDE_RESULT_WINDOW','message','Submit within 48 hours after the scheduled match time.');END IF;
 IF p_winner_entry_id IS NULL OR p_winner_entry_id NOT IN (v_m.slot_one_entry_id,v_m.slot_two_entry_id) THEN
  RETURN jsonb_build_object('ok',false,'code','INVALID_WINNER','message','Winner must be an assigned match opponent.');END IF;
 IF p_score IS NULL OR jsonb_typeof(p_score)<>'object'
 OR pg_catalog.octet_length(p_score::text)>2048 THEN
  RETURN jsonb_build_object('ok',false,'code','INVALID_SCORE','message','Provide a compact JSON score object.');END IF;
 IF p_evidence_path IS NOT NULL AND (
   length(p_evidence_path)>200 OR p_evidence_path NOT LIKE 'match-evidence/'||p_match_id::text||'/%'
   OR p_evidence_path ~ '(^|/)\.\.' OR p_evidence_path ~ '[:?&#]' OR
   p_evidence_path !~ '^match-evidence/[0-9a-f-]{36}/[A-Za-z0-9_.-]{1,80}$'
 ) THEN
  RETURN jsonb_build_object('ok',false,'code','INVALID_EVIDENCE_PATH','message','Use a match-scoped private evidence path, not a URL.');END IF;
 IF EXISTS(SELECT 1 FROM public.match_result_submissions WHERE match_id=p_match_id AND submitting_entry_id=v_entry AND status='pending') THEN
  RETURN jsonb_build_object('ok',false,'code','ALREADY_SUBMITTED','message','Your side already submitted a result.');END IF;
 INSERT INTO public.match_result_submissions
 (match_id,tournament_id,submitting_entry_id,submitted_by,claimed_winner_entry_id,score,evidence_path)
 VALUES(p_match_id,v_tid,v_entry,auth.uid(),p_winner_entry_id,p_score,p_evidence_path)
 RETURNING id INTO v_id;
 INSERT INTO public.competition_audit_events(tournament_id,match_id,actor_id,action,details)
 VALUES(v_tid,p_match_id,auth.uid(),'match.result_submitted',
  jsonb_build_object('submission_id',v_id,'submitting_entry_id',v_entry,'has_evidence',p_evidence_path IS NOT NULL));
 RETURN jsonb_build_object('ok',true,'code','RESULT_SUBMITTED','message','Result submitted for official review.',
  'match_id',p_match_id,'submission_id',v_id,'status','pending');
END $func$;

CREATE FUNCTION public.verify_match_result(
 p_match_id uuid,p_decision text,p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $func$
DECLARE v_tid uuid;v_t public.tournaments%ROWTYPE;v_m public.tournament_bracket_matches%ROWTYPE;
 v_winners integer;v_winner uuid;v_result jsonb;v_reason text:=btrim(coalesce(p_reason,''));
BEGIN
 IF NOT tretmax_internal.valid_actor() THEN
  RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','Sign in to verify results.');END IF;
 SELECT tournament_id INTO v_tid FROM public.tournament_bracket_matches WHERE id=p_match_id;
 IF v_tid IS NULL OR NOT tretmax_internal.authorized_staff(v_tid,true) THEN
  RETURN jsonb_build_object('ok',false,'code','FORBIDDEN','message','Only assigned event staff may verify results.');END IF;
 SELECT * INTO v_t FROM public.tournaments WHERE id=v_tid FOR UPDATE;
 SELECT * INTO v_m FROM public.tournament_bracket_matches WHERE id=p_match_id FOR UPDATE;
 IF v_t.status<>'in_progress' OR v_t.entry_fee_minor<>0 OR v_m.status<>'ready' THEN
  RETURN jsonb_build_object('ok',false,'code','MATCH_NOT_READY','message','Match is not ready for verification.');END IF;
 IF v_m.scheduled_at IS NULL OR clock_timestamp()<v_m.scheduled_at THEN
  RETURN jsonb_build_object('ok',false,'code','MATCH_NOT_STARTED','message','Match is not scheduled or has not started.');END IF;
 IF p_decision NOT IN ('approve','reject') OR p_decision IS NULL THEN
  RETURN jsonb_build_object('ok',false,'code','INVALID_DECISION','message','Decision must be approve or reject.');END IF;
 IF p_decision='reject' AND length(v_reason) NOT BETWEEN 5 AND 500 THEN
  RETURN jsonb_build_object('ok',false,'code','REASON_REQUIRED','message','Provide an audit reason of 5 to 500 characters.');END IF;
 IF NOT EXISTS(SELECT 1 FROM public.match_result_submissions WHERE match_id=p_match_id AND status='pending') THEN
  RETURN jsonb_build_object('ok',false,'code','NO_PENDING_RESULT','message','No pending submission exists.');END IF;
 IF p_decision='reject' THEN
  UPDATE public.match_result_submissions SET status='rejected',decided_at=clock_timestamp(),decided_by=auth.uid()
  WHERE match_id=p_match_id AND status='pending';
  INSERT INTO public.competition_audit_events(tournament_id,match_id,actor_id,action,details)
  VALUES(v_tid,p_match_id,auth.uid(),'match.results_rejected',jsonb_build_object('reason',v_reason));
  RETURN jsonb_build_object('ok',true,'code','RESULT_REJECTED','message','Submissions rejected; players may resubmit.','match_id',p_match_id);
 END IF;
 SELECT count(DISTINCT claimed_winner_entry_id),min(claimed_winner_entry_id)
 INTO v_winners,v_winner FROM public.match_result_submissions WHERE match_id=p_match_id AND status='pending';
 IF v_winners<>1 THEN
  RETURN jsonb_build_object('ok',false,'code','CONFLICTING_RESULTS','message','Conflicting claims require resolution.');END IF;
 UPDATE public.match_result_submissions SET status='approved',decided_at=clock_timestamp(),decided_by=auth.uid()
 WHERE match_id=p_match_id AND status='pending';
 v_result:=tretmax_internal.finalize_match(p_match_id,v_winner,'completed',auth.uid());
 RETURN jsonb_build_object('ok',true,'code','RESULT_VERIFIED','message','Result verified; winner advanced.',
 'match_id',p_match_id,'winner_entry_id',v_winner,'next_match_id',v_result->'next_match_id');
END $func$;

CREATE FUNCTION public.open_match_dispute(
 p_match_id uuid,p_reason text,p_evidence_path text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $func$
DECLARE v_tid uuid;v_t public.tournaments%ROWTYPE;v_m public.tournament_bracket_matches%ROWTYPE;
 v_entry uuid;v_id uuid;v_reason text:=btrim(coalesce(p_reason,''));
BEGIN
 IF NOT tretmax_internal.valid_actor() THEN
  RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','Sign in to dispute a match.');END IF;
 SELECT tournament_id INTO v_tid FROM public.tournament_bracket_matches WHERE id=p_match_id;
 IF v_tid IS NULL THEN
  RETURN jsonb_build_object('ok',false,'code','MATCH_NOT_FOUND','message','Match unavailable.');END IF;
 SELECT e.id INTO v_entry FROM public.tournament_entries e
 WHERE e.id IN (SELECT slot_one_entry_id FROM public.tournament_bracket_matches WHERE id=p_match_id
 UNION ALL SELECT slot_two_entry_id FROM public.tournament_bracket_matches WHERE id=p_match_id)
 AND EXISTS(SELECT 1 FROM public.tournament_entry_participants p WHERE p.entry_id=e.id AND p.user_id=auth.uid())
 LIMIT 1;
 IF v_entry IS NULL THEN
  RETURN jsonb_build_object('ok',false,'code','MATCH_NOT_FOUND','message','Match unavailable.');END IF;
 SELECT * INTO v_t FROM public.tournaments WHERE id=v_tid FOR UPDATE;
 SELECT * INTO v_m FROM public.tournament_bracket_matches WHERE id=p_match_id FOR UPDATE;
 IF v_t.status<>'in_progress' OR v_m.status NOT IN ('ready','disputed') THEN
  RETURN jsonb_build_object('ok',false,'code','MATCH_NOT_READY','message','Match cannot be disputed.');END IF;
 IF v_m.scheduled_at IS NULL OR clock_timestamp()<v_m.scheduled_at OR
 clock_timestamp()>v_m.scheduled_at+interval '48 hours' THEN
  RETURN jsonb_build_object('ok',false,'code','OUTSIDE_DISPUTE_WINDOW','message','Dispute within 48 hours of scheduled start.');END IF;
 IF NOT EXISTS(SELECT 1 FROM public.match_result_submissions WHERE match_id=p_match_id AND status='pending') THEN
  RETURN jsonb_build_object('ok',false,'code','NO_RESULT_TO_DISPUTE','message','No pending match result exists.');END IF;
 IF length(v_reason) NOT BETWEEN 5 AND 500 THEN
  RETURN jsonb_build_object('ok',false,'code','INVALID_REASON','message','Provide a reason of 5 to 500 characters.');END IF;
 IF p_evidence_path IS NOT NULL AND
  (length(p_evidence_path)>200 OR p_evidence_path NOT LIKE 'match-evidence/'||p_match_id::text||'/%'
  OR p_evidence_path ~ '(^|/)\.\.' OR p_evidence_path ~ '[:?&#]' OR
  p_evidence_path !~ '^match-evidence/[0-9a-f-]{36}/[A-Za-z0-9_.-]{1,80}$') THEN
  RETURN jsonb_build_object('ok',false,'code','INVALID_EVIDENCE_PATH','message','Private match-scoped evidence path required.');END IF;
 IF EXISTS(SELECT 1 FROM public.match_disputes WHERE match_id=p_match_id AND status='open') THEN
  RETURN jsonb_build_object('ok',false,'code','DISPUTE_ALREADY_OPEN','message','This match already has an open dispute.');END IF;
 INSERT INTO public.match_disputes(match_id,tournament_id,opened_by,entry_id,reason,evidence_path)
 VALUES(p_match_id,v_tid,auth.uid(),v_entry,v_reason,p_evidence_path) RETURNING id INTO v_id;
 UPDATE public.tournament_bracket_matches SET status='disputed' WHERE id=p_match_id;
 INSERT INTO public.competition_audit_events(tournament_id,match_id,actor_id,action,details)
 VALUES(v_tid,p_match_id,auth.uid(),'match.dispute_opened',jsonb_build_object('dispute_id',v_id,'has_evidence',p_evidence_path IS NOT NULL));
 RETURN jsonb_build_object('ok',true,'code','DISPUTE_OPENED','message','Dispute opened for staff review.','dispute_id',v_id,'match_id',p_match_id);
END $func$;

CREATE FUNCTION public.resolve_match_dispute(
 p_dispute_id uuid,p_decision text,p_reason text,p_winner_entry_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $func$
DECLARE v_d public.match_disputes%ROWTYPE;v_tid uuid;
 v_t public.tournaments%ROWTYPE;v_m public.tournament_bracket_matches%ROWTYPE;
 v_reason text:=btrim(coalesce(p_reason,''));v_result jsonb;
BEGIN
 IF NOT tretmax_internal.valid_actor() THEN
  RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','Sign in to resolve disputes.');END IF;
 SELECT tournament_id INTO v_tid FROM public.match_disputes WHERE id=p_dispute_id;
 IF v_tid IS NULL OR NOT tretmax_internal.authorized_staff(v_tid,true) THEN
  RETURN jsonb_build_object('ok',false,'code','FORBIDDEN','message','Only event staff may resolve disputes.');END IF;
 SELECT * INTO v_t FROM public.tournaments WHERE id=v_tid FOR UPDATE;
 SELECT * INTO v_d FROM public.match_disputes WHERE id=p_dispute_id FOR UPDATE;
 SELECT * INTO v_m FROM public.tournament_bracket_matches WHERE id=v_d.match_id FOR UPDATE;
 IF v_t.status<>'in_progress' OR v_t.entry_fee_minor<>0 OR v_d.status<>'open' OR v_m.status<>'disputed' THEN
  RETURN jsonb_build_object('ok',false,'code','DISPUTE_NOT_OPEN','message','Dispute no longer needs resolution.');END IF;
 IF p_decision NOT IN ('dismiss','uphold') OR p_decision IS NULL THEN
  RETURN jsonb_build_object('ok',false,'code','INVALID_DECISION','message','Decision must be dismiss or uphold.');END IF;
 IF length(v_reason) NOT BETWEEN 5 AND 500 THEN
  RETURN jsonb_build_object('ok',false,'code','REASON_REQUIRED','message','A detailed audit reason is required.');END IF;
 IF p_decision='uphold' AND (p_winner_entry_id IS NULL OR
 p_winner_entry_id NOT IN(v_m.slot_one_entry_id,v_m.slot_two_entry_id)) THEN
  RETURN jsonb_build_object('ok',false,'code','INVALID_WINNER','message','Provide the verified winning opponent.');END IF;
 UPDATE public.match_disputes SET status=CASE WHEN p_decision='uphold' THEN 'upheld' ELSE 'dismissed' END,
 resolved_by=auth.uid(),resolved_at=clock_timestamp(),resolution_reason=v_reason WHERE id=p_dispute_id;
 IF p_decision='dismiss' THEN
  UPDATE public.tournament_bracket_matches SET status='ready' WHERE id=v_m.id;
  INSERT INTO public.competition_audit_events(tournament_id,match_id,actor_id,action,details)
  VALUES(v_tid,v_m.id,auth.uid(),'match.dispute_dismissed',jsonb_build_object('dispute_id',p_dispute_id,'reason',v_reason));
  RETURN jsonb_build_object('ok',true,'code','DISPUTE_DISMISSED','message','Dispute dismissed; normal result verification resumed.','dispute_id',p_dispute_id);
 END IF;
 UPDATE public.match_result_submissions SET
 status=CASE WHEN claimed_winner_entry_id=p_winner_entry_id THEN 'approved' ELSE 'rejected' END,
 decided_at=clock_timestamp(),decided_by=auth.uid()
 WHERE match_id=v_m.id AND status='pending';
 v_result:=tretmax_internal.finalize_match(v_m.id,p_winner_entry_id,'completed',auth.uid());
 INSERT INTO public.competition_audit_events(tournament_id,match_id,actor_id,action,details)
 VALUES(v_tid,v_m.id,auth.uid(),'match.dispute_upheld',
 jsonb_build_object('dispute_id',p_dispute_id,'reason',v_reason,'winner_entry_id',p_winner_entry_id));
 RETURN jsonb_build_object('ok',true,'code','DISPUTE_RESOLVED','message','Dispute upheld; verified winner advanced.',
 'dispute_id',p_dispute_id,'match_id',v_m.id,'winner_entry_id',p_winner_entry_id,'next_match_id',v_result->'next_match_id');
END $func$;

CREATE FUNCTION public.record_match_forfeit(
 p_match_id uuid,p_entry_id uuid,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $func$
DECLARE v_tid uuid;v_t public.tournaments%ROWTYPE;v_m public.tournament_bracket_matches%ROWTYPE;
 v_winner uuid;v_result jsonb;v_reason text:=btrim(coalesce(p_reason,''));
BEGIN
 IF NOT tretmax_internal.valid_actor() THEN
  RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','Sign in to record a forfeit.');END IF;
 SELECT tournament_id INTO v_tid FROM public.tournament_bracket_matches WHERE id=p_match_id;
 IF v_tid IS NULL OR NOT tretmax_internal.authorized_staff(v_tid,true) THEN
  RETURN jsonb_build_object('ok',false,'code','FORBIDDEN','message','Only event staff may record forfeits.');END IF;
 SELECT * INTO v_t FROM public.tournaments WHERE id=v_tid FOR UPDATE;
 SELECT * INTO v_m FROM public.tournament_bracket_matches WHERE id=p_match_id FOR UPDATE;
 IF v_t.status<>'in_progress' OR v_t.entry_fee_minor<>0 OR v_m.status<>'ready' OR
 v_m.slot_one_entry_id IS NULL OR v_m.slot_two_entry_id IS NULL THEN
  RETURN jsonb_build_object('ok',false,'code','MATCH_NOT_READY','message','Match cannot be forfeited.');END IF;
 IF v_m.scheduled_at IS NULL OR clock_timestamp()<v_m.scheduled_at THEN
  RETURN jsonb_build_object('ok',false,'code','MATCH_NOT_STARTED','message','Cannot forfeit before scheduled start.');END IF;
 IF length(v_reason) NOT BETWEEN 5 AND 500 THEN
  RETURN jsonb_build_object('ok',false,'code','REASON_REQUIRED','message','Provide a forfeit reason of 5 to 500 characters.');END IF;
 IF p_entry_id NOT IN(v_m.slot_one_entry_id,v_m.slot_two_entry_id) OR p_entry_id IS NULL THEN
  RETURN jsonb_build_object('ok',false,'code','INVALID_ENTRY','message','Forfeit must identify an assigned opponent.');END IF;
 v_winner:=CASE WHEN p_entry_id=v_m.slot_one_entry_id THEN v_m.slot_two_entry_id ELSE v_m.slot_one_entry_id END;
 UPDATE public.match_result_submissions SET status='rejected',decided_at=clock_timestamp(),decided_by=auth.uid()
 WHERE match_id=p_match_id AND status='pending';
 v_result:=tretmax_internal.finalize_match(p_match_id,v_winner,'forfeit',auth.uid());
 INSERT INTO public.competition_audit_events(tournament_id,match_id,actor_id,action,details)
 VALUES(v_tid,p_match_id,auth.uid(),'match.forfeit_recorded',
  jsonb_build_object('forfeited_entry_id',p_entry_id,'reason',v_reason));
 RETURN jsonb_build_object('ok',true,'code','FORFEIT_RECORDED','message','Forfeit recorded; opponent advanced.',
 'match_id',p_match_id,'winner_entry_id',v_winner,'next_match_id',v_result->'next_match_id');
END $func$;

REVOKE ALL ON FUNCTION public.schedule_tournament_match(uuid,timestamptz,text),
 public.submit_match_result(uuid,uuid,jsonb,text),
 public.verify_match_result(uuid,text,text),
 public.open_match_dispute(uuid,text,text),
 public.resolve_match_dispute(uuid,text,text,uuid),
 public.record_match_forfeit(uuid,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_tournament_match(uuid,timestamptz,text),
 public.submit_match_result(uuid,uuid,jsonb,text),
 public.verify_match_result(uuid,text,text),
 public.open_match_dispute(uuid,text,text),
 public.resolve_match_dispute(uuid,text,text,uuid),
 public.record_match_forfeit(uuid,uuid,text)
 TO authenticated;
