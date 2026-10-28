import { getSupabaseClient } from '../lib/supabase'

export type TeamSummary = {
  id: string
  gameId: string
  name: string
  captainId: string
  rosterState: 'forming' | 'locked'
  maxMembers: number
  createdAt: string
  lockedAt: string | null
}

export type TeamMember = {
  userId: string
  role: 'captain' | 'member'
  gameAccountId: string
  gameUid: string
  inGameName: string | null
}

export type TeamRoster = TeamSummary & { members: TeamMember[] }
export type TeamInvitation = { id: string; teamId: string; inviteeId: string; status: string; createdAt: string }
export type TeamEntry = { id: string; tournamentId: string; teamId: string; status: string; slotNumber: number | null }

export type OperationResponse = { ok: boolean; code: string; message: string; [key: string]: unknown }
export type TeamInvitePreview = { teamId: string; teamName: string; gameName: string; expiresAt: string }

function response(data: unknown, fallback: string): OperationResponse {
  const value = (data && typeof data === 'object' ? data : null) as Record<string, unknown> | null
  if (!value || typeof value.ok !== 'boolean') throw new Error('The Supabase operation returned an invalid response.')
  return { ok: value.ok, code: typeof value.code === 'string' ? value.code : 'UNKNOWN', message: typeof value.message === 'string' ? value.message : fallback, ...value }
}

async function rpc(name: string, args: Record<string, unknown>, fallback: string): Promise<OperationResponse> {
  const { data, error } = await getSupabaseClient().rpc(name, args)
  if (error) throw error
  return response(data, fallback)
}

export async function listMyTeams(): Promise<TeamSummary[]> {
  const { data, error } = await getSupabaseClient().from('teams').select('id, game_id, name, captain_id, roster_state, max_members, created_at, locked_at').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(row => ({ id: row.id, gameId: row.game_id, name: row.name, captainId: row.captain_id, rosterState: row.roster_state, maxMembers: row.max_members, createdAt: row.created_at, lockedAt: row.locked_at }))
}

