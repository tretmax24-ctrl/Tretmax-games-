-- Tretmax Games MVP: owner-only publishing of owned, valid draft tournaments.
-- This deliberately does not grant UPDATE on public.tournaments to client roles.
-- SECURITY DEFINER is narrowly scoped to one status transition; role is checked
-- against both the signed JWT claims and the authoritative auth.users metadata.

CREATE FUNCTION public.publish_tournament(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_jwt jsonb := auth.jwt();
  v_tournament public.tournaments%ROWTYPE;
  v_now timestamptz := pg_catalog.now();
  v_updated_id uuid;
BEGIN
  IF v_user_id IS NULL
     OR v_jwt IS NULL
     OR (v_jwt ->> 'role') IS DISTINCT FROM 'authenticated'
     OR (v_jwt ->> 'sub') IS DISTINCT FROM v_user_id::text
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'UNAUTHENTICATED',
      'message', 'Sign in with a valid Supabase Auth session.'
    );
  END IF;

  IF (v_jwt -> 'app_metadata' ->> 'tretmax_role') IS DISTINCT FROM 'owner'
     OR NOT EXISTS (
       SELECT 1
       FROM auth.users AS u
       WHERE u.id = v_user_id
         AND u.raw_app_meta_data ->> 'tretmax_role' = 'owner'
     )
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'FORBIDDEN',
      'message', 'Only the platform Owner may publish tournaments.'
    );
  END IF;

  IF p_tournament_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'INVALID_ID', 'message', 'A tournament ID is required.'
    );
  END IF;

  -- Lock only the caller's tournament. A caller cannot publish someone else's draft.
  SELECT t.* INTO v_tournament
  FROM public.tournaments AS t
  WHERE t.id = p_tournament_id AND t.created_by = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'NOT_FOUND_OR_NOT_OWNED',
      'message', 'Tournament not found or not owned by this account.'
    );
  END IF;

  IF v_tournament.status <> 'draft' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'NOT_DRAFT',
      'message', 'Only a draft tournament can be published.'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.games AS g
    WHERE g.id = v_tournament.game_id AND g.is_active = true
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'GAME_INACTIVE',
      'message', 'Choose an active game before publishing.'
    );
  END IF;

  IF pg_catalog.nullif(pg_catalog.btrim(v_tournament.title), '') IS NULL
     OR pg_catalog.nullif(pg_catalog.btrim(pg_catalog.coalesce(v_tournament.description, '')), '') IS NULL
     OR pg_catalog.nullif(pg_catalog.btrim(pg_catalog.coalesce(v_tournament.rules, '')), '') IS NULL
     OR pg_catalog.nullif(pg_catalog.btrim(pg_catalog.coalesce(v_tournament.mode, '')), '') IS NULL
     OR pg_catalog.nullif(pg_catalog.btrim(pg_catalog.coalesce(v_tournament.player_format, '')), '') IS NULL
     OR v_tournament.max_players IS NULL
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'INCOMPLETE_DRAFT',
      'message', 'Title, description, rules, mode, player format and maximum players are required.'
    );
  END IF;

  IF v_tournament.entry_fee_minor <> 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PAID_REGISTRATION_NOT_ENABLED',
      'message', 'Paid tournaments cannot be published until payment enforcement is available.'
    );
  END IF;

  IF v_tournament.starts_at IS NULL OR v_tournament.starts_at <= v_now THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'INVALID_START_TIME',
      'message', 'Tournament start must be in the future.'
    );
  END IF;

  IF v_tournament.registration_opens_at IS NULL
     OR v_tournament.registration_closes_at IS NULL
     OR v_tournament.registration_closes_at > v_tournament.starts_at
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'INVALID_REGISTRATION_WINDOW',
      'message', 'Registration opening and closing times are required, and registration must close by tournament start.'
    );
  END IF;

  IF v_tournament.registration_opens_at > v_now THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'REGISTRATION_NOT_OPEN',
      'message', 'Registration has not opened. Publish when the registration window begins.'
    );
  END IF;

  IF v_tournament.registration_closes_at <= v_now THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'REGISTRATION_CLOSED',
      'message', 'Registration has already closed. Update the draft schedule first.'
    );
  END IF;

  IF (v_tournament.check_in_opens_at IS NULL) <> (v_tournament.check_in_closes_at IS NULL)
     OR (
       v_tournament.check_in_opens_at IS NOT NULL
       AND (
         v_tournament.check_in_opens_at < v_tournament.registration_closes_at
         OR v_tournament.check_in_closes_at > v_tournament.starts_at
       )
     )
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'INVALID_CHECK_IN_WINDOW',
      'message', 'Check-in must have a valid opening and closing time between registration closing and tournament start.'
    );
  END IF;

  UPDATE public.tournaments AS t
  SET status = 'registration_open', updated_at = v_now
  WHERE t.id = p_tournament_id
    AND t.created_by = v_user_id
    AND t.status = 'draft'
  RETURNING t.id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'STATE_CHANGED',
      'message', 'Tournament is no longer a draft. Refresh and try again.'
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PUBLISHED',
    'message', 'Tournament published and registration opened.',
    'tournament_id', v_updated_id,
    'status', 'registration_open'
  );
END;
$function$;

-- PostgreSQL grants EXECUTE to PUBLIC on newly created functions by default.
-- Clear those permissions and allow only signed-in callers to reach this RPC.
REVOKE ALL ON FUNCTION public.publish_tournament(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_tournament(uuid) TO authenticated;
