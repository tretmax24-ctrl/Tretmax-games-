-- Phase C: private final standings, terminal completion and privacy-preserving read RPCs.
CREATE TABLE public.tournament_final_standings (
 bracket_id uuid NOT NULL REFERENCES public.tournament_brackets(id) ON DELETE RESTRICT,
 tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE RESTRICT,
 entry_id uuid NOT NULL REFERENCES public.tournament_entries(id) ON DELETE RESTRICT,
 final_rank integer NOT NULL CHECK (final_rank>=1),
 eliminated_round integer,
 recorded_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 PRIMARY KEY(bracket_id,entry_id),
 UNIQUE(tournament_id,entry_id)
);
ALTER TABLE public.tournament_final_standings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tournament_final_standings FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.complete_tournament(p_tournament_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $func$
DECLARE v_t public.tournaments%ROWTYPE;
 v_b public.tournament_brackets%ROWTYPE;
 v_final public.tournament_bracket_matches%ROWTYPE;
 v_count integer;
 v_now timestamptz;
BEGIN
 IF NOT tretmax_internal.valid_actor() OR NOT tretmax_internal.authorized_staff(p_tournament_id,false) THEN
  RETURN jsonb_build_object('ok',false,'code','FORBIDDEN','message','Only the trusted organizer can complete tournaments.');END IF;
 SELECT * INTO v_t FROM public.tournaments WHERE id=p_tournament_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','TOURNAMENT_NOT_FOUND','message','Tournament unavailable.');END IF;
 IF v_t.entry_fee_minor<>0 THEN
  RETURN jsonb_build_object('ok',false,'code','PAID_EVENT_UNSUPPORTED','message','Paid tournament completion not enabled.');END IF;
 SELECT * INTO v_b FROM public.tournament_brackets WHERE tournament_id=p_tournament_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','BRACKET_NOT_FOUND','message','Official bracket not generated.');END IF;
 IF v_t.status='completed' OR v_b.status='completed' THEN
  RETURN jsonb_build_object('ok',false,'code','ALREADY_COMPLETED','message','Tournament has already been completed.');END IF;
 IF v_t.status<>'in_progress' OR v_b.status<>'active' THEN
  RETURN jsonb_build_object('ok',false,'code','INVALID_STATUS','message','Tournament is not in progress.');END IF;
 IF EXISTS(SELECT 1 FROM public.tournament_bracket_matches m
  WHERE m.bracket_id=v_b.id AND (m.status NOT IN ('completed','forfeit','bye') OR m.winner_entry_id IS NULL)) THEN
  RETURN jsonb_build_object('ok',false,'code','MATCHES_UNRESOLVED','message','Every match must have a verified winner.');END IF;
 IF EXISTS(SELECT 1 FROM public.match_disputes d WHERE d.tournament_id=p_tournament_id AND d.status='open') THEN
  RETURN jsonb_build_object('ok',false,'code','DISPUTES_UNRESOLVED','message','Resolve all disputes before completion.');END IF;
 SELECT * INTO v_final FROM public.tournament_bracket_matches
 WHERE bracket_id=v_b.id AND round_number=v_b.total_rounds AND match_number=1 FOR UPDATE;
 IF NOT FOUND OR v_final.status NOT IN ('completed','forfeit') OR v_final.winner_entry_id IS NULL
 OR v_final.slot_one_entry_id IS NULL OR v_final.slot_two_entry_id IS NULL THEN
  RETURN jsonb_build_object('ok',false,'code','FINAL_NOT_VERIFIED','message','Final match winner is not verified.');END IF;
 IF EXISTS(SELECT 1 FROM public.tournament_final_standings WHERE bracket_id=v_b.id) THEN
  RETURN jsonb_build_object('ok',false,'code','STANDINGS_EXIST','message','Official standings already exist.');END IF;
 INSERT INTO public.tournament_final_standings(bracket_id,tournament_id,entry_id,final_rank)
 VALUES(v_b.id,p_tournament_id,v_final.winner_entry_id,1);
 INSERT INTO public.tournament_final_standings(bracket_id,tournament_id,entry_id,final_rank,eliminated_round)
 SELECT v_b.id,p_tournament_id,
  CASE WHEN m.winner_entry_id=m.slot_one_entry_id THEN m.slot_two_entry_id ELSE m.slot_one_entry_id END,
  1 + (v_b.bracket_size / (2^m.round_number)::integer),
  m.round_number
 FROM public.tournament_bracket_matches m WHERE m.bracket_id=v_b.id
 AND m.status IN ('completed','forfeit') AND m.slot_one_entry_id IS NOT NULL
 AND m.slot_two_entry_id IS NOT NULL;
 SELECT count(*) INTO v_count FROM public.tournament_final_standings WHERE bracket_id=v_b.id;
 IF v_count<>v_b.entrant_count THEN
  RAISE EXCEPTION 'Standings count % differs from entrant count %; rollback',v_count,v_b.entrant_count;
 END IF;
 v_now:=clock_timestamp();
 UPDATE public.tournament_brackets
 SET status='completed',champion_entry_id=v_final.winner_entry_id,completed_at=v_now WHERE id=v_b.id;
 UPDATE public.tournaments SET status='completed',updated_at=v_now WHERE id=p_tournament_id;
 INSERT INTO public.competition_audit_events(tournament_id,actor_id,action,details)
 VALUES(p_tournament_id,auth.uid(),'tournament.completed',
 jsonb_build_object('bracket_id',v_b.id,'champion_entry_id',v_final.winner_entry_id,
 'entrant_count',v_b.entrant_count));
 RETURN jsonb_build_object('ok',true,'code','TOURNAMENT_COMPLETED','message','Tournament completed and standings locked.',
  'tournament_id',p_tournament_id,'bracket_id',v_b.id,
  'champion_entry_id',v_final.winner_entry_id,'standings_count',v_count,
  'status','completed');
END $func$;

CREATE FUNCTION public.get_tournament_bracket(p_tournament_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $func$
DECLARE v_t public.tournaments%ROWTYPE;v_b public.tournament_brackets%ROWTYPE;
 v_matches jsonb;
BEGIN
 IF p_tournament_id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','INVALID_ID','message','Tournament ID is required.');END IF;
 SELECT * INTO v_t FROM public.tournaments WHERE id=p_tournament_id
 AND status IN('registration_open','registration_closed','check_in','in_progress','completed');
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','TOURNAMENT_NOT_FOUND','message','Tournament not publicly available.');END IF;
 SELECT * INTO v_b FROM public.tournament_brackets WHERE tournament_id=v_t.id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','BRACKET_NOT_FOUND','message','Official bracket not available.');END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'match_id',m.id,'round_number',m.round_number,'match_number',m.match_number,
  'status',m.status,'scheduled_at',m.scheduled_at,'next_match_id',m.next_match_id,
  'seed_one',m.seed_one,'seed_two',m.seed_two,
  'slot_one_number',e1.slot_number,'slot_two_number',e2.slot_number,
  'winner_slot_number',ew.slot_number
 ) ORDER BY m.round_number,m.match_number),'[]'::jsonb)
 INTO v_matches FROM public.tournament_bracket_matches m
 LEFT JOIN public.tournament_entries e1 ON e1.id=m.slot_one_entry_id
 LEFT JOIN public.tournament_entries e2 ON e2.id=m.slot_two_entry_id
 LEFT JOIN public.tournament_entries ew ON ew.id=m.winner_entry_id
 WHERE m.bracket_id=v_b.id;
 RETURN jsonb_build_object('ok',true,'code','BRACKET_AVAILABLE','message','Official bracket available.',
 'tournament_id',v_t.id,'bracket_id',v_b.id,'format','single_elimination',
 'status',v_b.status,'entrant_count',v_b.entrant_count,'bracket_size',v_b.bracket_size,
 'total_rounds',v_b.total_rounds,'champion_slot_number',
 (SELECT e.slot_number FROM public.tournament_entries e WHERE e.id=v_b.champion_entry_id),
 'matches',v_matches);
