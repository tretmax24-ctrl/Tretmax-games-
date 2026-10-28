import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DemoNotice } from '../components/DemoNotice'
import { PageHeading } from '../components/PageHeading'
import { useAuth } from '../lib/auth'
import { loadPlayerProfile, saveGameAccount, savePlayerProfile, type PlayerGameAccount, type PlayerProfile } from '../lib/playerProfile'
import type { SupabaseGame } from '../admin/tournamentRepository'

function requestError(error: unknown) {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = String(error.message)
    const code = 'code' in error ? String(error.code) : ''
    return code ? `${message} (${code})` : message
  }
  return error instanceof Error ? error.message : 'The profile request failed.'
}

function verificationLabel(status: PlayerGameAccount['verificationStatus']) {
  return status === 'verified' ? 'REVIEWED BY TRETMAX' : status === 'pending' ? 'REVIEW PENDING' : status === 'rejected' ? 'REJECTED' : 'UNVERIFIED'
}

export function ProfilePage() {
  const { user, loading: authLoading } = useAuth()
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [accounts, setAccounts] = useState<PlayerGameAccount[]>([])
  const [games, setGames] = useState<SupabaseGame[]>([])
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [accountSaving, setAccountSaving] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [selectedGame, setSelectedGame] = useState('')
  const [gameUid, setGameUid] = useState('')
  const [inGameName, setInGameName] = useState('')
  const [editingId, setEditingId] = useState<string | undefined>()

  useEffect(() => {
    if (authLoading) return
    if (!user) { setState('idle'); return }
    let active = true
    setState('loading')
    setError('')
    loadPlayerProfile(user).then(result => {
      if (!active) return
      setProfile(result.profile)
      setAccounts(result.accounts)
      setGames(result.games)
      setDisplayName(result.profile?.displayName ?? user.user_metadata?.display_name ?? '')
      setUsername(result.profile?.username ?? '')
      setSelectedGame(current => current || result.games[0]?.databaseId || '')
      setState('ready')
    }).catch(reason => { if (active) { setError(requestError(reason)); setState('error') } })
    return () => { active = false }
  }, [authLoading, user])

  const accountByGame = useMemo(() => new Map(accounts.map(account => [account.gameId, account])), [accounts])
  const display = profile?.displayName || displayName || user?.email?.split('@')[0] || 'Guest Player'

  async function submitProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || profileSaving) return
    if (username.trim() && !/^[a-z0-9_]{3,24}$/i.test(username.trim())) { setError('Handle must be 3–24 characters using letters, numbers, or underscores.'); return }
    if (!displayName.trim()) { setError('Enter a display name.'); return }
    setProfileSaving(true); setError(''); setMessage('')
    try { const saved = await savePlayerProfile(user, { displayName, username }); setProfile(saved); setDisplayName(saved.displayName ?? ''); setUsername(saved.username ?? ''); setMessage('Profile saved to Supabase.') }
    catch (reason) { setError(requestError(reason)) }
    finally { setProfileSaving(false) }
  }

  function editAccount(account: PlayerGameAccount) {
    setEditingId(account.id); setSelectedGame(account.gameId); setGameUid(account.gameUid); setInGameName(account.inGameName ?? ''); setError(''); setMessage('')
  }

  function resetAccountForm() { setEditingId(undefined); setGameUid(''); setInGameName(''); setError(''); setMessage('') }

  async function submitAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || accountSaving) return
    if (!selectedGame) { setError('Choose an active game.'); return }
    if (!gameUid.trim()) { setError('Enter the in-game ID exactly as it appears in the game.'); return }
    if (!inGameName.trim()) { setError('Enter the in-game display name.'); return }
    setAccountSaving(true); setError(''); setMessage('')
    try { const saved = await saveGameAccount(user, { id: editingId, gameId: selectedGame, gameUid: gameUid.trim(), inGameName }); setAccounts(current => editingId ? current.map(account => account.id === saved.id ? saved : account) : [...current, saved]); setMessage('Game account saved. It is unverified until Tretmax reviews it.'); resetAccountForm() }
    catch (reason) { setError(requestError(reason)) }
    finally { setAccountSaving(false) }
  }

  if (authLoading) return <div className="section-wrap content-page"><DemoNotice>Restoring your Supabase Auth session…</DemoNotice></div>
  if (!user) return <div className="section-wrap content-page"><PageHeading kicker="PLAYER CARD" title="YOUR PLACE IN" highlight="THE ARENA." copy="Sign in to create your profile and link your game accounts."/><DemoNotice>You aren't signed in. <Link to="/login">Sign in with Supabase Auth</Link> to access your profile.</DemoNotice></div>

  return <div className="section-wrap content-page"><PageHeading kicker="PLAYER CARD" title="YOUR PLACE IN" highlight="THE ARENA." copy="Manage your player identity and manually linked game accounts."/>
    {state === 'loading' && <DemoNotice>Loading your profile and linked game accounts…</DemoNotice>}
    {state === 'error' && <p className="form-errors" role="alert">{error}</p>}
    {message && <p className="form-success" role="status">{message}</p>}
    <section className="profile-card"><div className="profile-avatar">{display.slice(0, 1).toUpperCase()}</div><div className="profile-info"><span className="game-category">SUPABASE ACCOUNT</span><h2>{display}</h2><p>{user.email}</p></div><Link className="button button--outline" to="/admin/tournaments">MANAGE DRAFTS <span>↗</span></Link><div className="profile-stats"><div><strong>0</strong><span>WINS</span></div><div><strong>0</strong><span>TOURNAMENTS</span></div><div><strong>—</strong><span>RANK</span></div></div></section>
    <section className="profile-editor"><div className="section-heading"><div><div className="section-kicker"><span /> PLAYER PROFILE</div><h2>SET YOUR <em>HANDLE.</em></h2></div></div><form className="profile-form" onSubmit={submitProfile}><label>DISPLAY NAME<input value={displayName} maxLength={80} onChange={event => setDisplayName(event.target.value)} placeholder="How players know you" /></label><label>PUBLIC HANDLE <small>3–24 letters, numbers or underscores</small><input value={username} maxLength={24} onChange={event => setUsername(event.target.value)} placeholder="kampala_ghost" /></label><button className="button button--outline" type="submit" disabled={profileSaving}>{profileSaving ? 'SAVING…' : 'SAVE PROFILE'}</button></form></section>
    <section className="profile-games"><div className="section-heading"><div><div className="section-kicker"><span /> YOUR GAME ACCOUNTS</div><h2>READY TO <em>LINK UP?</em></h2></div></div><p className="profile-explain">Enter the identifiers players use in-game. IDs are stored as text so leading zeroes and non-numeric formats are preserved. Tretmax review is manual; no publisher API or game password is required.</p><form className="profile-form game-account-form" onSubmit={submitAccount}><label>GAME<select value={selectedGame} onChange={event => setSelectedGame(event.target.value)} disabled={Boolean(editingId)}><option value="">Choose an active game</option>{games.map(game => <option key={game.databaseId} value={game.databaseId}>{game.name}</option>)}</select></label><label>IN-GAME ID<input value={gameUid} maxLength={120} onChange={event => setGameUid(event.target.value)} placeholder="Enter the exact ID" /></label><label>IN-GAME NAME<input value={inGameName} maxLength={80} onChange={event => setInGameName(event.target.value)} placeholder="Your display name in the game" /></label><button className="button button--lime" type="submit" disabled={accountSaving || state !== 'ready'}>{accountSaving ? 'SAVING…' : editingId ? 'UPDATE GAME ID' : 'LINK GAME ID'}</button>{editingId && <button className="button button--outline" type="button" onClick={resetAccountForm}>CANCEL</button>}</form><div className="profile-game-grid">{games.map(game => { const account = accountByGame.get(game.databaseId); return <article key={game.databaseId}><span className="account-game-mark">{game.shortName.slice(0, 2)}</span><span>{game.name}</span><strong>{account ? verificationLabel(account.verificationStatus) : 'NOT LINKED'}</strong>{account && <><small>{account.inGameName} · ID {account.gameUid}</small><button className="text-link" type="button" onClick={() => editAccount(account)}>EDIT</button></>}</article> })}</div><p className="small-note">Deleting an account is not enabled because the current database policy does not grant client-side deletion. Contact Tretmax support if an ID must be removed.</p><Link className="text-link" to="/how-it-works">Learn how game accounts work <span>↗</span></Link></section>
  </div>
}

