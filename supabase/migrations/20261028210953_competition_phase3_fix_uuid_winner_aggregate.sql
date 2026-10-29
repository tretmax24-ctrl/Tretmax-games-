-- Runtime fix: UUIDs do not support MIN() in this Postgres installation.
-- Count distinct winner claims and select a representative via array_agg.
DO $fix$
DECLARE v_def text:=pg_catalog.pg_get_functiondef('public.verify_match_result(uuid,text,text)'::regprocedure);
BEGIN
 IF pg_catalog.strpos(v_def,'min(claimed_winner_entry_id)')=0 THEN
  RAISE EXCEPTION 'Expected UUID aggregate not found; refused rewrite';
 END IF;
 EXECUTE pg_catalog.replace(v_def,
  'min(claimed_winner_entry_id)',
  '(array_agg(claimed_winner_entry_id))[1]');
END $fix$;
REVOKE ALL ON FUNCTION public.verify_match_result(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verify_match_result(uuid,text,text) TO authenticated;
