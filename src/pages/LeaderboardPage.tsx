import { useMemo, useState } from 'react'
import { PageHeading } from '../components/PageHeading'
import { DemoNotice } from '../components/DemoNotice'

const players = [
  { name: 'KampalaGhost', game: 'Call of Duty: Mobile', wins: 18, points: 2840, country: 'Kampala' },
  { name: 'VioletXI', game: 'EA Sports FC 25', wins: 15, points: 2610, country: 'Entebbe' },
  { name: 'NileRanger', game: 'PUBG Mobile', wins: 14, points: 2485, country: 'Jinja' },
  { name: 'AceMbarara', game: 'Call of Duty: Mobile', wins: 12, points: 2190, country: 'Mbarara' },
  { name: 'LuwumPrime', game: 'EA Sports FC 25', wins: 11, points: 1980, country: 'Gulu' },
  { name: 'DropKingUG', game: 'PUBG Mobile', wins: 9, points: 1750, country: 'Kampala' },
]
export function LeaderboardPage() {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'points' | 'wins'>('points')
  const rankings = useMemo(() => players.filter(player => `${player.name} ${player.game} ${player.country}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b[sort] - a[sort]), [search, sort])
  return <div className="section-wrap content-page"><PageHeading kicker="THE CLIMB" title="THE NAMES TO" highlight="KNOW." copy="A snapshot of the players setting the pace. Earn points, stack wins, and climb the ranks."/><DemoNotice>Demo rankings and sample player stats. No real accounts, match results, or rating system are connected yet.</DemoNotice><div className="leaderboard-tools"><label className="search-field"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players or games" aria-label="Search players" /></label><div className="sort-toggle"><button className={sort === 'points' ? 'is-active' : ''} onClick={() => setSort('points')}>POINTS</button><button className={sort === 'wins' ? 'is-active' : ''} onClick={() => setSort('wins')}>WINS</button></div></div><div className="leaderboard-table" role="table" aria-label="Demo player rankings"><div className="leader-row leader-row--head" role="row"><span>RANK</span><span>PLAYER</span><span>GAME</span><span>WINS</span><span>POINTS</span></div>{rankings.map((player, index) => <div className={`leader-row${index === 0 ? ' leader-row--top' : ''}`} role="row" key={player.name}><span className="rank" role="cell">{String(index + 1).padStart(2, '0')}</span><span className="player-name" role="cell"><i>{player.name.slice(0, 1)}</i><span>{player.name}<small>{player.country}, Uganda</small></span></span><span role="cell">{player.game}</span><strong role="cell">{player.wins}</strong><strong className="points" role="cell">{player.points.toLocaleString()}</strong></div>)}</div>{rankings.length === 0 && <div className="empty-state"><span>NO PLAYERS FOUND</span><p>Try a different player or game name.</p></div>}<p className="small-note">Ranking metric: points are the primary order; wins are used when wins is selected.</p></div>
}
