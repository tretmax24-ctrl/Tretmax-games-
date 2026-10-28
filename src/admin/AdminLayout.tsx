import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { AdminContext } from './AdminContext'
import { adminNavigation, adminRoleFromUser, hasPermission, roleLabels, type AdminPermission } from './permissions'
import { useAuth } from '../lib/auth'

const pageTitles: Record<string, string> = {
  '/admin': 'Operations overview', '/admin/tournaments': 'Tournament management', '/admin/players': 'Players & game accounts',
  '/admin/matches': 'Match verification', '/admin/finance': 'Finance review', '/admin/content': 'Content management',
  '/admin/staff': 'Staff & access', '/admin/settings': 'Platform settings',
}

export function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const { user, loading: authLoading } = useAuth()
  const role = adminRoleFromUser(user)
  const title = pageTitles[location.pathname] ?? 'Administration'
  useEffect(() => setMobileOpen(false), [location.pathname])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  if (authLoading) return <AdminProductionGate title="Checking accessâ€¦" message="Restoring your Supabase Auth session before loading administration." />
  if (!user) return <AdminProductionGate title="Sign-in required." message="Administration is available only to authenticated staff accounts." login />
  if (!role) return <AdminProductionGate title="Staff access is not assigned." message="Your account is signed in, but it has no server-issued Tretmax staff role." />
  const links = adminNavigation.filter(item => hasPermission(role, item.permission))
  return <AdminContext.Provider value={{ role }}><div className="admin-app">
    <button className={`admin-scrim${mobileOpen ? ' is-visible' : ''}`} aria-label="Close admin navigation" onClick={() => setMobileOpen(false)} />
    <aside className={`admin-sidebar${mobileOpen ? ' is-open' : ''}`} aria-label="Admin sidebar">
      <Link className="admin-brand" to="/" aria-label="Tretmax Games home"><span className="admin-brand-mark">T</span><span>TRETM<em>AX</em><small>GAMES / OPERATIONS</small></span></Link>
      <div className="admin-sidebar-label">WORKSPACE</div>
      <nav className="admin-nav" aria-label="Administration">{links.map(item => <NavLink key={item.to} to={item.to} end={item.to === '/admin'} className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}><span aria-hidden="true">{item.icon}</span>{item.label}{item.to === '/admin/matches' && <i className="admin-nav-dot" />}</NavLink>)}</nav>
      <div className="admin-sidebar-bottom"><span className="admin-side-indicator" />AUTHORIZED WORKSPACE<small>Server-issued role required</small></div>
    </aside>
    <section className="admin-main">
      <header className="admin-topbar"><button className="admin-mobile-toggle" onClick={() => setMobileOpen(value => !value)} aria-expanded={mobileOpen} aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}><span>â˜°</span></button><div><div className="admin-breadcrumb">TRETM<em>AX</em> <span>/</span> ADMIN</div><h1>{title}</h1></div><div className="admin-top-actions"><span className="admin-env-pill"><i /> AUTHENTICATED STAFF</span><div className="admin-notifications" aria-label="Notifications"><span aria-hidden="true">â™§</span><small>No alerts</small></div><details className="admin-account-menu"><summary><span className="admin-account-avatar">{(user.user_metadata?.display_name || user.email || 'S').slice(0, 1).toUpperCase()}</span><span>{user.user_metadata?.display_name || user.email || 'Staff account'}<small>{roleLabels[role]}</small></span><i>âŒ„</i></summary><div className="admin-account-popover"><strong>SERVER-ISSUED ROLE</strong><p>Access is derived from Supabase app_metadata and must also be enforced by database policies.</p><Link to="/profile">Open profile <span>â†—</span></Link></div></details></div></header>
      <div className="admin-preview-banner"><strong>AUTHORIZATION ACTIVE</strong><span>UI access uses the signed-in account's server-issued staff role. Database RLS remains the enforcement boundary for privileged operations.</span></div>
      <main className="admin-content"><Outlet /></main>
      <footer className="admin-footer"><span>TRETM<em>AX</em> GAMES OPERATIONS</span><span>AUTHENTICATED WORKSPACE Â· RLS BOUNDARY</span></footer>
    </section>
  </div></AdminContext.Provider>
}

export function AdminProductionGate({ title = 'Staff access is not configured.', message = 'Production administration requires Supabase authentication and a server-issued staff role.', login = false }: { title?: string; message?: string; login?: boolean }) {
  return <main className="admin-production-gate"><div className="admin-brand-mark">T</div><p>ADMIN ACCESS</p><h1>{title}</h1><span>{message}</span><Link to={login ? '/login' : '/'}>{login ? 'Sign in to Tretmax' : 'Return to Tretmax Games'}</Link></main>
}

export function AdminPermissionGate({ permission, children }: { permission: AdminPermission; children: ReactNode }) {
  const { user } = useAuth()
  const role = adminRoleFromUser(user)
  if (!role || !hasPermission(role, permission)) return <section className="admin-permission-denied"><div className="admin-eyebrow"><i />ACCESS / RESTRICTED</div><h2>This area is not available to your staff role.</h2><p>Your account does not have the server-issued permission required for this area.</p><Link to="/admin">Return to overview â†—</Link></section>
  return children
}

export function AdminPageHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return <div className="admin-page-heading"><div><div className="admin-eyebrow"><i />{eyebrow}</div><h2>{title}</h2><p>{description}</p></div>{children && <div className="admin-heading-actions">{children}</div>}</div>
}

