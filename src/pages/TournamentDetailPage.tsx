import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DemoNotice } from '../components/DemoNotice'
import { GameArtwork } from '../components/GameArtwork'
import { PageHeading } from '../components/PageHeading'
import { gameForSlug, ugx } from '../data/tournaments'
import { loadPlayerProfile } from '../lib/playerProfile'
import { useAuth } from '../lib/auth'
import type { PlayerGameAccount } from '../lib/playerProfile'
import type { TournamentRecord } from '../admin/tournamentRepository'
import { CompetitionParticipationPanel } from '../components/CompetitionParticipationPanel'

export function TournamentDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [tournament, setTournament] = useState<TournamentRecord | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [accounts, setAccounts] = useState<PlayerGameAccount[]>([])
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [registrationState, setRegistrationState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [registrationMessage, setRegistrationMessage] = useState('')
  const [selectedAccount, setSelectedAccount] = useState('')
  const [rulesAccepted, setRulesAccepted] = useState(false)
  const [shareMessage, setShareMessage] = useState('')
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

  useEffect(() => {
    if (!user || !tournament || tournament.status !== 'Registration open' || tournament.entryFee > 0) return
    let current = true
    setAccountsLoading(true)
    loadPlayerProfile(user).then(result => {
      if (!current) return
      const game = result.games.find(item => item.slug === tournament.gameId)
      const matching = game ? result.accounts.filter(account => account.gameId === game.databaseId) : []
      setAccounts(matching)
      setSelectedAccount(matching[0]?.id ?? '')
    }).catch(reason => { if (current) setRegistrationMessage(reason instanceof Error ? reason.message : 'Could not load your game accounts.') }).finally(() => { if (current) setAccountsLoading(false) })
    return () => { current = false }
  }, [user, tournament])

  async function submitRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!tournament || !selectedAccount || !rulesAccepted || registrationState === 'submitting') return
    setRegistrationState('submitting')
    setRegistrationMessage('')
    try {
      const { registerForTournament } = await import('../admin/tournamentRepository')
      const result = await registerForTournament(tournament.id, selectedAccount)
      if (!result.ok) { setRegistrationState('error'); setRegistrationMessage(`${result.code}: ${result.message}`); return }
      setRegistrationState('success')
      setRegistrationMessage(`${result.message || 'Registration confirmed.'}${typeof result.slots_remaining === 'number' ? ` ${result.slots_remaining} slots remaining.` : ''}`)
    } catch (reason) {
      setRegistrationState('error')
      setRegistrationMessage(reason instanceof Error ? reason.message : 'Registration could not be completed.')
    }
  }

  function publicTournamentUrl() {
    return `${window.location.origin}/tournaments/${encodeURIComponent(tournament?.id ?? '')}`
  }

  function shareText() {
    const deadline = tournament?.registrationClosesAt
      ? `${new Intl.DateTimeFormat('en-UG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Kampala' }).format(new Date(tournament.registrationClosesAt))} EAT`
      : 'not published'
    return `${tournament?.title ?? 'Tournament'} · ${tournament?.gameName ?? 'Tretmax Games'}\nRegistration closes: ${deadline}\n${publicTournamentUrl()}`
  }

  async function shareTournament() {
    if (!tournament) return
    const url = publicTournamentUrl()
    try {
      if (navigator.share) {
        await navigator.share({ title: tournament.title, text: shareText(), url })
        setShareMessage('Share sheet opened.')
      } else {
        if (!navigator.clipboard) { setShareMessage('Use WhatsApp to share this tournament from your device.'); return }
        await navigator.clipboard.writeText(url)
        setShareMessage('Public tournament link copied.')
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setShareMessage('Sharing is unavailable in this browser.')
    }
  }

  function shareWhatsApp() {
    if (!tournament) return
    const url = `https://wa.me/?text=${encodeURIComponent(shareText())}`
    window.open(url, '_blank', 'noopener,noreferrer')
    setShareMessage('WhatsApp share opened.')
  }

  function formatWindow(value?: string | null) {
    if (!value) return 'Not published'
    return `${new Intl.DateTimeFormat('en-UG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Kampala' }).format(new Date(value))} EAT`
  }

  if (state === 'loading') return <div className="section-wrap content-page"><div className="empty-state" role="status"><span>LOADING TOURNAMENT</span><p>Fetching published tournament detailsâ€¦</p></div></div>
  if (state === 'error') return <div className="section-wrap content-page"><div className="empty-state" role="alert"><span>TOURNAMENT COULD NOT BE LOADED</span><p>{error}</p><Link className="button button--outline" to="/tournaments">Back to tournaments</Link></div></div>
  if (!tournament) return <div className="section-wrap content-page"><div className="empty-state"><span>TOURNAMENT NOT FOUND</span><p>This event may be unpublished, unavailable to the public, or the link may be incorrect.</p><Link className="button button--lime" to="/tournaments">Browse tournaments</Link></div></div>

  const selectedGame = gameForSlug(tournament.gameId, tournament.gameName)
  const isOpen = tournament.status === 'Registration open'
  const isTeamEvent = /duo|team|squad/i.test(tournament.format)
  return <div className="section-wrap content-page">
    <div className="breadcrumbs"><Link to="/tournaments">Tournaments</Link><span>/</span><span>{tournament.title}</span></div>
    <div className="detail-hero"><GameArtwork game={selectedGame} bannerUrl={tournament.bannerUrl} /><div className="detail-hero-copy"><span className={`status status--${isOpen ? 'open' : tournament.status === 'In progress' ? 'live' : 'soon'}`}>{tournament.status}</span><PageHeading kicker={selectedGame.name} title={tournament.title.toUpperCase()} copy={tournament.description || 'Tournament details will be updated by the organizer.'}/><div className="detail-meta"><span>{tournament.format}</span><span>{tournament.dateLabel}</span></div><a className="button button--lime" href="#registration-status">Registration information <span>â†“</span></a></div></div>
    <div className="detail-layout"><div className="detail-main">
      <DemoNotice>Live tournament information is read from Supabase. Free registration uses a server-validated RPC; paid registration, payment verification and prize payouts are not implemented.</DemoNotice>
      <section className="detail-section"><div className="section-kicker"><span /> EVENT DETAILS</div><div className="detail-stats"><div><span>ENTRY TYPE</span><strong>{tournament.entryFee > 0 ? 'Paid entry' : 'Free entry'}</strong></div><div><span>ENTRY FEE</span><strong>{ugx(tournament.entryFee)}</strong></div><div><span>PRIZE POOL</span><strong className="prize">{ugx(tournament.prizePool, 'UGX 0')}</strong></div><div><span>MAX SLOTS</span><strong>{tournament.capacity || 'Not published'}</strong></div></div><p className="small-note">Confirmed registration counts appear only after the registration service reports them; no slot count is estimated here.</p></section>
      <section className="detail-section"><div className="section-kicker"><span /> REGISTRATION WINDOW · EAST AFRICA TIME</div><div className="schedule-list"><div><time>{formatWindow(tournament.registrationClosesAt)}</time><span>Registration closes</span></div></div></section>
      <section className="detail-section"><div className="section-kicker"><span /> FORMAT & RULES</div><h2>{tournament.format}</h2>{tournament.rules.length ? <ol className="rule-list">{tournament.rules.map((rule, index) => <li key={`${index}-${rule}`}>{rule}</li>)}</ol> : <p className="small-note">No rules have been published for this tournament.</p>}</section>
      <section className="detail-section"><div className="section-kicker"><span /> SCHEDULE Â· EAST AFRICA TIME</div>{tournament.schedule.length ? <div className="schedule-list">{tournament.schedule.map(item => <div key={`${item.label}-${item.time}`}><time>{item.time}</time><span>{item.label}</span></div>)}</div> : <p className="small-note">The organizer has not published a schedule yet.</p>}</section>
      <section className="detail-section"><div className="section-kicker"><span /> PRIZE STRUCTURE</div><p>{tournament.prizeDescription || 'Prize details have not been provided.'}</p><p className="small-note">Any displayed prize pool is tournament information only. Payments, verification and payouts are unavailable.</p></section>
      <CompetitionParticipationPanel isTeamEvent={isTeamEvent} status={tournament.status} />
    </div><aside className="register-panel" id="registration-status"><div className="section-kicker"><span /> TOURNAMENT ACCESS</div><h2>{isOpen ? <>REGISTRATION<br /><em>OPEN.</em></> : <>EVENT<br /><em>DETAILS.</em></>}</h2>{isOpen && tournament.entryFee === 0 && isTeamEvent && <p>Team registration is not enabled yet. This event cannot accept team rosters until the reviewed team workflow is deployed.</p>}{isOpen && tournament.entryFee === 0 && !isTeamEvent && user && <form className="registration-form" onSubmit={submitRegistration}><label>GAME ACCOUNT<select value={selectedAccount} onChange={event => setSelectedAccount(event.target.value)} disabled={accountsLoading || registrationState === 'submitting'}><option value="">{accountsLoading ? 'Loading linked IDs…' : accounts.length ? 'Choose your in-game ID' : 'No linked ID for this game'}</option>{accounts.map(account => <option value={account.id} key={account.id}>{account.inGameName || 'Unnamed'} · {account.gameUid}</option>)}</select></label><label className="registration-check"><input type="checkbox" checked={rulesAccepted} onChange={event => setRulesAccepted(event.target.checked)} /> I accept the tournament rules.</label><button className="button button--lime" type="submit" disabled={!selectedAccount || !rulesAccepted || accountsLoading || registrationState === 'submitting'}>{registrationState === 'submitting' ? 'REGISTERING…' : 'REGISTER FOR FREE'}</button>{registrationState === 'success' && <p className="form-success" role="status">{registrationMessage}</p>}{registrationState === 'error' && <p className="form-errors" role="alert">{registrationMessage}</p>}{!accountsLoading && !accounts.length && <p className="small-note">Link a game ID for {tournament.gameName} in your <Link to="/profile">profile</Link> before registering.</p>}</form>}{isOpen && tournament.entryFee === 0 && !isTeamEvent && !user && <p>Sign in to register with your linked game ID.</p>}{isOpen && tournament.entryFee > 0 && <p>Paid registration is not available. This event cannot accept paid entries until payment integration is enabled.</p>}{!isOpen && <p>Current status: {tournament.status}.</p>}<div className="share-actions" aria-label="Share tournament"><button className="button button--outline" type="button" onClick={shareTournament}>Share tournament</button><button className="button button--outline" type="button" onClick={shareWhatsApp}>Share on WhatsApp</button>{shareMessage && <p className="small-note" role="status">{shareMessage}</p>}</div><Link className="button button--outline" to="/how-it-works">How tournaments work <span>â†—</span></Link>{!user && <p className="register-foot"><Link to="/login">Sign in with Supabase Auth</Link> to register.</p>}</aside></div>
  </div>
}


