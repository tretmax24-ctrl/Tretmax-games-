import { useCallback, useEffect, useState } from 'react'
import { checkInTournament, getTeamAttendanceSummary, listMyTeamEntries, recordTeamMemberCheckIn, type TeamAttendanceSummary, type TeamEntry } from '../admin/teamRepository'
import { attendanceLabel } from '../lib/teamInvite'

type Props = { tournamentId: string; entryId?: string; isTeamEvent: boolean; status: string }
export function CheckInPanel({ tournamentId, entryId, isTeamEvent, status }: Props) {
  const [teamEntries, setTeamEntries] = useState<TeamEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ message: string; count?: number; required?: number; complete?: boolean } | null>(null)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<TeamAttendanceSummary | null>(null)
  const loadAttendance = useCallback(async (entryId: string) => { try { setSummary(await getTeamAttendanceSummary(entryId)); setError('') } catch (reason) { setSummary(null); setError(reason instanceof Error ? reason.message : 'Attendance is unavailable for this entry.') } }, [])
  useEffect(() => { if (isTeamEvent) listMyTeamEntries(tournamentId).then(async entries => { setTeamEntries(entries); if (entries[0]) await loadAttendance(entries[0].id) }).catch(() => setTeamEntries([])) }, [isTeamEvent, loadAttendance, tournamentId])
  const activeEntry = entryId ?? teamEntries[0]?.id
  const open = status === 'Check in'
  async function submit() {
    if (!activeEntry || busy) return
    setBusy(true); setError('')
    try {
      const response = isTeamEvent ? await recordTeamMemberCheckIn(activeEntry) : await checkInTournament(tournamentId, activeEntry)
      if (!response.ok) { setError(`${response.code}: ${response.message}`); return }
      setResult({ message: response.message, count: typeof response.checked_in_count === 'number' ? response.checked_in_count : undefined, required: typeof response.required_count === 'number' ? response.required_count : undefined, complete: response.entry_checked_in === true })
      if (isTeamEvent) await loadAttendance(activeEntry)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Check-in failed.') }
    finally { setBusy(false) }
  }
  return <section className="check-in-panel" aria-label="Tournament check-in"><div className="section-kicker"><span /> ATTENDANCE</div>{!activeEntry ? <p>Register for this tournament before check-in becomes available.</p> : <>{isTeamEvent && summary && <div className="attendance-summary"><strong>{summary.checkedInCount}/{summary.requiredCount} CHECKED IN</strong><span>{attendanceLabel(summary)}</span><button className="text-link" type="button" onClick={() => loadAttendance(activeEntry)}>REFRESH ATTENDANCE</button></div>}{!open ? <p>Check-in opens only when the organizer moves the event into its server-controlled check-in window.</p> : <><p>{isTeamEvent ? 'Check in yourself. The team entry completes only after every roster member attends.' : 'Confirm your attendance inside the published check-in window.'}</p><button className="button button--lime" type="button" onClick={submit} disabled={busy}>{busy ? 'CHECKING IN…' : 'CHECK IN NOW'}</button></>}{result && <p className="form-success" role="status">{result.message}{result.count !== undefined && result.required !== undefined ? ` Attendance ${result.count}/${result.required}.` : ''}{result.complete ? ' Entry check-in complete.' : ''}</p>}{error && <p className="form-errors" role="alert">{error}</p>}</>}</section>
}
