import { games as artworkGames, type Game, type Tournament } from '../data/tournaments'
import { getSupabaseClient } from '../lib/supabase'
import type { TournamentDraftInput } from './tournamentDrafts'

export type SupabaseGame = Game & { slug: string; databaseId: string }
export type TournamentRecord = Tournament & {
  gameName: string
  bannerUrl: string | null
  prizeDescription: string | null
  isDatabaseRecord: true
  players: number | null
}

type GameRow = { id: string; slug: string; name: string; is_active: boolean }
type TournamentRow = {
  id: string; game_id: string; title: string; description: string | null; format: string; status: string
  starts_at: string | null; registration_opens_at: string | null; registration_closes_at: string | null
  check_in_opens_at: string | null; check_in_closes_at: string | null; max_players: number | null
  entry_fee_minor: number | string; prize_pool_minor: number | string; currency_code: string
  created_by: string | null; mode: string | null; player_format: string | null; rules: string | null
  prize_description: string | null; banner_url: string | null; games?: { slug: string; name: string } | null
}

const gameArtworkBySlug: Record<string, Game> = {
  'call-of-duty-mobile': artworkGames.find(game => game.id === 'codm')!,
  'ea-sports-fc-mobile': artworkGames.find(game => game.id === 'fc25')!,
  efootball: artworkGames.find(game => game.id === 'efootball')!,
  'free-fire': artworkGames.find(game => game.id === 'freefire')!,
  'pubg-mobile': artworkGames.find(game => game.id === 'pubgm')!,
  '8ballpool': artworkGames.find(game => game.id === '8ballpool')!,
  chess: artworkGames.find(game => game.id === 'chess')!,
}

function toGame(row: GameRow): SupabaseGame {
  const fallback = gameArtworkBySlug[row.slug]
  const slug = row.slug
  return {
    id: slug,
    databaseId: row.id,
    slug,
    name: row.name,
    shortName: fallback?.shortName ?? row.name.slice(0, 12).toUpperCase(),
    category: fallback?.category ?? 'Competitive',
    accent: fallback?.accent ?? 'lime',
    art: fallback?.art ?? 'arena-stage',
  }
}

export async function listActiveGames(): Promise<SupabaseGame[]> {
  const { data, error } = await getSupabaseClient()
    .from('games')
    .select('id, slug, name, is_active')
    .eq('is_active', true)
    .order('name', { ascending: true })
  if (error) throw error
  return ((data ?? []) as GameRow[]).map(toGame)
}

const tournamentFields = 'id, game_id, title, description, format, status, starts_at, registration_opens_at, registration_closes_at, check_in_opens_at, check_in_closes_at, max_players, entry_fee_minor, prize_pool_minor, currency_code, created_by, mode, player_format, rules, prize_description, banner_url, games(slug, name)'

