import type { User } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase'
import type { SupabaseGame } from '../admin/tournamentRepository'

export type PlayerProfile = {
  id: string
  username: string | null
  displayName: string | null
  avatarUrl: string | null
  countryCode: string
}

export type PlayerGameAccount = {
  id: string
  userId: string
  gameId: string
  gameUid: string
  inGameName: string | null
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected'
  verifiedAt: string | null
}

type ProfileRow = { id: string; username: string | null; display_name: string | null; avatar_url: string | null; country_code: string }
type AccountRow = { id: string; user_id: string; game_id: string; game_uid: string; in_game_name: string | null; verification_status: PlayerGameAccount['verificationStatus']; verified_at: string | null }

function requireUser(user: User | null): User {
  if (!user) throw new Error('Sign in to manage your player profile.')
  return user
}

function toProfile(row: ProfileRow): PlayerProfile {
  return { id: row.id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url, countryCode: row.country_code }
}

function toAccount(row: AccountRow): PlayerGameAccount {
  return { id: row.id, userId: row.user_id, gameId: row.game_id, gameUid: row.game_uid, inGameName: row.in_game_name, verificationStatus: row.verification_status, verifiedAt: row.verified_at }
}

export async function loadPlayerProfile(user: User | null): Promise<{ profile: PlayerProfile | null; accounts: PlayerGameAccount[]; games: SupabaseGame[] }> {
  const currentUser = requireUser(user)
  const supabase = getSupabaseClient()
  const [{ data: profile, error: profileError }, { data: accounts, error: accountError }] = await Promise.all([
    supabase.from('profiles').select('id, username, display_name, avatar_url, country_code').eq('id', currentUser.id).maybeSingle(),
    supabase.from('player_game_accounts').select('id, user_id, game_id, game_uid, in_game_name, verification_status, verified_at').eq('user_id', currentUser.id).order('created_at', { ascending: true }),
  ])
  if (profileError) throw profileError
  if (accountError) throw accountError
  const { listActiveGames } = await import('../admin/tournamentRepository')
  const activeGames = await listActiveGames()
  return {
    profile: profile ? toProfile(profile as ProfileRow) : null,
    accounts: ((accounts ?? []) as AccountRow[]).map(toAccount),
    games: activeGames,
  }
}

export async function savePlayerProfile(user: User | null, input: { displayName: string; username: string }): Promise<PlayerProfile> {
  const currentUser = requireUser(user)
  const username = input.username.trim().toLowerCase() || null
  const displayName = input.displayName.trim() || null
  const { data, error } = await getSupabaseClient().from('profiles').upsert({
    id: currentUser.id,
    display_name: displayName,
    username,
    country_code: 'UG',
  }, { onConflict: 'id' }).select('id, username, display_name, avatar_url, country_code').single()
  if (error) throw error
  return toProfile(data as ProfileRow)
}

export async function saveGameAccount(user: User | null, input: { id?: string; gameId: string; gameUid: string; inGameName: string }): Promise<PlayerGameAccount> {
  const currentUser = requireUser(user)
  const supabase = getSupabaseClient()
  const payload = { game_id: input.gameId, game_uid: input.gameUid, in_game_name: input.inGameName.trim() || null }
  const query = input.id
    ? supabase.from('player_game_accounts').update(payload).eq('id', input.id).eq('user_id', currentUser.id)
    : supabase.from('player_game_accounts').insert({ ...payload, user_id: currentUser.id, verification_status: 'unverified' })
  const { data, error } = await query.select('id, user_id, game_id, game_uid, in_game_name, verification_status, verified_at').single()
  if (error) throw error
  return toAccount(data as AccountRow)
}
