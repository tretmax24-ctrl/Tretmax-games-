-- Repair SQL special-form expressions in the previously applied publishing RPC.
-- PostgreSQL NULLIF and COALESCE are expressions, not pg_catalog functions.

DO $repair$
DECLARE
  v_definition text := pg_catalog.pg_get_functiondef('public.publish_tournament(uuid)'::pg_catalog.regprocedure);
BEGIN
  IF pg_catalog.strpos(v_definition, 'pg_catalog.nullif(') = 0
     OR pg_catalog.strpos(v_definition, 'pg_catalog.coalesce(') = 0
  THEN
    RAISE EXCEPTION 'Expected publishing RPC expression forms were not found; refusing blind rewrite';
  END IF;

  v_definition := pg_catalog.replace(v_definition, 'pg_catalog.nullif(', 'nullif(');
  v_definition := pg_catalog.replace(v_definition, 'pg_catalog.coalesce(', 'coalesce(');
  EXECUTE v_definition;
END;
$repair$;

REVOKE ALL ON FUNCTION public.publish_tournament(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_tournament(uuid) TO authenticated;
