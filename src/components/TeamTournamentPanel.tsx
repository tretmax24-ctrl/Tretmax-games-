import { useEffect, useState } from 'react'
import { getTeamRoster, listMyTeamEntries, listMyTeams, registerTeamForTournament, type TeamEntry, type TeamSummary } from '../admin/teamRepository'
import { canRegisterLockedTeam, requiredTeamSize } from '../lib/teamRules'

type Props = { tournamentId: string; gameId: string; format: string; isOpen: boolean }

export function TeamTournamentPanel({ tournamentId, gameId, format, isOpen }: Props) {
  const size = requiredTeamSize(format)
  const [teams, setTeams] = useState<TeamSummary[]>([])
  const [entries, setEntries] = useState<TeamEntry[]>([])
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    if (!size) return
    Promise.all([listMyTeams(), listMyTeamEntries(tournamentId)]).then(async ([allTeams, ownEntries]) => { const candidates = allTeams.filter(team => team.gameId === gameId && team.rosterState === 'locked'); const eligible = await Promise.all(candidates.map(async team => { const roster = await getTeamRoster(team.id); return canRegisterLockedTeam(format, team.rosterState, roster.members.length).allowed ? team : null })); setTeams(eligible.filter((team): team is TeamSummary => Boolean(team))); setEntries(ownEntries) }).catch(reason => setError(reason instanceof Error ? reason.message : 'Your team registrations could not be loaded.'))
  }, [format, gameId, size, tournamentId])
  if (!size) return null
  const registeredTeamIds = new Set(entries.map(entry => entry.teamId))
  async function register() {
    if (!selected || busy) return
    setBusy(true); setError(''); setMessage('')
    try { const result = await registerTeamForTournament(tournamentId, selected); if (!result.ok) { setError(`${result.code}: ${result.message}`); return } setMessage(`${result.message} Slot ${String(result.slot_number ?? 'pending')}.`); setEntries(await listMyTeamEntries(tournamentId)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Team registration failed.') }
    finally { setBusy(false) }
  }
  return <section className="team-registration-panel" aria-label="Team tournament registration"><div className="section-kicker"><span /> TEAM ENTRY · {size} PLAYERS REQUIRED</div><p>Only a locked roster with exactly {size} members can occupy one tournament slot. The server rechecks game IDs, capacity and duplicate participation.</p>{error && <p className="form-errors" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}{entries.length > 0 && <p className="registration-confirmed">TEAM REGISTERED · SLOT {entries[0].slotNumber ?? 'PENDING'}</p>}{isOpen && !entries.length && <><select value={selected} onChange={event => setSelected(event.target.value)} disabled={busy}><option value="">Choose a locked team</option>{teams.map(team => <option key={team.id} value={team.id} disabled={registeredTeamIds.has(team.id)}>{team.name} · {team.maxMembers} max</option>)}</select><button className="button button--lime" type="button" onClick={register} disabled={!selected || busy}>{busy ? 'REGISTERING…' : 'REGISTER TEAM FOR FREE'}</button></>}</section>
}
