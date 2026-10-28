import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { GameArtwork } from '../components/GameArtwork'
import { getSupabaseClient } from '../lib/supabase'
import type { SupabaseGame } from './tournamentRepository'
import type { TournamentDraftInput } from './tournamentDrafts'
import { playerFormatsForGame } from './tournamentFormats'
import type { PlayerFormat } from './tournamentFormats'
const emptyForm: TournamentDraftInput = {
  title: '', description: '', gameId: '', mode: '', playerFormat: 'Solo', bracketFormat: 'Single elimination', entryType: 'free', entryFeeMinor: 0, prizePoolMinor: 0, capacity: 32,
  registrationOpensAt: '', registrationClosesAt: '', checkInOpensAt: '', checkInClosesAt: '', start: '', rules: [], prizeDescription: '', bannerUrl: '',
}

function errorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = String(error.message)
    const code = 'code' in error ? String(error.code) : ''
    return code ? `Supabase error ${code}: ${message}` : message
  }
  return error instanceof Error ? error.message : 'The request failed. No local copy was saved.'
}

export function CreateTournamentDialog({ onClose, onSave }: { onClose: () => void; onSave: (input: TournamentDraftInput) => Promise<void> }) {
  const [form, setForm] = useState<TournamentDraftInput>(emptyForm)
  const [rulesText, setRulesText] = useState('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [availableGames, setAvailableGames] = useState<SupabaseGame[]>([])
  const [gamesLoading, setGamesLoading] = useState(true)
  const [gamesError, setGamesError] = useState('')
  const [authState, setAuthState] = useState<'checking' | 'signed-in' | 'signed-out' | 'error'>('checking')
  const [authMessage, setAuthMessage] = useState('')
  const set = <K extends keyof TournamentDraftInput,>(key: K, value: TournamentDraftInput[K]) => setForm(current => ({ ...current, [key]: value }))

  useEffect(() => {
    let mounted = true
    import('./tournamentRepository').then(({ listActiveGames }) => listActiveGames()).then(items => {
      if (!mounted) return
      setAvailableGames(items)
      setForm(current => ({ ...current, gameId: items.some(item => item.slug === current.gameId) ? current.gameId : items[0]?.slug ?? '' }))
    }).catch(reason => { if (mounted) setGamesError(errorMessage(reason)) })
      .finally(() => { if (mounted) setGamesLoading(false) })
    Promise.resolve().then(() => getSupabaseClient().auth.getUser()).then(({ data, error: authError }) => {
      if (!mounted) return
      if (authError && !/session missing|not authenticated/i.test(authError.message)) { setAuthState('error'); setAuthMessage(authError.message) }
      else setAuthState(data.user ? 'signed-in' : 'signed-out')
    }).catch(reason => {
      if (!mounted) return
      setAuthState('error')
      setAuthMessage(errorMessage(reason))
    })
    return () => { mounted = false }
  }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  const chosenGame = availableGames.find(game => game.slug === form.gameId)
  const playerFormats = playerFormatsForGame(chosenGame?.slug ?? form.gameId, form.mode)
  const bracketFormats = chosenGame?.category === 'Battle royale'
    ? ['Single elimination', 'Double elimination', 'Round robin', 'Battle royale']
    : ['Single elimination', 'Double elimination', 'Round robin']

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const rules = rulesText.split('\n').map(rule => rule.trim()).filter(Boolean)
    const registrationOpen = new Date(form.registrationOpensAt).getTime()
    const registrationClose = new Date(form.registrationClosesAt).getTime()
    const checkInOpen = new Date(form.checkInOpensAt).getTime()
    const checkInClose = new Date(form.checkInClosesAt).getTime()
    const starts = new Date(form.start).getTime()
    if (form.title.trim().length < 3) return setError('Enter a tournament name with at least 3 characters.')
    if (!form.description.trim() || !form.mode.trim() || !form.gameId || !form.playerFormat || !form.bracketFormat) return setError('Complete all required tournament details.')
    if (!Number.isInteger(form.capacity) || form.capacity < 2 || form.capacity > 10000) return setError(`Capacity must be a whole number between 2 and 10,000 ${form.playerFormat === 'Solo' ? 'player' : 'team'} slots.`)
    if (form.entryType === 'free' && form.entryFeeMinor !== 0) return setError('Free tournaments must have a UGX 0 entry fee.')
    if (!Number.isSafeInteger(form.entryFeeMinor) || form.entryFeeMinor < 0 || !Number.isSafeInteger(form.prizePoolMinor) || form.prizePoolMinor < 0) return setError('Entry fees and prize pools must be whole-number UGX amounts.')
    if (form.entryType === 'paid' && form.entryFeeMinor < 1) return setError('Paid tournaments must have an entry fee of at least UGX 1.')
    if (!playerFormats.includes(form.playerFormat)) return setError('Choose a player format supported by the selected game and mode.')
    if (![registrationOpen, registrationClose, checkInOpen, checkInClose, starts].every(Number.isFinite)) return setError('Enter all registration, check-in and start dates.')
    if (!(registrationOpen < registrationClose && registrationClose <= checkInOpen && checkInOpen < checkInClose && checkInClose <= starts)) return setError('Dates must follow this order: registration opens, registration closes, check-in opens, check-in closes, tournament starts.')
    if (rules.length === 0) return setError('Add at least one tournament rule.')
    if (form.bannerUrl && !URL.canParse(form.bannerUrl)) return setError('Enter a valid banner image URL or leave the field blank.')
    if (gamesLoading || gamesError || !availableGames.length) return setError(gamesError || 'Active games are still loading or unavailable.')
    if (authState === 'error') return setError(`Could not verify the Supabase Auth session: ${authMessage}`)
    if (authState !== 'signed-in') return setError('Sign in through Supabase Auth before creating a draft. The current login and registration screens are demo-only.')
    setError('')
    setSubmitting(true)
    try {
      await onSave({ ...form, rules })
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="admin-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !submitting) onClose() }}>
    <section className="admin-create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-tournament-title">
      <header className="admin-dialog-head"><div><span>SUPABASE DATABASE INSERT</span><h2 id="create-tournament-title">Create tournament</h2></div><button type="button" className="admin-dialog-close" onClick={onClose} aria-label="Close create tournament form" disabled={submitting}>×</button></header>
      <p className="admin-dialog-intro">This creates an owner-scoped draft in Supabase. Nothing is saved to browser storage. Draft creation requires a verified Supabase Auth session.</p>
      {authState === 'checking' && <p className="admin-inline-empty" role="status">Checking Supabase Auth session…</p>}
      {authState === 'signed-out' && <p className="admin-form-error" role="status">A Supabase Auth session is required. The current <Link to="/login">login page</Link> is demo-only and does not create an account or session.</p>}
      {authState === 'error' && <p className="admin-form-error" role="alert">Could not verify authentication: {authMessage}</p>}
      <form className="admin-create-form" onSubmit={submit} noValidate>
        <div className="admin-form-grid">
          <label className="wide">TOURNAMENT NAME<input autoFocus maxLength={80} value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Kampala Weekend Cup" required /></label>
          <label className="wide">DESCRIPTION<textarea rows={3} maxLength={500} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Describe the event for players" required /></label>
          <div className="admin-banner-field wide"><span>TOURNAMENT BANNER</span>{chosenGame && <GameArtwork game={chosenGame} bannerUrl={form.bannerUrl} />}<p>Optional banner URL is saved to banner_url. Leave it blank to use the bundled game-specific illustration.</p></div>
          <label>GAME<select value={form.gameId} disabled={gamesLoading || availableGames.length === 0} onChange={e => { const nextGame = availableGames.find(game => game.slug === e.target.value); const nextFormats = playerFormatsForGame(nextGame?.slug ?? e.target.value, form.mode); set('gameId', e.target.value); if (!nextFormats.includes(form.playerFormat)) set('playerFormat', nextFormats[0]); if (nextGame?.category !== 'Battle royale' && form.bracketFormat === 'Battle royale') set('bracketFormat', 'Single elimination') }}>{gamesLoading ? <option>Loading active games…</option> : availableGames.map(game => <option key={game.id} value={game.slug}>{game.name}</option>)}</select></label>
          <label>MODE<input maxLength={50} value={form.mode} onChange={e => { const mode = e.target.value; const nextFormats = playerFormatsForGame(form.gameId, mode); set('mode', mode); if (!nextFormats.includes(form.playerFormat)) set('playerFormat', nextFormats[0]) }} placeholder="e.g. Ranked" required /></label>
          <label>PLAYER FORMAT<select value={playerFormats.includes(form.playerFormat) ? form.playerFormat : playerFormats[0]} onChange={e => set('playerFormat', e.target.value as PlayerFormat)}>{playerFormats.map(value => <option key={value}>{value}</option>)}</select></label>
          <label>BRACKET FORMAT<select value={bracketFormats.includes(form.bracketFormat) ? form.bracketFormat : bracketFormats[0]} onChange={e => set('bracketFormat', e.target.value)}>{bracketFormats.map(value => <option key={value}>{value}</option>)}</select></label>
          <label>ENTRY TYPE<select value={form.entryType} onChange={e => { const entryType = e.target.value as TournamentDraftInput['entryType']; set('entryType', entryType); if (entryType === 'free') set('entryFeeMinor', 0) }}><option value="free">Free entry</option><option value="paid">Paid entry (draft only)</option></select></label>
          <label>ENTRY FEE <small>Whole UGX amount</small><input type="number" min={0} max={9007199254740991} step={1} value={form.entryFeeMinor} disabled={form.entryType === 'free'} onChange={e => set('entryFeeMinor', Number(e.target.value))} required /></label>
          <label>PRIZE POOL <small>Whole UGX amount</small><input type="number" min={0} max={9007199254740991} step={1} value={form.prizePoolMinor} onChange={e => set('prizePoolMinor', Number(e.target.value))} required /></label>
          <label>{form.playerFormat === 'Solo' ? 'CAPACITY · INDIVIDUAL PLAYER SLOTS' : 'CAPACITY · TEAM SLOTS'}<input type="number" min={2} max={10000} step={1} value={form.capacity} onChange={e => set('capacity', Number(e.target.value))} required /></label>
          <label>REGISTRATION OPENS<input type="datetime-local" value={form.registrationOpensAt} onChange={e => set('registrationOpensAt', e.target.value)} required /></label>
          <label>REGISTRATION CLOSES<input type="datetime-local" value={form.registrationClosesAt} onChange={e => set('registrationClosesAt', e.target.value)} required /></label>
          <label>CHECK-IN OPENS<input type="datetime-local" value={form.checkInOpensAt} onChange={e => set('checkInOpensAt', e.target.value)} required /></label>
          <label>CHECK-IN CLOSES<input type="datetime-local" value={form.checkInClosesAt} onChange={e => set('checkInClosesAt', e.target.value)} required /></label>
          <label>TOURNAMENT STARTS<input type="datetime-local" value={form.start} onChange={e => set('start', e.target.value)} required /></label>
          <label className="wide">RULES <small>One rule per line</small><textarea rows={4} value={rulesText} onChange={e => setRulesText(e.target.value)} placeholder={'Players must join on time.\nRespect the referee decision.'} required /></label>
          <label className="wide">PRIZE STRUCTURE <small>Describe placement or award rules. No payout is processed.</small><input maxLength={180} value={form.prizeDescription} onChange={e => set('prizeDescription', e.target.value)} placeholder="e.g. UGX 100,000 winner · UGX 50,000 runner-up" /></label>
          <label className="wide">BANNER IMAGE URL <small>Optional. Use a stable, publicly readable image URL.</small><input type="url" maxLength={1000} value={form.bannerUrl} onChange={e => set('bannerUrl', e.target.value)} placeholder="https://example.com/tournament-banner.jpg" /></label>
        </div>
        {gamesError && <p className="admin-form-error" role="alert">Could not load active games: {gamesError}</p>}
        {error && <p className="admin-form-error" role="alert">{error}</p>}
        {form.entryType === 'paid' && <p className="admin-form-error" role="status">Paid entry is saved as draft configuration only. Registration, payment verification, and publishing remain unavailable until payment integration is enabled.</p>}
        <div className="admin-dialog-actions"><button type="button" className="admin-button secondary" onClick={() => setPreview(value => !value)}>{preview ? 'Hide preview' : 'Preview tournament'}</button><span className="admin-dialog-spacer" /><button type="button" className="admin-button secondary" onClick={onClose} disabled={submitting}>Cancel</button><button type="submit" className="admin-button primary" disabled={submitting || gamesLoading || authState === 'checking'}>{submitting ? 'Saving to Supabase…' : 'Create tournament'}</button></div>
      </form>
      {preview && <aside className="admin-live-preview" aria-live="polite"><span>DATABASE PREVIEW · NOT SAVED YET</span><strong>{form.title.trim() || 'Tournament name'}</strong><p>{chosenGame?.name ?? 'Game'} · {form.playerFormat} · {form.mode || 'Mode'} · {form.bracketFormat}</p><small>{form.start ? `${new Date(form.start).toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Kampala' })} EAT` : 'Start date not set'} · {form.capacity || 0} slots</small><p>{form.description || 'Tournament description preview appears here.'}</p></aside>}
    </section>
  </div>
}