export async function getTeamRoster(teamId: string): Promise<TeamRoster> {
  const result = await rpc('get_team_roster', { p_team_id: teamId }, 'The team roster could not be loaded.')
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`)
  const members = Array.isArray(result.members) ? result.members as Array<Record<string, unknown>> : []
  return {
    id: String(result.team_id), gameId: String(result.game_id), name: String(result.name), captainId: String(result.captain_id),
    rosterState: result.roster_state === 'locked' ? 'locked' : 'forming', maxMembers: Number(result.max_members), createdAt: '', lockedAt: null,
    members: members.map(member => ({ userId: String(member.user_id), role: member.role === 'captain' ? 'captain' : 'member', gameAccountId: String(member.game_account_id), gameUid: String(member.game_uid), inGameName: member.in_game_name ? String(member.in_game_name) : null })),
  }
}

export async function listMyInvitations(): Promise<TeamInvitation[]> {
  const { data, error } = await getSupabaseClient().from('team_invitations').select('id, team_id, invitee_id, status, created_at').eq('status', 'pending').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(row => ({ id: row.id, teamId: row.team_id, inviteeId: row.invitee_id, status: row.status, createdAt: row.created_at }))
}

export async function listMyTeamEntries(tournamentId?: string): Promise<TeamEntry[]> {
  let query = getSupabaseClient().from('tournament_entries').select('id, tournament_id, team_id, status, slot_number').not('team_id', 'is', null)
  if (tournamentId) query = query.eq('tournament_id', tournamentId)
  const { data, error } = await query.order('registered_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(row => ({ id: row.id, tournamentId: row.tournament_id, teamId: row.team_id, status: row.status, slotNumber: row.slot_number }))
}

export const createTeam = (gameId: string, name: string) => rpc('create_team', { p_game_id: gameId, p_name: name }, 'The team could not be created.')
export const inviteTeamMember = (teamId: string, userId: string) => rpc('invite_team_member', { p_team_id: teamId, p_user_id: userId }, 'The invitation could not be sent.')
export const respondToTeamInvitation = (invitationId: string, accept: boolean) => rpc('respond_to_team_invitation', { p_invitation_id: invitationId, p_accept: accept }, 'The invitation response could not be saved.')
export const leaveTeam = (teamId: string) => rpc('leave_team', { p_team_id: teamId }, 'You could not leave this team.')
export const transferTeamCaptain = (teamId: string, newCaptainId: string) => rpc('transfer_team_captain', { p_team_id: teamId, p_new_captain_id: newCaptainId }, 'Captaincy could not be transferred.')
export const lockTeamRoster = (teamId: string) => rpc('lock_team_roster', { p_team_id: teamId }, 'The roster could not be locked.')
export const registerTeamForTournament = (tournamentId: string, teamId: string) => rpc('register_team_for_tournament', { p_tournament_id: tournamentId, p_team_id: teamId, p_rules_accepted: true }, 'The team could not be registered.')
export const openTournamentCheckIn = (tournamentId: string) => rpc('open_tournament_check_in', { p_tournament_id: tournamentId }, 'Check-in could not be opened.')
export const checkInTournament = (tournamentId: string, entryId: string) => rpc('check_in_tournament', { p_tournament_id: tournamentId, p_entry_id: entryId }, 'Check-in could not be completed.')
export const recordTeamMemberCheckIn = (entryId: string) => rpc('record_team_member_check_in', { p_entry_id: entryId }, 'Team check-in could not be completed.')
export const markEntryNoShow = (entryId: string, reason: string) => rpc('mark_entry_no_show', { p_entry_id: entryId, p_reason: reason }, 'The no-show could not be recorded.')

export async function createTeamInviteCode(teamId: string, expiresInMinutes = 1440): Promise<OperationResponse> {
  return rpc('create_team_invite_code', { p_team_id: teamId, p_expires_in_minutes: expiresInMinutes }, 'The invitation code could not be created.')
}
export const revokeTeamInviteCode = (teamId: string) => rpc('revoke_team_invite_code', { p_team_id: teamId }, 'The invitation code could not be revoked.')
export async function previewTeamInviteCode(code: string): Promise<OperationResponse & TeamInvitePreview> {
  const result = await rpc('preview_team_invite_code', { p_code: code }, 'The invitation is invalid or unavailable.')
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`)
  return { ...result, teamId: String(result.team_id), teamName: String(result.team_name), gameName: String(result.game_name), expiresAt: String(result.expires_at) }
}
export const redeemTeamInviteCode = (code: string) => rpc('redeem_team_invite_code', { p_code: code }, 'The invitation could not be redeemed.')

export type TeamAttendanceSummary = { tournamentId: string; teamId: string; entryId: string; entryStatus: string; requiredCount: number; checkedInCount: number; pendingCount: number; noShowCount: number; entryCheckedIn: boolean; checkInOpensAt: string | null; checkInClosesAt: string | null; serverTime: string }
export async function getTeamAttendanceSummary(entryId: string): Promise<TeamAttendanceSummary> {
  const result = await rpc('get_team_attendance_summary', { p_entry_id: entryId }, 'Team attendance is unavailable.')
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`)
  return { tournamentId: String(result.tournament_id), teamId: String(result.team_id), entryId: String(result.entry_id), entryStatus: String(result.entry_status), requiredCount: Number(result.required_count), checkedInCount: Number(result.checked_in_count), pendingCount: Number(result.pending_count), noShowCount: Number(result.no_show_count), entryCheckedIn: result.entry_checked_in === true, checkInOpensAt: result.check_in_opens_at ? String(result.check_in_opens_at) : null, checkInClosesAt: result.check_in_closes_at ? String(result.check_in_closes_at) : null, serverTime: String(result.server_time) }
}
