-- Tretmax Games: secure, single-player free tournament registration.
-- All client registrations must use public.register_for_tournament RPC.
-- Existing tournament publishing, RLS reads, and payment tables are unchanged.

ALTER TABLE public.tournament_entries
  ADD COLUMN IF NOT EXISTS slot_number integer,
  ADD COLUMN IF NOT EXISTS rules_accepted_at timestamptz;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tournament_entries'::regclass
      AND conname = 'tournament_entries_slot_number_positive'
  ) THEN
    ALTER TABLE public.tournament_entries
      ADD CONSTRAINT tournament_entries_slot_number_positive
      CHECK (slot_number IS NULL OR slot_number > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tournament_entries'::regclass
      AND conname = 'tournament_entries_tournament_slot_unique'
  ) THEN
    ALTER TABLE public.tournament_entries
      ADD CONSTRAINT tournament_entries_tournament_slot_unique
      UNIQUE (tournament_id, slot_number);
  END IF;
END
$migration$;

-- Restrict direct data API writes, including INSERTs that used to bypass
-- registration windows, account/game validation and capacity constraints.
ALTER TABLE public.tournament_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can register themselves" ON public.tournament_entries;
REVOKE ALL PRIVILEGES ON TABLE public.tournament_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.tournament_entries TO authenticated;
-- Retain the existing "Users can read their own tournament entries" SELECT policy.

