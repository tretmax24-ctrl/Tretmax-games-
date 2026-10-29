-- Phase D hardening: cap bracket generation to a bounded, testable MVP size
-- and require explicit slot assignments before persistent seeding.
DO $patch$
DECLARE v_def text:=pg_catalog.pg_get_functiondef('public.generate_tournament_bracket(uuid)'::regprocedure);
 v_target text:=' IF v_n<2 THEN';
 v_replacement text:=E' IF v_n>256 THEN\n'||
  '  RETURN pg_catalog.jsonb_build_object(''ok'',false,''code'',''BRACKET_TOO_LARGE'','||
  '''message'',''MVP brackets currently support up to 256 checked-in entries.'');'||
  E'END IF;\n'||
  ' IF EXISTS(SELECT 1 FROM public.tournament_entries e WHERE e.tournament_id=p_tournament_id'||
  E'\n'||
  ' AND e.status=''checked_in'' AND e.slot_number IS NULL) THEN'||
  E'\n'||
  '  RETURN pg_catalog.jsonb_build_object(''ok'',false,''code'',''MISSING_ENTRY_SLOT'','||
  '''message'',''A checked-in entry has no reserved slot.'');'||
  E'END IF;\n' || v_target;
BEGIN
 IF pg_catalog.strpos(v_def,v_target)=0 OR pg_catalog.strpos(v_def,'''BRACKET_TOO_LARGE''')>0 THEN
  RAISE EXCEPTION 'Unexpected bracket generator revision; migration aborted';
 END IF;
 EXECUTE pg_catalog.replace(v_def,v_target,v_replacement);
END $patch$;
REVOKE ALL ON FUNCTION public.generate_tournament_bracket(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.generate_tournament_bracket(uuid) TO authenticated;
