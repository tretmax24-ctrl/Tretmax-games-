import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DemoNotice } from '../components/DemoNotice'
import { GameArtwork } from '../components/GameArtwork'
import { PageHeading } from '../components/PageHeading'
import { gameForSlug, ugx } from '../data/tournaments'
import type { TournamentRecord } from '../admin/tournamentRepository'

export function TournamentDetailPage() {
  const { id } = useParams()
  const [tournament, setTournament] = useState<TournamentRecord | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  useEffect(() => {
    let current = true
    setTournament(null)
    setState('loading')
    if (!id) { setState('ready'); return () => { current = false } }
    import('../admin/tournamentRepository').then(({ getPublishedTournament }) => getPublishedTournament(id)).then(record => {
      if (!current) return
      setTournament(record)
      setState('ready')
    }).catch(reason => {
      if (!current) return
      setError(reason instanceof Error ? reason.message : 'Supabase could not load this tournament.')
      setState('error')
    })
    return () => { current = false }
  }, [id])

  if (state === 'loading') return <div className="section-wrap content-page"><div className="empty-state" role="status"><span>LOADING TOURNAMENT</span><p>Fetching published tournament detailsâ€¦</p></div></div>
  if (state === 'error') return <div className="section-wrap content-page"><div className="empty-state" role="alert"><span>TOURNAMENT COULD NOT BE LOADED</span><p>{error}</p><Link className="button button--outline" to="/tournaments">Back to tournaments</Link></div></div>
  if (!tournament) return <div className="section-wrap content-page"><div className="empty-state"><span>TOURNAMENT NOT FOUND</span><p>This event may be unpublished, unavailable to the public, or the link may be incorrect.</p><Link className="button button--lime" to="/tournaments">Browse tournaments</Link></div></div>

  const selectedGame = gameForSlug(tournament.gameId, tournament.gameName)
  const isOpen = tournament.status === 'Registration open'
  return <div className="section-wrap content-page">
    <div className="breadcrumbs"><Link to="/tournaments">Tournaments</Link><span>/</span><span>{tournament.title}</span></div>
    <div className="detail-hero"><GameArtwork game={selectedGame} bannerUrl={tournament.bannerUrl} /><div className="detail-hero-copy"><span className={`status status--${isOpen ? 'open' : tournament.status === 'In progress' ? 'live' : 'soon'}`}>{tournament.status}</span><PageHeading kicker={selectedGame.name} title={tournament.title.toUpperCase()} copy={tournament.description || 'Tournament details will be updated by the organizer.'}/><div className="detail-meta"><span>{tournament.format}</span><span>{tournament.dateLabel}</span></div><a className="button button--lime" href="#registration-status">Registration information <span>â†“</span></a></div></div>
    <div className="detail-layout"><div className="detail-main">
      <DemoNotice>Live tournament information is read from Supabase. Free registration is the current MVP mode; paid registration, payment verification and prize payouts are not implemented.</DemoNotice>
      <section className="detail-section"><div className="section-kicker"><span /> EVENT DETAILS</div><div className="detail-stats"><div><span>ENTRY TYPE</span><strong>{tournament.entryFee > 0 ? 'Paid entry' : 'Free entry'}</strong></div><div><span>ENTRY FEE</span><strong>{ugx(tournament.entryFee)}</strong></div><div><span>PRIZE POOL</span><strong className="prize">{ugx(tournament.prizePool, 'UGX 0')}</strong></div><div><span>PLAYERS / CAPACITY</span><strong>{tournament.players ?? 'â€”'} / {tournament.capacity || 'â€”'}</strong></div></div></section>
      <section className="detail-section"><div className="section-kicker"><span /> FORMAT & RULES</div><h2>{tournament.format}</h2>{tournament.rules.length ? <ol className="rule-list">{tournament.rules.map((rule, index) => <li key={`${index}-${rule}`}>{rule}</li>)}</ol> : <p className="small-note">No rules have been published for this tournament.</p>}</section>
      <section className="detail-section"><div className="section-kicker"><span /> SCHEDULE Â· EAST AFRICA TIME</div>{tournament.schedule.length ? <div className="schedule-list">{tournament.schedule.map(item => <div key={`${item.label}-${item.time}`}><time>{item.time}</time><span>{item.label}</span></div>)}</div> : <p className="small-note">The organizer has not published a schedule yet.</p>}</section>
      <section className="detail-section"><div className="section-kicker"><span /> PRIZE STRUCTURE</div><p>{tournament.prizeDescription || 'Prize details have not been provided.'}</p><p className="small-note">Any displayed prize pool is tournament information only. Payments, verification and payouts are unavailable.</p></section>
    </div><aside className="register-panel" id="registration-status"><div className="section-kicker"><span /> TOURNAMENT ACCESS</div><h2>{isOpen ? <>REGISTRATION<br /><em>OPEN.</em></> : <>EVENT<br /><em>DETAILS.</em></>}</h2><p>{isOpen ? 'This tournament is open for registration in the database. The frontend registration flow is not connected yet.' : `Current status: ${tournament.status}.`}</p><Link className="button button--outline" to="/how-it-works">How tournaments work <span>â†—</span></Link><p className="register-foot"><Link to="/login">Account access</Link> is demo-only until Supabase Auth is connected.</p></aside></div>
  </div>
}


