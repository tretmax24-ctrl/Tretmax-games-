-- Phase A: private official single-elimination bracket structures and deterministic generation.
-- Compatible with the current private tournament_entries and tournament_entry_participants model.
CREATE SCHEMA IF NOT EXISTS tretmax_internal;
REVOKE ALL ON SCHEMA tretmax_internal FROM PUBLIC, anon, authenticated;

CREATE FUNCTION tretmax_internal.valid_actor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT auth.uid() IS NOT NULL
 AND auth.jwt()->>'role'='authenticated'
 AND auth.jwt()->>'sub'=auth.uid()::text
 AND EXISTS (SELECT 1 FROM auth.users u
   WHERE u.id=auth.uid() AND u.is_anonymous=false AND u.deleted_at IS NULL);
$$;

CREATE FUNCTION tretmax_internal.authorized_staff(
 p_tournament_id uuid, p_allow_referee boolean DEFAULT false
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT tretmax_internal.valid_actor() AND (
   EXISTS (SELECT 1 FROM auth.users u
     WHERE u.id=auth.uid()
     AND u.raw_app_meta_data->>'tretmax_role'='owner'
     AND auth.jwt()->'app_metadata'->>'tretmax_role'='owner')
   OR EXISTS (SELECT 1 FROM public.tournaments t JOIN auth.users u ON u.id=auth.uid()
     WHERE t.id=p_tournament_id AND t.created_by=auth.uid()
       AND u.raw_app_meta_data->>'tretmax_role'='tournament_manager'
       AND auth.jwt()->'app_metadata'->>'tretmax_role'='tournament_manager')
   OR (p_allow_referee AND EXISTS(SELECT 1 FROM public.tournament_staff s
        WHERE s.tournament_id=p_tournament_id AND s.user_id=auth.uid() AND s.staff_role='referee'))
 );
$$;
REVOKE ALL ON FUNCTION tretmax_internal.valid_actor(),tretmax_internal.authorized_staff(uuid,boolean)
 FROM PUBLIC,anon,authenticated;

CREATE TABLE public.tournament_brackets (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 tournament_id uuid NOT NULL UNIQUE REFERENCES public.tournaments(id) ON DELETE RESTRICT,
 bracket_format text NOT NULL DEFAULT 'single_elimination'
  CHECK (bracket_format='single_elimination'),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
 entrant_count integer NOT NULL CHECK (entrant_count>=2),
 bracket_size integer NOT NULL CHECK (bracket_size>=2 AND (bracket_size & (bracket_size - 1))=0),
 total_rounds integer NOT NULL CHECK (total_rounds>=1),
 champion_entry_id uuid REFERENCES public.tournament_entries(id) ON DELETE RESTRICT,
 generated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 generated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 completed_at timestamptz,
 CONSTRAINT bracket_completion_consistent CHECK (
  (status='active' AND completed_at IS NULL AND champion_entry_id IS NULL)
  OR (status='completed' AND completed_at IS NOT NULL AND champion_entry_id IS NOT NULL))
);
CREATE TABLE public.tournament_bracket_matches (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 bracket_id uuid NOT NULL REFERENCES public.tournament_brackets(id) ON DELETE RESTRICT,
 tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE RESTRICT,
 round_number integer NOT NULL CHECK(round_number>=1),
 match_number integer NOT NULL CHECK(match_number>=1),
 next_match_id uuid,
 next_slot integer CHECK (next_slot IN (1,2)),
 seed_one integer, seed_two integer,
 slot_one_entry_id uuid REFERENCES public.tournament_entries(id) ON DELETE RESTRICT,
 slot_two_entry_id uuid REFERENCES public.tournament_entries(id) ON DELETE RESTRICT,
 winner_entry_id uuid REFERENCES public.tournament_entries(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','disputed','completed','bye','forfeit')),
 scheduled_at timestamptz,
 room_label text,
 verified_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 UNIQUE(bracket_id,round_number,match_number),
 CONSTRAINT bracket_match_distinct_opponents CHECK (
  slot_one_entry_id IS NULL OR slot_two_entry_id IS NULL OR slot_one_entry_id<>slot_two_entry_id),
 CONSTRAINT bracket_match_next_pair CHECK ((next_match_id IS NULL)=(next_slot IS NULL)),
 CONSTRAINT bracket_match_winner_is_opponent CHECK(
  winner_entry_id IS NULL OR winner_entry_id=slot_one_entry_id OR winner_entry_id=slot_two_entry_id),
 CONSTRAINT bracket_match_terminal_consistency CHECK(
  (status IN ('completed','forfeit','bye') AND winner_entry_id IS NOT NULL AND completed_at IS NOT NULL)
  OR (status NOT IN ('completed','forfeit','bye') AND winner_entry_id IS NULL AND completed_at IS NULL)
 )
);
ALTER TABLE public.tournament_bracket_matches
 ADD CONSTRAINT bracket_match_next_fk FOREIGN KEY (next_match_id)
 REFERENCES public.tournament_bracket_matches(id) ON DELETE RESTRICT;

CREATE TABLE public.competition_audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tournament_id uuid REFERENCES public.tournaments(id) ON DELETE RESTRICT,
 match_id uuid REFERENCES public.tournament_bracket_matches(id) ON DELETE RESTRICT,
 actor_id uuid,
 action text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 happened_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
ALTER TABLE public.tournament_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_bracket_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tournament_brackets,public.tournament_bracket_matches,public.competition_audit_events
 FROM PUBLIC,anon,authenticated;
-- No direct client reads or writes, only narrowly reviewed RPC projections.

-- Protect the old matches table's unused client write surface without changing its published reads.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.matches FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.generate_tournament_bracket(p_tournament_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $func$
DECLARE
 v_t public.tournaments%ROWTYPE;
 v_bracket uuid;
 v_entrants uuid[];
 v_n integer;
 v_size integer:=2;
 v_rounds integer:=1;
 v_seeds integer[]:=ARRAY[1,2]::integer[];
 v_new_seeds integer[];
 v_i integer;
 v_j integer;
 v_round integer;
 v_match_num integer;
 v_match uuid;
 v_next uuid;
 v_one uuid;
 v_two uuid;
 v_seed_one integer;
 v_seed_two integer;
 v_byes integer:=0;
 v_format_size integer;
 v_bad_count integer;
 v_now timestamptz;
BEGIN
 IF NOT tretmax_internal.valid_actor() OR
    NOT tretmax_internal.authorized_staff(p_tournament_id,false) THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','FORBIDDEN',
    'message','Only the trusted tournament organizer can generate a bracket.');
 END IF;
 IF p_tournament_id IS NULL THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','INVALID_ID','message','Tournament ID is required.');
 END IF;
 -- Single global tournament-row lock serializes bracket generation against
 -- registration and check-in status changes, and another generation attempt.
 SELECT * INTO v_t FROM public.tournaments WHERE id=p_tournament_id FOR UPDATE;
 IF NOT FOUND THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','TOURNAMENT_NOT_FOUND','message','Tournament unavailable.');
 END IF;
 SELECT id INTO v_bracket FROM public.tournament_brackets WHERE tournament_id=p_tournament_id;
 IF v_bracket IS NOT NULL THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','BRACKET_EXISTS',
    'message','Official bracket already generated.','bracket_id',v_bracket);
 END IF;
 IF v_t.entry_fee_minor<>0 THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','PAID_EVENT_UNSUPPORTED','message','Paid brackets are not enabled.');
 END IF;
 IF v_t.format<>'single_elimination' THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','UNSUPPORTED_FORMAT','message','Only single-elimination events are supported.');
 END IF;
 IF v_t.status<>'check_in' THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','CHECK_IN_REQUIRED','message','Generate after scheduled check-in closes.');
 END IF;
 v_now:=pg_catalog.clock_timestamp();
 IF v_t.check_in_closes_at IS NULL OR v_t.check_in_opens_at IS NULL
 OR v_t.check_in_opens_at>=v_t.check_in_closes_at OR v_now<v_t.check_in_closes_at THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','CHECK_IN_NOT_CLOSED','message','Wait for the check-in deadline.');
 END IF;
 IF EXISTS(SELECT 1 FROM public.matches WHERE tournament_id=p_tournament_id) THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','LEGACY_MATCHES_EXIST','message','Existing legacy matches require migration before bracket generation.');
 END IF;

 v_format_size:=CASE pg_catalog.lower(pg_catalog.btrim(coalesce(v_t.player_format,'')))
  WHEN 'solo' THEN 1 WHEN '1v1' THEN 1 WHEN 'individual' THEN 1
  WHEN 'duo' THEN 2 WHEN 'trio' THEN 3 WHEN 'squad' THEN 4 ELSE NULL END;
 IF v_format_size IS NULL THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','UNSUPPORTED_PLAYER_FORMAT','message','Unsupported player format.');
 END IF;

 SELECT pg_catalog.array_agg(e.id ORDER BY e.slot_number,e.registered_at,e.id)
 INTO v_entrants FROM public.tournament_entries e
 WHERE e.tournament_id=p_tournament_id AND e.status='checked_in';
 v_n:=coalesce(pg_catalog.array_length(v_entrants,1),0);
 IF v_n<2 THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','INSUFFICIENT_ENTRANTS','message','At least two fully checked-in entries are required.','eligible_count',v_n);
 END IF;
 -- Check each selected entry's frozen participant snapshot and original format.
 SELECT count(*) INTO v_bad_count FROM public.tournament_entries e
 WHERE e.tournament_id=p_tournament_id AND e.status='checked_in'
 AND (
  (v_format_size=1 AND e.team_id IS NOT NULL)
  OR (v_format_size>1 AND (e.team_id IS NULL
       OR NOT EXISTS(SELECT 1 FROM public.teams t
         WHERE t.id=e.team_id AND t.game_id=v_t.game_id AND t.roster_state='locked')))
  OR (SELECT count(*) FROM public.tournament_entry_participants p
      WHERE p.entry_id=e.id)<>v_format_size
  OR EXISTS(SELECT 1 FROM public.tournament_entry_participants p
      WHERE p.entry_id=e.id AND p.attendance_status<>'checked_in')
 );
 IF v_bad_count>0 THEN
  RETURN pg_catalog.jsonb_build_object('ok',false,'code','INVALID_CHECKED_IN_ROSTER','message','Some checked-in entrants have an invalid roster snapshot.');
 END IF;

 WHILE v_size<v_n LOOP
  v_new_seeds:=ARRAY[]::integer[];
  FOR v_i IN 1..pg_catalog.array_length(v_seeds,1) LOOP
    v_new_seeds:=v_new_seeds || v_seeds[v_i] || (v_size*2+1-v_seeds[v_i]);
  END LOOP;
  v_seeds:=v_new_seeds;
  v_size:=v_size*2;
  v_rounds:=v_rounds+1;
 END LOOP;

 INSERT INTO public.tournament_brackets(tournament_id,entrant_count,bracket_size,total_rounds,generated_by)
 VALUES(p_tournament_id,v_n,v_size,v_rounds,auth.uid()) RETURNING id INTO v_bracket;

 FOR v_round IN 1..v_rounds LOOP
  FOR v_match_num IN 1..(v_size/(2^v_round)::integer) LOOP
   INSERT INTO public.tournament_bracket_matches
    (bracket_id,tournament_id,round_number,match_number,status)
   VALUES(v_bracket,p_tournament_id,v_round,v_match_num,'pending');
  END LOOP;
 END LOOP;
 UPDATE public.tournament_bracket_matches m
 SET next_match_id=n.id,
     next_slot=CASE WHEN m.match_number%2=1 THEN 1 ELSE 2 END
 FROM public.tournament_bracket_matches n
 WHERE m.bracket_id=v_bracket AND n.bracket_id=v_bracket
   AND n.round_number=m.round_number+1
   AND n.match_number=(m.match_number+1)/2;

 FOR v_match_num IN 1..(v_size/2) LOOP
  v_seed_one:=v_seeds[2*v_match_num-1];
  v_seed_two:=v_seeds[2*v_match_num];
  v_one:=CASE WHEN v_seed_one<=v_n THEN v_entrants[v_seed_one] ELSE NULL END;
  v_two:=CASE WHEN v_seed_two<=v_n THEN v_entrants[v_seed_two] ELSE NULL END;
  SELECT id,next_match_id INTO v_match,v_next
  FROM public.tournament_bracket_matches
  WHERE bracket_id=v_bracket AND round_number=1 AND match_number=v_match_num;
  IF v_one IS NULL AND v_two IS NULL THEN
   RAISE EXCEPTION 'Unexpected empty first-round pair; abort bracket';
  END IF;
  UPDATE public.tournament_bracket_matches SET
    seed_one=CASE WHEN v_one IS NOT NULL THEN v_seed_one ELSE NULL END,
    seed_two=CASE WHEN v_two IS NOT NULL THEN v_seed_two ELSE NULL END,
    slot_one_entry_id=v_one,slot_two_entry_id=v_two,
    status=CASE WHEN v_one IS NOT NULL AND v_two IS NOT NULL THEN 'ready' ELSE 'bye' END,
    winner_entry_id=CASE WHEN v_one IS NULL THEN v_two WHEN v_two IS NULL THEN v_one ELSE NULL END,
    completed_at=CASE WHEN v_one IS NULL OR v_two IS NULL THEN v_now ELSE NULL END
  WHERE id=v_match;
  IF v_one IS NULL OR v_two IS NULL THEN
    v_byes:=v_byes+1;
    UPDATE public.tournament_bracket_matches p SET
      slot_one_entry_id=CASE WHEN v_match_num%2=1 THEN coalesce(v_one,v_two) ELSE p.slot_one_entry_id END,
      slot_two_entry_id=CASE WHEN v_match_num%2=0 THEN coalesce(v_one,v_two) ELSE p.slot_two_entry_id END,
      seed_one=CASE WHEN v_match_num%2=1 THEN coalesce(v_seed_one*(CASE WHEN v_one IS NOT NULL THEN 1 ELSE 0 END),
        v_seed_two) ELSE p.seed_one END,
      seed_two=CASE WHEN v_match_num%2=0 THEN CASE WHEN v_one IS NULL THEN v_seed_two ELSE v_seed_one END ELSE p.seed_two END
    WHERE p.id=v_next;
    INSERT INTO public.competition_audit_events(tournament_id,match_id,actor_id,action)
    VALUES(p_tournament_id,v_match,auth.uid(),'bracket.bye_advanced');
  END IF;
 END LOOP;

 -- Matches with both known bracket opponents become ready.
 UPDATE public.tournament_bracket_matches SET status='ready'
 WHERE bracket_id=v_bracket AND status='pending'
   AND slot_one_entry_id IS NOT NULL AND slot_two_entry_id IS NOT NULL;
 UPDATE public.tournaments SET status='in_progress',updated_at=v_now WHERE id=p_tournament_id;
 INSERT INTO public.competition_audit_events(tournament_id,actor_id,action,details)
 VALUES(p_tournament_id,auth.uid(),'bracket.generated',
    pg_catalog.jsonb_build_object('bracket_id',v_bracket,'entrant_count',v_n,
    'bracket_size',v_size,'total_rounds',v_rounds,'byes',v_byes));
 RETURN pg_catalog.jsonb_build_object('ok',true,'code','BRACKET_GENERATED',
  'message','Official single-elimination bracket generated.',
  'bracket_id',v_bracket,'tournament_id',p_tournament_id,
  'entrant_count',v_n,'bracket_size',v_size,'total_rounds',v_rounds,'byes',v_byes,
  'tournament_status','in_progress');
END;
$func$;
REVOKE ALL ON FUNCTION public.generate_tournament_bracket(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.generate_tournament_bracket(uuid) TO authenticated;
