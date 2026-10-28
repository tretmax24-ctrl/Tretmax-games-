-- Tretmax Games: tournament creation and real tournament feed support
-- Additive migration. Does not rebuild or modify the frontend.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS mode text,
  ADD COLUMN IF NOT EXISTS player_format text,
  ADD COLUMN IF NOT EXISTS check_in_opens_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_in_closes_at timestamptz,
  ADD COLUMN IF NOT EXISTS rules text,
  ADD COLUMN IF NOT EXISTS prize_description text,
  ADD COLUMN IF NOT EXISTS banner_url text;

-- Make created_by convenient for Supabase-authenticated frontend inserts.
ALTER TABLE public.tournaments
  ALTER COLUMN created_by SET DEFAULT auth.uid();

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.tournaments'::regclass
      AND conname = 'tournaments_check_in_dates_valid'
  ) THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT tournaments_check_in_dates_valid
      CHECK (
        check_in_closes_at IS NULL
        OR check_in_opens_at IS NULL
        OR check_in_closes_at >= check_in_opens_at
      );
  END IF;
END
$migration$;

-- Seed a small, editable set of active game choices. Stable slugs keep this idempotent.
INSERT INTO public.games (slug, name, publisher, is_active)
VALUES
  ('free-fire', 'Free Fire', 'Garena', true),
  ('pubg-mobile', 'PUBG Mobile', 'Krafton', true),
  ('call-of-duty-mobile', 'Call of Duty: Mobile', 'Activision', true),
  ('ea-sports-fc-mobile', 'EA SPORTS FC Mobile', 'EA Sports', true),
  ('efootball', 'eFootball', 'Konami', true)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- Keep existing published-tournament reads and add owner access for the creator's records.
DROP POLICY IF EXISTS "Creators can read their own tournaments" ON public.tournaments;
CREATE POLICY "Creators can read their own tournaments"
  ON public.tournaments
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = created_by);

-- Authenticated users may create their own drafts only.
-- Publishing remains outside the ordinary client write path.
DROP POLICY IF EXISTS "Authenticated users can create their own draft tournaments" ON public.tournaments;
CREATE POLICY "Authenticated users can create their own draft tournaments"
  ON public.tournaments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = created_by
    AND status = 'draft'
  );

-- Least-privilege direct grants for these two frontend-facing tables.
REVOKE ALL PRIVILEGES ON TABLE public.games FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.games TO anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.tournaments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.tournaments TO anon, authenticated;
GRANT INSERT ON TABLE public.tournaments TO authenticated;
