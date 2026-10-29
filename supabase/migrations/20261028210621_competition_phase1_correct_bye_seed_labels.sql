-- Correct the initial seed label (not winner advancement) for a bye.
DO $fix$
DECLARE v_definition text:=pg_catalog.pg_get_functiondef('public.generate_tournament_bracket(uuid)'::regprocedure);
v_bad text:='coalesce(v_seed_one*(CASE WHEN v_one IS NOT NULL THEN 1 ELSE 0 END),' || E'\n' || '        v_seed_two)';
v_good text:='(CASE WHEN v_one IS NOT NULL THEN v_seed_one ELSE v_seed_two END)';
BEGIN
 IF pg_catalog.strpos(v_definition,v_bad)=0 THEN
  RAISE EXCEPTION 'Original seed expression not found; refused rewrite';
 END IF;
 EXECUTE pg_catalog.replace(v_definition,v_bad,v_good);
END $fix$;
REVOKE ALL ON FUNCTION public.generate_tournament_bracket(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.generate_tournament_bracket(uuid) TO authenticated;