END $func$;

CREATE FUNCTION public.get_my_match_schedule(p_tournament_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $func$
DECLARE v_uid uuid:=auth.uid();v_matches jsonb;
BEGIN
 IF NOT tretmax_internal.valid_actor() THEN RETURN jsonb_build_object('ok',false,'code','UNAUTHENTICATED','message','Sign in to view your matches.');END IF;
 IF p_tournament_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tournaments
 WHERE id=p_tournament_id AND status IN ('registration_open','registration_closed','check_in','in_progress','completed')) THEN
  RETURN jsonb_build_object('ok',false,'code','TOURNAMENT_NOT_FOUND','message','Tournament unavailable.');END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'tournament_id',m.tournament_id,'match_id',m.id,'round_number',m.round_number,'match_number',m.match_number,
  'status',m.status,'scheduled_at',m.scheduled_at,'room_label',m.room_label,
  'own_entry_id',p.entry_id,'own_slot_number',own.slot_number,
  'opponent_slot_number',opp.slot_number,
  'result',CASE WHEN m.winner_entry_id IS NULL THEN 'pending'
    WHEN m.winner_entry_id=p.entry_id THEN 'won' ELSE 'lost' END
 ) ORDER BY m.scheduled_at NULLS LAST,m.round_number,m.match_number),'[]'::jsonb)
 INTO v_matches FROM public.tournament_entry_participants p
 JOIN public.tournament_entries own ON own.id=p.entry_id
 JOIN public.tournament_bracket_matches m ON
   (m.slot_one_entry_id=p.entry_id OR m.slot_two_entry_id=p.entry_id)
 JOIN public.tournaments t ON t.id=m.tournament_id
 LEFT JOIN public.tournament_entries opp ON opp.id=CASE
   WHEN m.slot_one_entry_id=p.entry_id THEN m.slot_two_entry_id ELSE m.slot_one_entry_id END
 WHERE p.user_id=v_uid AND p.tournament_id=m.tournament_id
 AND (p_tournament_id IS NULL OR m.tournament_id=p_tournament_id)
 AND t.status IN('in_progress','completed');
 RETURN jsonb_build_object('ok',true,'code','MATCH_SCHEDULE_AVAILABLE','message','Your official matches available.',
  'matches',v_matches,'match_count',jsonb_array_length(v_matches));
