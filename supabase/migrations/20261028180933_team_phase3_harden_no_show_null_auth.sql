-- Security hardening: NULL (no trusted role) must be denied explicitly.
-- "IF NOT v_authorized" treats NULL as not-true and can skip a denial.
DO $fix$
DECLARE v_definition text:=pg_catalog.pg_get_functiondef(
 'public.mark_entry_no_show(uuid,text)'::regprocedure);
BEGIN
 IF pg_catalog.strpos(v_definition,'IF NOT v_authorized THEN')=0 THEN
  RAISE EXCEPTION 'Unexpected no-show authorizer; refusing patch';
 END IF;
 EXECUTE pg_catalog.replace(v_definition,
  'IF NOT v_authorized THEN','IF v_authorized IS DISTINCT FROM true THEN');
END $fix$;
REVOKE ALL ON FUNCTION public.mark_entry_no_show(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_entry_no_show(uuid,text) TO authenticated;
