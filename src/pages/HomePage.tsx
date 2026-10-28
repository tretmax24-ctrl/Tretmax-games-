import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GameArtwork } from '../components/GameArtwork'
import { TournamentCard } from '../components/TournamentCard'
import {  ugx } from '../data/tournaments'
import type { SupabaseGame, TournamentRecord } from '../admin/tournamentRepository'
import arenaArtwork from '../assets/artwork/arena-stage.svg'
import mobileArenaArtwork from '../assets/artwork/arena-stage-mobile.svg'

export function HomePage() {
  const [tournaments, setTournaments] = useState<TournamentRecord[]>([])
  const [games, setGames] = useState<SupabaseGame[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  useEffect(() => {
    let current = true
    Promise.all([
      import('../admin/tournamentRepository').then(module => module.listPublishedTournaments()),
      import('../admin/tournamentRepository').then(module => module.listActiveGames()),
    ]).then(([events, activeGames]) => {
      if (!current) return
      setTournaments(events)
      setGames(activeGames)
      setState('ready')
    }).catch(reason => {
      if (!current) return
      setError(reason instanceof Error ? reason.message : 'Supabase could not load homepage tournament data.')
      setState('error')
    })
    return () => { current = false }
  }, [])
  const featured = tournaments.filter(item => item.status === 'Registration open').slice(0, 2)
  const nextEvent = featured[0] ?? tournaments[0]
  const ongoing = tournaments.find(item => item.status === 'In progress')

  return <>
    <section className="home-cinematic" aria-labelledby="home-title">
      <picture className="cinematic-visual"><source media="(max-width: 760px)" srcSet={mobileArenaArtwork} /><img className="cinematic-art" src={arenaArtwork} alt="Original illustrated esports stage with players gathered before a tournament screen" /></picture>
      <div className="cinematic-shade" aria-hidden="true" />
      <div className="cinematic-copy">
        <span className="eyebrow"><i /> TOURNAMENTS · UGANDA</span>
        <h1 id="home-title">YOUR NEXT<br />MATCH <em>STARTS</em><br />HERE.</h1>
        <p>Explore tournaments published by Tretmax Games. Compare game, format, schedule and event details before you take part.</p>
        <div className="hero-actions"><Link className="button button--lime" to="/tournaments">Browse tournaments <span aria-hidden="true">↗</span></Link><Link className="text-link" to="/how-it-works">How joining works <span aria-hidden="true">→</span></Link></div>
      </div>
      <aside className="next-match" aria-label="Featured tournament">
        {state === 'loading' && <><div className="next-match-top"><span>TOURNAMENT FEED</span><span>LOADING</span></div><p>Fetching published events…</p></>}
        {state === 'error' && <><div className="next-match-top"><span>TOURNAMENT FEED</span><span>UNAVAILABLE</span></div><p>{error}</p><Link to="/tournaments">Open tournament listings ↗</Link></>}
        {state === 'ready' && nextEvent && <><div className="next-match-top"><span>FEATURED LISTING</span><span className="event-status"><i /> {nextEvent.status}</span></div><p>{nextEvent.gameName} <span>·</span> {nextEvent.format}</p><h2>{nextEvent.title}</h2><div className="next-match-meta"><span><small>STARTS</small>{nextEvent.dateLabel}</span><span><small>PRIZE POOL</small>{ugx(nextEvent.prizePool, 'UGX 0')}</span></div><Link to={`/tournaments/${nextEvent.id}`}>EVENT DETAILS <span aria-hidden="true">↗</span></Link></>}
        {state === 'ready' && !nextEvent && <><div className="next-match-top"><span>TOURNAMENT BOARD</span><span>NO PUBLISHED EVENTS</span></div><p>Published competitions will appear here once available.</p><Link to="/tournaments">Browse tournament listings ↗</Link></>}
      </aside>
      <div className="cinematic-foot"><span>TMX / EAST AFRICA</span><span>ORIGINAL ILLUSTRATION · TOURNAMENTS FROM SUPABASE</span></div>
    </section>

    <section className="home-featured section-wrap" aria-labelledby="featured-title">
      <div className="section-heading"><div><div className="section-kicker"><span /> THE TOURNAMENT BOARD</div><h2 id="featured-title">OPEN <em>REGISTRATION</em></h2></div><Link className="view-all" to="/tournaments">VIEW ALL EVENTS <span aria-hidden="true">↗</span></Link></div>
      {state === 'loading' && <p className="admin-inline-empty" role="status">Loading published tournaments…</p>}
      {state === 'error' && <p className="admin-record-error" role="alert">{error}</p>}
      {state === 'ready' && (featured.length ? <div className="tournament-grid">{featured.map(item => <TournamentCard key={item.id} tournament={item} />)}</div> : <div className="empty-state"><span>NO OPEN TOURNAMENTS</span><p>Published events with open registration will appear here.</p></div>)}
      {state === 'ready' && (ongoing ? <Link className="ongoing-strip" to={`/tournaments/${ongoing.id}`}><span className="ongoing-pulse" aria-hidden="true"/><span className="ongoing-copy"><b>{ongoing.title}</b><small>{ongoing.gameName} · {ongoing.format}</small></span><span className="ongoing-label">IN PROGRESS</span><span className="ongoing-link">VIEW EVENT ↗</span></Link> : <div className="ongoing-strip"><span className="ongoing-copy"><b>No ongoing competitions</b><small>Active tournaments will appear here.</small></span><span className="ongoing-label">NO LIVE DATA</span></div>)}
    </section>

    <section className="game-section" aria-labelledby="games-title"><div className="section-wrap">
      <div className="section-heading"><div><div className="section-kicker"><span /> CURRENT ROSTER</div><h2 id="games-title">PICK YOUR <em>GAME.</em></h2></div><Link className="view-all" to="/games">ALL ACTIVE GAMES <span aria-hidden="true">↗</span></Link></div>
      <p className="section-intro">Active titles from the Tretmax Games database. Original illustrations are not official game artwork.</p>
      {state === 'ready' && <div className="game-grid">{games.map((game, index) => <Link to={`/games?game=${game.slug}`} className={`game-tile game-tile--${index + 1}`} key={game.id}><GameArtwork game={game} compact /><span className="game-number">{String(index + 1).padStart(2, '0')}</span><span className="game-tile-copy"><small>{game.category}</small><strong>{game.name}</strong></span><span className="tile-arrow" aria-hidden="true">↗</span></Link>)}</div>}
      {state === 'loading' && <p role="status">Loading active games…</p>}
      {state === 'error' && <p role="alert">Could not load active games: {error}</p>}
      {state === 'ready' && games.length === 0 && <div className="empty-state"><span>NO ACTIVE GAMES</span><p>Game titles will appear here when enabled.</p></div>}
    </div></section>

    <section className="home-prize"><div className="home-prize-inner"><div><div className="section-kicker"><span /> CLEAR EVENT DETAILS</div><h2>KNOW THE<br /><em>TERMS BEFORE PLAY.</em></h2><p>Every public tournament page lays out its format, time, participation rules and entry details in one place.</p><Link className="button button--outline" to="/tournaments">Explore event details <span aria-hidden="true">↗</span></Link></div><div className="prize-ledger"><span>WHAT YOU CAN REVIEW</span><div><b>01</b><p>Entry amount<br /><small>Shown in UGX when listed</small></p></div><div><b>02</b><p>Match format<br /><small>Solo, duo or team details</small></p></div><div><b>03</b><p>Event schedule<br /><small>Times shown in East Africa Time</small></p></div><small className="prize-footnote">No payment or payout service is active.</small></div></div></section>

    <section className="home-steps section-wrap"><div><div className="section-kicker"><span /> FROM LISTING TO MATCH DAY</div><h2>TAKE A LOOK.<br /><em>THEN LOCK IN.</em></h2><p>Use the listing to decide whether an event suits your game and schedule. Published free events can show the secure registration flow when it is available.</p><Link className="text-link" to="/how-it-works">See all participation steps <span aria-hidden="true">→</span></Link></div><div className="step-list"><article className="step"><span className="step-number">01</span><div><h3>Choose a game</h3><p>Browse active titles and find a competition that fits.</p></div></article><article className="step"><span className="step-number">02</span><div><h3>Read the event page</h3><p>Check the format, time, rules, entry details and open slots.</p></div></article><article className="step"><span className="step-number">03</span><div><h3>Get ready to compete</h3><p>Registration is available only where the reviewed free-entry service is deployed; check-in and match tools are still in progress.</p></div></article></div></section>
  </>
}
