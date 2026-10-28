import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeading } from '../components/PageHeading'
import { TournamentCard } from '../components/TournamentCard'
import type { SupabaseGame, TournamentRecord } from '../admin/tournamentRepository'

export function TournamentsPage() {
  const [params] = useSearchParams()
  const [query, setQuery] = useState('')
  const [game, setGame] = useState(() => params.get('game') ?? 'all')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState('soonest')
  const [records, setRecords] = useState<TournamentRecord[]>([])
  const [availableGames, setAvailableGames] = useState<SupabaseGame[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let current = true
    setState('loading')
    setError('')
    Promise.all([
      import('../admin/tournamentRepository').then(module => module.listPublishedTournaments()),
      import('../admin/tournamentRepository').then(module => module.listActiveGames()),
    ]).then(([tournaments, games]) => {
      if (!current) return
      setRecords(tournaments)
      setAvailableGames(games)
      setState('ready')
    }).catch(reason => {
      if (!current) return
      setError(reason instanceof Error ? reason.message : 'Supabase could not load tournament data.')
      setState('error')
    })
    return () => { current = false }
  }, [reload])

  const results = useMemo(() => records.filter(item => {
    const title = `${item.title} ${item.gameName} ${item.format}`.toLowerCase()
    return title.includes(query.toLowerCase()) && (game === 'all' || item.gameId === game) && (status === 'all' || item.status === status)
  }).sort((a, b) => sort === 'prize' ? b.prizePool - a.prizePool : a.start.localeCompare(b.start)), [records, query, game, status, sort])

  return <div className="section-wrap content-page">
    <PageHeading kicker="THE ARENA" title="FIND YOUR" highlight="NEXT MATCH." copy="Browse tournaments currently published by Tretmax Games and open an event to review its details." />
    <div className="toolbar">
      <label className="search-field"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tournaments or games" aria-label="Search tournaments" /></label>
      <label className="select-field">GAME<select value={game} onChange={event => setGame(event.target.value)}><option value="all">All games</option>{availableGames.map(item => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label>
      <label className="select-field">STATUS<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All published statuses</option>{['Registration open', 'Registration closed', 'Check in', 'In progress', 'Completed'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="select-field">SORT BY<select value={sort} onChange={event => setSort(event.target.value)}><option value="soonest">Soonest</option><option value="prize">Highest prize</option></select></label>
    </div>
    {state === 'loading' && <div className="empty-state" role="status"><span>LOADING PUBLISHED TOURNAMENTS</span><p>Connecting to the public tournament feed…</p></div>}
    {state === 'error' && <div className="empty-state" role="alert"><span>TOURNAMENTS COULD NOT BE LOADED</span><p>{error}</p><button className="button button--outline" onClick={() => setReload(value => value + 1)}>Try again</button></div>}
    {state === 'ready' && <>
      <p className="result-count">{results.length} {results.length === 1 ? 'PUBLISHED TOURNAMENT' : 'PUBLISHED TOURNAMENTS'} <span>· SUPABASE DATA</span></p>
      {results.length ? <div className="tournament-grid">{results.map(item => <TournamentCard key={item.id} tournament={item} />)}</div> : <div className="empty-state"><span>{records.length ? 'NO MATCHES FOUND' : 'NO PUBLISHED TOURNAMENTS'}</span><p>{records.length ? 'Try changing your search or filters.' : 'New events will appear here after an authorized administrator publishes them.'}</p>{records.length > 0 && <button className="button button--outline" onClick={() => { setQuery(''); setGame('all'); setStatus('all') }}>Clear filters</button>}</div>}
    </>}
  </div>
}
