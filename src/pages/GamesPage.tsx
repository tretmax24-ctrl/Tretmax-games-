import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { GameArtwork } from '../components/GameArtwork'
import { PageHeading } from '../components/PageHeading'
import type { SupabaseGame } from '../admin/tournamentRepository'

export function GamesPage() {
  const [params, setParams] = useSearchParams()
  const [category, setCategory] = useState('all')
  const [games, setGames] = useState<SupabaseGame[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const selected = params.get('game')
  useEffect(() => {
    let current = true
    setState('loading')
    import('../admin/tournamentRepository').then(({ listActiveGames }) => listActiveGames()).then(records => {
      if (!current) return
      setGames(records)
      setState('ready')
    }).catch(reason => {
      if (!current) return
      setError(reason instanceof Error ? reason.message : 'Supabase could not load active games.')
      setState('error')
    })
    return () => { current = false }
  }, [reload])
  const categories = [...new Set(games.map(game => game.category))]
  const visible = useMemo(() => games.filter(game => (category === 'all' || game.category === category) && (!selected || selected === game.slug)), [games, category, selected])
  return <div className="section-wrap content-page">
    <PageHeading kicker="THE LINEUP" title="PICK YOUR" highlight="FIELD." copy="Browse game titles currently active on Tretmax Games and find a published competition." />
    {state === 'ready' && <>
      <div className="filter-tabs" role="group" aria-label="Filter games"><button type="button" aria-pressed={category === 'all'} className={category === 'all' ? 'is-active' : ''} onClick={() => setCategory('all')}>ALL GAMES</button>{categories.map(item => <button type="button" key={item} aria-pressed={category === item} className={category === item ? 'is-active' : ''} onClick={() => setCategory(item)}>{item.toUpperCase()}</button>)}{selected && <button type="button" onClick={() => setParams({})}>CLEAR GAME FILTER ×</button>}</div>
      <p className="result-count">{visible.length} ACTIVE GAME{visible.length === 1 ? '' : 'S'} <span>· SUPABASE DATA</span></p>
      <div className="games-page-grid">{visible.map(game => <article key={game.id} className="game-feature"><GameArtwork game={game} /><div className="game-feature-body"><span className="game-category">{game.category} · ACTIVE TITLE</span><h2>{game.name}</h2><p>Published tournament listings for this game are loaded from Supabase.</p><Link className="text-link" to={`/tournaments?game=${game.slug}`}>FIND TOURNAMENTS <span>↗</span></Link></div></article>)}</div>
      {visible.length === 0 && <div className="empty-state"><span>NO ACTIVE GAMES</span><p>{games.length ? 'No active game matches this filter.' : 'There are currently no active game titles.'}</p>{selected && <button className="button button--outline" onClick={() => { setParams({}); setCategory('all') }}>Show all games</button>}</div>}
    </>}
    {state === 'loading' && <div className="empty-state" role="status"><span>LOADING ACTIVE GAMES</span><p>Fetching game titles from Supabase…</p></div>}
    {state === 'error' && <div className="empty-state" role="alert"><span>GAMES COULD NOT BE LOADED</span><p>{error}</p><button className="button button--outline" onClick={() => setReload(value => value + 1)}>Try again</button></div>}
  </div>
}
