import { Link } from 'react-router-dom'
import { gameForSlug, type Tournament, ugx } from '../data/tournaments'
import { GameArtwork } from './GameArtwork'

export function TournamentCard({ tournament }: { tournament: Tournament }) {
  const game = gameForSlug(tournament.gameId, tournament.gameName)
  const statusClass = tournament.status === 'Registration open' ? 'open' : tournament.status === 'In progress' ? 'live' : 'soon'
  return <article className="tournament-card"><GameArtwork game={game} bannerUrl={tournament.bannerUrl} /><div className="card-content"><div className="card-game-row"><span>{game.name}</span><span className={`status status--${statusClass}`}>{tournament.status}</span></div><h3>{tournament.title}</h3><p className="card-format">{tournament.format} <span>·</span> {tournament.dateLabel}</p><div className="card-meta"><div><span className="meta-label">ENTRY</span><strong>{ugx(tournament.entryFee)}</strong></div><div><span className="meta-label">PRIZE POOL</span><strong className="prize">{ugx(tournament.prizePool, 'UGX 0')}</strong></div><div><span className="meta-label">SLOTS</span><strong>{tournament.players ?? '—'}/{tournament.capacity || '—'}</strong></div></div><Link className="card-link" to={`/tournaments/${tournament.id}`}>VIEW TOURNAMENT <span aria-hidden="true">↗</span></Link></div></article>
}
