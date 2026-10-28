import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Brand } from './Brand'
import { useAuth } from '../lib/auth'

const items = [{ to: '/', label: 'Home', end: true }, { to: '/tournaments', label: 'Tournaments' }, { to: '/games', label: 'Games' }, { to: '/leaderboard', label: 'Leaderboard' }, { to: '/how-it-works', label: 'How it works' }]

export function Header() {
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const location = useLocation()
  const { user, signOut } = useAuth()
  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return <header className="site-header"><div className="header-inner">
    <Brand />
    <button className={`menu-toggle${open ? ' is-open' : ''}`} type="button" aria-expanded={open} aria-controls="main-navigation" aria-label={open ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => setOpen(value => !value)}><span /><span /></button>
    <nav id="main-navigation" className={`main-nav${open ? ' main-nav--open' : ''}`} aria-label="Main navigation">{items.map(item => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}>{item.label}</NavLink>)}</nav>
    <div className="header-actions">{user ? <><Link className="nav-login" to="/profile">{user.user_metadata?.display_name || user.email || 'Profile'}</Link><button className="nav-login" type="button" disabled={signingOut} onClick={async () => { setSigningOut(true); setSignOutError(''); try { await signOut() } catch (error) { setSignOutError(error instanceof Error ? error.message : 'Could not sign out.') } finally { setSigningOut(false) } }}>{signingOut ? 'Signing out…' : 'Sign out'}</button>{signOutError && <span role="alert" className="nav-login">{signOutError}</span>}</> : <><Link className="nav-login" to="/login">Log in</Link><Link className="button button--lime header-cta" to="/register">Create account <span aria-hidden="true">↗</span></Link></>}</div>
  </div></header>
}
