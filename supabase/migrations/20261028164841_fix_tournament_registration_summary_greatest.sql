-- Correct the GREATEST SQL expression in the public registration summary RPC.
-- GREATEST is a SQL conditional expression, not a schema-qualified function.
-- Preserve the existing reviewed function body, owner and EXECUTE grants.

DO $fix$
DECLARE
  v_definition text := pg_catalog.pg_get_functiondef(
    'public.get_tournament_registration_summary(uuid)'::pg_catalog.regprocedure
  );
BEGIN
  IF pg_catalog.strpos(v_definition, 'pg_catalog.greatest(') = 0 THEN
    RAISE EXCEPTION 'Expected GREATEST expression not found; refusing unexpected rewrite';
  END IF;

  v_definition := pg_catalog.replace(
    v_definition,
    'pg_catalog.greatest(',
    'greatest('
  );

  EXECUTE v_definition;
END;
$fix$;

REVOKE ALL ON FUNCTION public.get_tournament_registration_summary(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tournament_registration_summary(uuid)
  TO anon, authenticated;