END $func$;

CREATE FUNCTION public.get_match_review_queue(p_tournament_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $func$
DECLARE v_items jsonb;
BEGIN
 IF NOT tretmax_internal.valid_actor() OR
 NOT tretmax_internal.authorized_staff(p_tournament_id,true) THEN
  RETURN jsonb_build_object('ok',false,'code','FORBIDDEN','message','Only event staff can review match evidence.');END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tournament_brackets WHERE tournament_id=p_tournament_id) THEN
  RETURN jsonb_build_object('ok',false,'code','BRACKET_NOT_FOUND','message','Official bracket unavailable.');END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'match_id',m.id,'round_number',m.round_number,'match_number',m.match_number,
  'status',m.status,'scheduled_at',m.scheduled_at,'room_label',m.room_label,
  'slot_one_entry_id',m.slot_one_entry_id,'slot_two_entry_id',m.slot_two_entry_id,
  'submissions',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'submission_id',s.id,'submitting_entry_id',s.submitting_entry_id,
    'claimed_winner_entry_id',s.claimed_winner_entry_id,
    'score',s.score,'evidence_path',s.evidence_path,'submitted_at',s.submitted_at
  ) ORDER BY s.submitted_at),'[]'::jsonb) FROM public.match_result_submissions s
     WHERE s.match_id=m.id AND s.status='pending'),
  'disputes',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'dispute_id',d.id,'reason',d.reason,'evidence_path',d.evidence_path,'opened_at',d.opened_at
  ) ORDER BY d.opened_at),'[]'::jsonb) FROM public.match_disputes d
     WHERE d.match_id=m.id AND d.status='open')
 ) ORDER BY m.round_number,m.match_number),'[]'::jsonb)
 INTO v_items FROM public.tournament_bracket_matches m
 WHERE m.tournament_id=p_tournament_id AND
 (EXISTS(SELECT 1 FROM public.match_result_submissions s WHERE s.match_id=m.id AND s.status='pending')
 OR EXISTS(SELECT 1 FROM public.match_disputes d WHERE d.match_id=m.id AND d.status='open'));
 RETURN jsonb_build_object('ok',true,'code','REVIEW_QUEUE_AVAILABLE','message','Private match review queue.',
 'tournament_id',p_tournament_id,'matches',v_items,'match_count',jsonb_array_length(v_items));
END $func$;

CREATE FUNCTION public.get_tournament_standings(p_tournament_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $func$
DECLARE v_b public.tournament_brackets%ROWTYPE;v_ranks jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.tournaments WHERE id=p_tournament_id AND status='completed')
 THEN RETURN jsonb_build_object('ok',false,'code','TOURNAMENT_NOT_FOUND','message','Completed tournament unavailable.');END IF;
 SELECT * INTO v_b FROM public.tournament_brackets WHERE tournament_id=p_tournament_id AND status='completed';
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','STANDINGS_NOT_FOUND','message','Official standings unavailable.');END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('slot_number',e.slot_number,
 'rank',s.final_rank,'eliminated_round',s.eliminated_round)
 ORDER BY s.final_rank,e.slot_number),'[]'::jsonb)
 INTO v_ranks FROM public.tournament_final_standings s
 JOIN public.tournament_entries e ON e.id=s.entry_id WHERE s.bracket_id=v_b.id;
 RETURN jsonb_build_object('ok',true,'code','STANDINGS_AVAILABLE','message','Official tournament standings.',
 'tournament_id',p_tournament_id,'champion_slot_number',
 (SELECT e.slot_number FROM public.tournament_entries e WHERE e.id=v_b.champion_entry_id),
 'standings',v_ranks);
END $func$;

REVOKE ALL ON FUNCTION public.complete_tournament(uuid),
 public.get_tournament_bracket(uuid),public.get_my_match_schedule(uuid),
 public.get_match_review_queue(uuid),public.get_tournament_standings(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_tournament(uuid),public.get_my_match_schedule(uuid),
 public.get_match_review_queue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tournament_bracket(uuid),
 public.get_tournament_standings(uuid) TO anon,authenticated;
