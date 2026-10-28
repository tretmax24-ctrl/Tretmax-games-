import { useMemo, useState } from 'react'
import { generateSingleEliminationBracket } from '../lib/bracketEngine'

export function BracketPreview() {
  const [rawParticipants, setRawParticipants] = useState('')
  const [submitted, setSubmitted] = useState<string[]>([])
  const bracket = useMemo(() => generateSingleEliminationBracket(submitted.map(id => ({ id, label: id }))), [submitted])
  return <section className="admin-panel bracket-preview" aria-labelledby="bracket-preview-title">
    <div className="admin-panel-kicker">COMPETITION ENGINE <span className="admin-demo-tag">LOCAL PREVIEW · NOT SAVED</span></div>
    <h3 id="bracket-preview-title">Single-elimination bracket preview</h3>
    <p className="admin-subtle">Paste checked-in player or team IDs to inspect deterministic rounds and byes. This preview never creates matches or changes Supabase records.</p>
    <textarea value={rawParticipants} onChange={event => setRawParticipants(event.target.value)} rows={3} placeholder="One participant ID per line" aria-label="Preview participant IDs" />
    <button className="admin-button secondary" type="button" onClick={() => setSubmitted([...new Set(rawParticipants.split(/[,\n]/).map(value => value.trim()).filter(Boolean))])}>Generate local preview</button>
    {!submitted.length ? <p className="admin-inline-empty">No participant IDs supplied. A secure check-in and bracket-generation RPC is still required for live tournaments.</p> : <div className="bracket-rounds">{bracket.rounds.map(round => <div className="bracket-round" key={round.round}><strong>ROUND {round.round}</strong>{round.matches.map(match => <div className="bracket-match" key={match.id}><span>{match.participantA?.label ?? 'BYE'}</span><span>{match.participantB?.label ?? 'BYE'}</span><small>{match.status === 'bye' ? 'BYE / ADVANCES' : 'READY'} · {match.id}</small></div>)}</div>)}</div>}
  </section>
}