function toTournament(row: TournamentRow): TournamentRecord {
  const slug = row.games?.slug ?? ''
  const startsAt = row.starts_at
  const dateLabel = startsAt
    ? `${new Date(startsAt).toLocaleDateString('en-UG', { day: '2-digit', month: 'short', timeZone: 'Africa/Kampala' }).toUpperCase()} · ${new Date(startsAt).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala' })} EAT`
    : 'DATE TO BE ANNOUNCED'
  const statusLabels: Record<string, Tournament['status']> = {
    draft: 'Draft', registration_open: 'Registration open', registration_closed: 'Registration closed',
    check_in: 'Check in', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled',
  }
  const status = statusLabels[row.status] ?? row.status as Tournament['status']
  const rules = row.rules?.split('\n').map(rule => rule.trim()).filter(Boolean) ?? []
  const schedule = [
    row.check_in_opens_at && { time: new Date(row.check_in_opens_at).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala' }), label: 'Check-in opens' },
    row.check_in_closes_at && { time: new Date(row.check_in_closes_at).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala' }), label: 'Check-in closes' },
    startsAt && { time: new Date(startsAt).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala' }), label: 'Tournament begins' },
  ].filter((item): item is { time: string; label: string } => Boolean(item))
  return {
    id: row.id,
    gameId: slug,
    gameName: row.games?.name ?? 'Game unavailable',
    title: row.title,
    format: [row.player_format, row.mode, row.format.replaceAll('_', ' ')].filter(Boolean).join(' · '),
    start: startsAt ?? '',
    dateLabel,
    entryFee: Number(row.entry_fee_minor),
    prizePool: Number(row.prize_pool_minor),
    players: null,
    capacity: row.max_players ?? 0,
    status,
    description: row.description ?? '',
    rules,
    schedule,
    bannerUrl: row.banner_url,
    prizeDescription: row.prize_description,
    registrationClosesAt: row.registration_closes_at,
    isDatabaseRecord: true,
  }
}

export async function listPublishedTournaments(): Promise<TournamentRecord[]> {
  const { data, error } = await getSupabaseClient()
    .from('tournaments')
    .select(tournamentFields)
    .in('status', ['registration_open', 'registration_closed', 'check_in', 'in_progress', 'completed'])
    .order('starts_at', { ascending: true })
  if (error) throw error
  return ((data ?? []) as unknown as TournamentRow[]).map(toTournament)
}

export async function getPublishedTournament(id: string): Promise<TournamentRecord | null> {
  const { data, error } = await getSupabaseClient()
    .from('tournaments')
    .select(tournamentFields)
    .eq('id', id)
    .in('status', ['registration_open', 'registration_closed', 'check_in', 'in_progress', 'completed'])
    .maybeSingle()
  if (error) throw error
  return data ? toTournament(data as unknown as TournamentRow) : null
}

export type OwnedTournamentDraft = TournamentRecord & { createdBy: string }

type PublishTournamentResponse = {
  ok?: boolean
  code?: string
  message?: string
  tournament_id?: string
  status?: string
}

export type RegistrationResult = {
  ok: boolean
  code: string
  message: string
  entry_id?: string
  status?: string
  slots_remaining?: number
}

export async function listMyTournamentDrafts(): Promise<{ userId: string; drafts: OwnedTournamentDraft[] }> {
  const supabase = getSupabaseClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError && !/session missing|not authenticated/i.test(authError.message)) throw authError
  if (!authData.user) return { userId: '', drafts: [] }
  const { data, error } = await supabase
    .from('tournaments')
    .select(tournamentFields)
    .eq('created_by', authData.user.id)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
  if (error) throw error
  return {
    userId: authData.user.id,
    drafts: ((data ?? []) as unknown as TournamentRow[]).map(row => ({ ...toTournament(row), createdBy: authData.user.id })),
  }
}

export async function registerForTournament(tournamentId: string, gameAccountId: string): Promise<RegistrationResult> {
  const supabase = getSupabaseClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!authData.user) return { ok: false, code: 'LOGIN_REQUIRED', message: 'Sign in before registering for a tournament.' }
  const { data, error } = await supabase.rpc('register_for_tournament', {
    p_tournament_id: tournamentId,
    p_game_account_id: gameAccountId,
    p_team_id: null,
    p_rules_accepted: true,
  })
  if (error) throw error
  const result = data as RegistrationResult | null
  if (!result || typeof result.ok !== 'boolean') throw new Error('The registration service returned an invalid response.')
  return result
}

export async function publishTournamentRecord(tournamentId: string): Promise<{ id: string; status: string }> {
  const supabase = getSupabaseClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!authData.user) throw new Error('Sign in with Supabase Auth before publishing a tournament.')
  const { data, error } = await supabase.rpc('publish_tournament', { p_tournament_id: tournamentId })
  if (error) throw error
  const result = data as PublishTournamentResponse | null
  if (!result?.ok) throw new Error(result?.message || 'The tournament could not be published.')
  if (result.tournament_id && result.tournament_id !== tournamentId) throw new Error('The publish response returned an unexpected tournament.')
  if (result.status !== 'registration_open') throw new Error(`The tournament was not opened for registration (status: ${result.status ?? 'unknown'}).`)

  const published = await listPublishedTournaments()
  if (!published.some(tournament => tournament.id === tournamentId)) {
    throw new Error('The RPC reported success, but the tournament was not visible in the public listing. Publishing is unverified.')
  }
  return { id: tournamentId, status: result.status }
}

export async function createTournamentRecord(input: TournamentDraftInput): Promise<{ id: string; title: string }> {
  const supabase = getSupabaseClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!authData.user) throw new Error('Sign in with Supabase Auth before creating a tournament draft. The current login and registration screens are demo-only and do not create a session.')
  const role = authData.user.app_metadata?.tretmax_role
  if (role !== 'owner' && role !== 'tournament_manager') {
    throw new Error('Your account does not have the server-issued tournaments.manage permission. Ask the platform Owner to approve an organizer role.')
  }

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, slug, name')
    .eq('slug', input.gameId)
    .eq('is_active', true)
    .maybeSingle()
  if (gameError) throw gameError
  if (!game) throw new Error(`No active public.games row exists for ${input.gameId}. Refresh the game list and try again.`)

  const formats: Record<string, string> = {
    'Single elimination': 'single_elimination',
    'Double elimination': 'double_elimination',
    'Round robin': 'round_robin',
    'Battle royale': 'battle_royale',
  }
  const format = formats[input.bracketFormat]
  if (!format) throw new Error(`Unsupported tournament format: ${input.bracketFormat}`)
  const id = crypto.randomUUID()
  const title = input.title.trim()
  const { error: insertError } = await supabase.from('tournaments').insert({
    id,
    game_id: game.id,
    title,
    description: input.description.trim(),
    format,
    status: 'draft',
    starts_at: new Date(input.start).toISOString(),
    registration_opens_at: new Date(input.registrationOpensAt).toISOString(),
    registration_closes_at: new Date(input.registrationClosesAt).toISOString(),
    check_in_opens_at: new Date(input.checkInOpensAt).toISOString(),
    check_in_closes_at: new Date(input.checkInClosesAt).toISOString(),
    max_players: input.capacity,
    entry_fee_minor: input.entryFeeMinor,
    prize_pool_minor: input.prizePoolMinor,
    currency_code: 'UGX',
    mode: input.mode.trim(),
    player_format: input.playerFormat,
    rules: input.rules.join('\n'),
    prize_description: input.prizeDescription.trim() || null,
    banner_url: input.bannerUrl?.trim() || null,
    created_by: authData.user.id,
  })
  if (insertError) throw insertError

  const { data: verified, error: verifyError } = await supabase
    .from('tournaments')
    .select('id, title, created_by, status')
    .eq('id', id)
    .eq('created_by', authData.user.id)
    .eq('status', 'draft')
    .maybeSingle()
  if (verifyError) throw verifyError
  if (!verified) throw new Error('Supabase accepted the insert but the owner-scoped read did not return it. Persistence is unverified; refresh your session and check the database policy before retrying.')
  return { id: verified.id, title: verified.title }
}