CREATE FUNCTION public.register_for_tournament(
  p_tournament_id uuid,
  p_game_account_id uuid,
  p_team_id uuid,
  p_rules_accepted boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_jwt jsonb := auth.jwt();
  v_tournament public.tournaments%ROWTYPE;
  v_now timestamptz;
  v_entry_id uuid;
  v_existing_entry public.tournament_entries%ROWTYPE;
  v_registered_count integer;
  v_slot_number integer;
  v_constraint_name text;
BEGIN
  -- Authorization is never based on caller-supplied user IDs or user_metadata.
  -- PostgREST validates the JWT signature before invoking this function.
  IF v_uid IS NULL
     OR v_jwt IS NULL
     OR (v_jwt ->> 'role') IS DISTINCT FROM 'authenticated'
     OR (v_jwt ->> 'sub') IS DISTINCT FROM v_uid::text
     OR NOT EXISTS (
       SELECT 1 FROM auth.users AS u
       WHERE u.id = v_uid AND u.deleted_at IS NULL AND u.is_anonymous = false
     )
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'UNAUTHENTICATED',
      'message', 'Sign in with a registered player account to join a tournament.'
    );
  END IF;

  IF p_team_id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'TEAM_NOT_SUPPORTED',
      'message', 'Team registration is not yet available.'
    );
  END IF;

  IF p_rules_accepted IS DISTINCT FROM true THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'RULES_NOT_ACCEPTED',
      'message', 'You must accept the tournament rules to register.'
    );
  END IF;

  IF p_tournament_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'INVALID_TOURNAMENT_ID',
      'message', 'A tournament ID is required.'
    );
  END IF;

  IF p_game_account_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'GAME_ACCOUNT_REQUIRED',
      'message', 'Select your game account to register.'
    );
  END IF;

  -- Serialize registration for this tournament across concurrent transactions.
  -- All client INSERTs are revoked above, so they cannot bypass this lock.
  SELECT t.* INTO v_tournament
  FROM public.tournaments AS t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'TOURNAMENT_NOT_FOUND',
      'message', 'Tournament not found.'
    );
  END IF;

  IF v_tournament.status IS DISTINCT FROM 'registration_open' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'REGISTRATION_NOT_OPEN',
      'message', 'This tournament is not accepting registrations.'
    );
  END IF;

  IF v_tournament.entry_fee_minor <> 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PAID_TOURNAMENT_NOT_SUPPORTED',
      'message', 'Paid tournament registration is not yet available.'
    );
  END IF;

  IF pg_catalog.lower(pg_catalog.btrim(coalesce(v_tournament.player_format, '')))
     NOT IN ('solo', '1v1', 'individual') THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'TEAM_FORMAT_NOT_SUPPORTED',
      'message', 'Only individual (Solo) tournaments are supported for registration.'
    );
  END IF;

  IF v_tournament.max_players IS NULL OR v_tournament.max_players < 2 THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'INVALID_CAPACITY',
      'message', 'The tournament has no valid player capacity.'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.games AS g
    WHERE g.id = v_tournament.game_id AND g.is_active = true
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'GAME_UNAVAILABLE',
      'message', 'The tournament game is no longer available.'
    );
  END IF;

  IF v_tournament.registration_opens_at IS NULL
     OR v_tournament.registration_closes_at IS NULL
     OR v_tournament.registration_opens_at >= v_tournament.registration_closes_at
     OR v_tournament.starts_at IS NULL
     OR v_tournament.registration_closes_at > v_tournament.starts_at
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'INVALID_REGISTRATION_WINDOW',
      'message', 'This tournament has an invalid registration schedule.'
    );
  END IF;

  -- Use wall-clock time after the row lock, not transaction start time.
  v_now := pg_catalog.clock_timestamp();

  IF v_now < v_tournament.registration_opens_at THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'REGISTRATION_NOT_STARTED',
      'message', 'Registration has not opened yet.'
    );
  END IF;

  IF v_now >= v_tournament.registration_closes_at
     OR v_now >= v_tournament.starts_at THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'REGISTRATION_CLOSED',
      'message', 'The registration window has closed.'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.player_game_accounts AS a
    WHERE a.id = p_game_account_id
      AND a.user_id = v_uid
      AND a.game_id = v_tournament.game_id
      AND a.verification_status <> 'rejected'
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'INVALID_GAME_ACCOUNT',
      'message', 'Choose a game account you own for this tournament game.'
    );
  END IF;

  SELECT e.* INTO v_existing_entry
  FROM public.tournament_entries AS e
  WHERE e.tournament_id = p_tournament_id AND e.user_id = v_uid;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ALREADY_REGISTERED',
      'message', 'You are already registered for this tournament.',
      'entry_id', v_existing_entry.id,
      'slot_number', v_existing_entry.slot_number
    );
  END IF;

  -- Count all entries (including withdrawn/disqualified): their slots stay
  -- reserved until a separate, audited withdrawal/slot-release workflow exists.
  SELECT pg_catalog.count(*)::integer INTO v_registered_count
  FROM public.tournament_entries AS e
  WHERE e.tournament_id = p_tournament_id;

  IF v_registered_count >= v_tournament.max_players THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'TOURNAMENT_FULL',
      'message', 'All tournament slots have been taken.',
      'registered_count', v_registered_count,
      'max_players', v_tournament.max_players,
      'slots_remaining', 0
    );
  END IF;

  v_slot_number := v_registered_count + 1;

  BEGIN
    INSERT INTO public.tournament_entries
      (tournament_id, user_id, game_account_id, status, slot_number, rules_accepted_at)
    VALUES
      (p_tournament_id, v_uid, p_game_account_id, 'registered', v_slot_number, v_now)
    RETURNING id INTO v_entry_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
    IF v_constraint_name = 'tournament_entries_tournament_id_user_id_key' THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ALREADY_REGISTERED',
        'message', 'You are already registered for this tournament.'
      );
    ELSIF v_constraint_name = 'tournament_entries_tournament_slot_unique' THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'SLOT_CONFLICT',
        'message', 'A tournament slot changed during registration. Please retry.'
      );
    ELSE
      RAISE;
    END IF;
  END;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'REGISTERED',
    'message', 'Registration confirmed. Your tournament slot is reserved.',
    'tournament_id', p_tournament_id,
    'entry_id', v_entry_id,
    'game_account_id', p_game_account_id,
    'status', 'registered',
    'slot_number', v_slot_number,
    'registered_count', v_registered_count + 1,
    'max_players', v_tournament.max_players,
    'slots_remaining', v_tournament.max_players - (v_registered_count + 1)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.register_for_tournament(uuid, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_tournament(uuid, uuid, uuid, boolean)
  TO authenticated;
