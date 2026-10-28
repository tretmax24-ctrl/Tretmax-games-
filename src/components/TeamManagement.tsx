import { useEffect, useMemo, useState } from 'react'
import { listActiveGames, type SupabaseGame } from '../admin/tournamentRepository'
import { createTeam, createTeamInviteCode, getTeamRoster, inviteTeamMember, leaveTeam, listMyInvitations, listMyTeams, lockTeamRoster, respondToTeamInvitation, revokeTeamInviteCode, transferTeamCaptain, type TeamInvitation, type TeamRoster, type TeamSummary } from '../admin/teamRepository'
import { useAuth } from '../lib/auth'

function operationError(result: { ok: boolean; code: string; message: string }) { return result.ok ? '' : `${result.code}: ${result.message}` }

export function TeamManagement() {
  const { user } = useAuth()
  const [teams, setTeams] = useState<TeamSummary[]>([])
  const [rosters, setRosters] = useState<Record<string, TeamRoster>>({})
  const [invitations, setInvitations] = useState<TeamInvitation[]>([])
  const [games, setGames] = useState<SupabaseGame[]>([])
  const [teamName, setTeamName] = useState('')
  const [gameId, setGameId] = useState('')
  const [inviteIds, setInviteIds] = useState<Record<string, string>>({})
  const [transferIds, setTransferIds] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [inviteCodes, setInviteCodes] = useState<Record<string, { code: string; expiresAt: string }>>({})

  async function refresh() {
    const [nextTeams, nextInvitations, activeGames] = await Promise.all([listMyTeams(), listMyInvitations(), listActiveGames()])
    const nextRosters = await Promise.all(nextTeams.map(async team => { try { return [team.id, await getTeamRoster(team.id)] as const } catch { return null } }))
    setTeams(nextTeams); setInvitations(nextInvitations); setGames(activeGames); setRosters(Object.fromEntries(nextRosters.filter((entry): entry is readonly [string, TeamRoster] => Boolean(entry))))
    setGameId(current => current || activeGames[0]?.databaseId || '')
  }
  useEffect(() => { refresh().catch(reason => setError(reason instanceof Error ? reason.message : 'Teams could not be loaded.')) }, [])
  const gameNames = useMemo(() => new Map(games.map(game => [game.databaseId, game.name])), [games])

  async function run(label: string, action: () => Promise<{ ok: boolean; code: string; message: string }>, success: string) {
    setBusy(label); setError(''); setMessage('')
    try { const result = await action(); const failure = operationError(result); if (failure) { setError(failure); return } setMessage(success); await refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The team operation failed.') }
    finally { setBusy('') }
  }
  async function submitCreate(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (teamName.trim().length < 3 || !gameId) { setError('Choose a supported game and enter a team name of at least 3 characters.'); return } await run('create', () => createTeam(gameId, teamName.trim()), 'Team created. Invite eligible players using their account UUID.') ; setTeamName('') }
  async function issueCode(teamId: string) { setBusy(`code-${teamId}`); setError(''); setMessage(''); try { const result = await createTeamInviteCode(teamId); if (!result.ok) { setError(`${result.code}: ${result.message}`); return } if (typeof result.invite_code !== 'string' || typeof result.expires_at !== 'string') { setError('The invitation service returned an invalid code.'); return } setInviteCodes(current => ({ ...current, [teamId]: { code: result.invite_code as string, expiresAt: result.expires_at as string } })); setMessage('Invitation code created. It will be shown only in this session.'); } catch (reason) { setError(reason instanceof Error ? reason.message : 'The invitation code could not be created.') } finally { setBusy('') } }
  function inviteLink(code: string) { return `${window.location.origin}/teams/join#code=${encodeURIComponent(code)}` }
  async function copyInvite(code: string) { try { await navigator.clipboard.writeText(inviteLink(code)); setMessage('Private invitation link copied.'); } catch { setError('Copy is unavailable in this browser. Use Share or copy the visible link manually.') } }
  async function shareInvite(code: string, team: TeamSummary) { const link = inviteLink(code); try { if (navigator.share) await navigator.share({ title: `Join ${team.name}`, text: `Join my ${gameNames.get(team.gameId) ?? 'Tretmax'} team on Tretmax Games.`, url: link }); else await copyInvite(code) } catch (reason) { if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError('Sharing is unavailable in this browser.') } }
  async function revokeCode(teamId: string) { if (!window.confirm('Revoke this private invitation link? Anyone with it will no longer be able to join.')) return; await run(`revoke-${teamId}`, () => revokeTeamInviteCode(teamId), 'Invitation code revoked.'); setInviteCodes(current => { const next = { ...current }; delete next[teamId]; return next }) }

  return <section className="profile-tournaments team-management" aria-labelledby="teams-title">
    <div className="section-heading"><div><div className="section-kicker"><span /> TEAM PLAY</div><h2 id="teams-title">YOUR <em>TEAMS.</em></h2></div></div>
    <p className="profile-explain">Teams, invitations and rosters are private Supabase records. Tretmax does not expose a public player-search directory; captains need a teammate's account UUID to send an invite.</p>
    {message && <p className="form-success" role="status">{message}</p>}{error && <p className="form-errors" role="alert">{error}</p>}
    <form className="profile-form team-create-form" onSubmit={submitCreate}><label>GAME<select value={gameId} onChange={event => setGameId(event.target.value)}><option value="">Choose an active game</option>{games.map(game => <option value={game.databaseId} key={game.databaseId}>{game.name}</option>)}</select></label><label>TEAM NAME<input value={teamName} onChange={event => setTeamName(event.target.value)} maxLength={50} placeholder="Kampala Ravens" /></label><button className="button button--lime" type="submit" disabled={busy !== ''}>{busy === 'create' ? 'CREATING…' : 'CREATE TEAM'}</button></form>
    {invitations.length > 0 && <div className="team-invitations"><strong>PENDING INVITATIONS</strong>{invitations.map(invitation => <article key={invitation.id}><span>Team invitation · {invitation.teamId.slice(0, 8)}…</span><button className="text-link" type="button" disabled={busy !== ''} onClick={() => run(`accept-${invitation.id}`, () => respondToTeamInvitation(invitation.id, true), 'Invitation accepted.')}>ACCEPT</button><button className="text-link" type="button" disabled={busy !== ''} onClick={() => run(`decline-${invitation.id}`, () => respondToTeamInvitation(invitation.id, false), 'Invitation declined.')}>DECLINE</button></article>)}</div>}
    <div className="team-list">{teams.length === 0 ? <p className="profile-empty">No teams yet. Create one after linking a supported game ID.</p> : teams.map(team => { const roster = rosters[team.id]; const isCaptain = user?.id === team.captainId; const issued = inviteCodes[team.id]; return <article className="team-card" key={team.id}><div className="team-card-head"><div><span className="game-category">{gameNames.get(team.gameId) ?? 'SUPPORTED GAME'}</span><h3>{team.name}</h3></div><span className="status status--soon">{team.rosterState}</span></div><p>{roster?.members.length ?? 0} / {team.maxMembers} members · {team.rosterState === 'locked' ? 'Roster locked' : 'Roster forming'}</p>{roster && <ul>{roster.members.map(member => <li key={member.userId}><span>{member.inGameName || member.gameUid}</span><small>{member.role}</small></li>)}</ul>}{isCaptain && team.rosterState === 'forming' && <div className="team-actions"><label>INVITEE ACCOUNT UUID<input value={inviteIds[team.id] ?? ''} onChange={event => setInviteIds(current => ({ ...current, [team.id]: event.target.value }))} placeholder="Paste a registered player's UUID" /></label><button className="button button--outline" type="button" disabled={busy !== '' || !inviteIds[team.id]} onClick={() => run(`invite-${team.id}`, () => inviteTeamMember(team.id, inviteIds[team.id]), 'Invitation sent.')}>LEGACY UUID INVITE</button><label>NEW CAPTAIN UUID<input value={transferIds[team.id] ?? ''} onChange={event => setTransferIds(current => ({ ...current, [team.id]: event.target.value }))} placeholder="Existing member UUID" /></label><button className="button button--outline" type="button" disabled={busy !== '' || !transferIds[team.id]} onClick={() => run(`transfer-${team.id}`, () => transferTeamCaptain(team.id, transferIds[team.id]), 'Captaincy transferred.')}>TRANSFER</button><button className="button button--lime" type="button" disabled={busy !== '' || !roster || roster.members.length < 2} onClick={() => run(`lock-${team.id}`, () => lockTeamRoster(team.id), 'Roster locked.')}>LOCK ROSTER</button><button className="button button--outline" type="button" disabled={busy !== ''} onClick={() => issueCode(team.id)}>{busy === `code-${team.id}` ? 'CREATING…' : 'CREATE INVITE LINK'}</button>{issued && <div className="team-invite-code"><strong>PRIVATE CODE · SHOW ONCE</strong><span>{issued.code}</span><small>Expires {new Date(issued.expiresAt).toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Kampala' })}</small><div><button className="text-link" type="button" onClick={() => copyInvite(issued.code)}>COPY LINK</button><button className="text-link" type="button" onClick={() => shareInvite(issued.code, team)}>SHARE</button><button className="text-link" type="button" onClick={() => revokeCode(team.id)}>REVOKE</button></div></div>}</div>}{!isCaptain && team.rosterState === 'forming' && <button className="button button--outline" type="button" disabled={busy !== ''} onClick={() => run(`leave-${team.id}`, () => leaveTeam(team.id), 'You left the team.')}>LEAVE TEAM</button>}</article> })}</div>
  </section>
}
