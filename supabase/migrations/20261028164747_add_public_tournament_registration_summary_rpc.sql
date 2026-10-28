-- Tretmax Games: publicly readable, read-only reservation summary.
-- Mirrors register_for_tournament: every tournament_entries row reserves one slot,
-- including withdrawn and disqualified rows. Do not expose participant details.
--
-- The tournament visibility check deliberately mirrors the existing
-- "Published tournaments are publicly readable" RLS policy. For drafts, cancelled
-- tournaments, and unknown IDs return the same error to avoid existence leaks.
--
-- FOR SHARE on the tournament row serializes this count with the registration
-- RPC's SELECT ... FOR UPDATE lock, so a completed registration is counted
-- before a waiting summary is returned.

CREATE FUNCTION public.get_tournament_registration_summary(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tournament_id uuid;
  v_max_players integer;
  v_registered_count integer;
  v_slots_remaining integer;
BEGIN
  IF p_tournament_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'INVALID_TOURNAMENT_ID',
      'message', 'A tournament ID is required.'
    );
  END IF;

  -- SECDEF is necessary because direct tournament_entries SELECT is private.
  -- Read and lock only a tournament that is public under the existing policy.
  SELECT t.id, t.max_players
  INTO v_tournament_id, v_max_players
  FROM public.tournaments AS t
  WHERE t.id = p_tournament_id
    AND t.status IN (
      'registration_open',
      'registration_closed',
      'check_in',
      'in_progress',
      'completed'
    )
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'TOURNAMENT_NOT_FOUND',
      'message', 'Tournament not found or not publicly available.'
    );
  END IF;

  -- Exactly the same capacity rule as register_for_tournament:
  -- count every existing entry, regardless of entry status or slot_number.
  SELECT pg_catalog.count(*)::integer
  INTO v_registered_count
  FROM public.tournament_entries AS e
  WHERE e.tournament_id = v_tournament_id;

  -- An undefined capacity stays undefined (NULL), not falsely "zero".
  -- Saturate at zero if imported/legacy data exceed the configured cap.
  IF v_max_players IS NULL THEN
    v_slots_remaining := NULL;
  ELSE
    v_slots_remaining := pg_catalog.greatest(
      0,
      v_max_players - v_registered_count
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'SUMMARY_AVAILABLE',
    'message', 'Tournament registration summary available.',
    'tournament_id', v_tournament_id,
    'registered_count', v_registered_count,
    'max_players', v_max_players,
    'slots_remaining', v_slots_remaining
  );
END;
$function$;

-- Public summary reads are allowed without exposing tournament_entries rows.
-- PostgreSQL defaults new functions to PUBLIC EXECUTE: explicitly reset grants.
REVOKE ALL ON FUNCTION public.get_tournament_registration_summary(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tournament_registration_summary(uuid)
  TO anon, authenticated;
