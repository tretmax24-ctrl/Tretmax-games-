import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { games } from '../data/tournaments'
import { AdminPageHeading } from './AdminLayout'
import { useAdminContext } from './AdminContext'
import { hasPermission } from './permissions'
import { CreateTournamentDialog } from './CreateTournamentDialog'
import type { OwnedTournamentDraft } from './tournamentRepository'
import type { TournamentDraftInput } from './tournamentDrafts'

function EmptyTable({ title, note, columns }: { title: string; note: string; columns: string[] }) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody><tr><td colSpan={columns.length}><div className="admin-empty"><span className="admin-empty-icon">âŒ</span><strong>{title}</strong><p>{note}</p></div></td></tr></tbody></table></div>
}

function Notice({ children, tone = 'neutral' }: { children: string; tone?: 'neutral' | 'warning' }) { return <div className={`admin-notice ${tone}`}><span>â“˜</span>{children}</div> }

function PageActions({ label, disabled = true, disabledTitle = 'Available after backend integration', onClick }: { label: string; disabled?: boolean; disabledTitle?: string; onClick?: () => void }) {
  return <button className="admin-button primary" disabled={disabled} title={disabled ? disabledTitle : undefined} onClick={onClick}>{label}<span aria-hidden="true">ï¼‹</span></button>
}

export function AdminOverview() {
  const { role } = useAdminContext()
  const sections = [
    { title: 'Tournament operations', detail: 'No connected tournament records', to: '/admin/tournaments', permission: 'tournaments.read' as const, code: '01' },
    { title: 'Player accounts', detail: 'Player data is not connected', to: '/admin/players', permission: 'players.read' as const, code: '02' },
    { title: 'Match review', detail: 'No match evidence or disputes loaded', to: '/admin/matches', permission: 'matches.read' as const, code: '03' },
    { title: 'Finance queue', detail: 'No payment requests loaded', to: '/admin/finance', permission: 'finance.read' as const, code: '04' },
  ].filter(item => role ? hasPermission(role, item.permission) : false)
  const displayRole = role ?? 'unassigned'
  return <>
    <AdminPageHeading eyebrow="CONTROL ROOM / 01" title="Good to see you." description="A clear view of the platform's operational areas. Connect a trusted backend before managing live records." />
    <Notice tone="warning">This workspace shows no live operational counts. Access is granted only when Supabase Auth supplies a server-issued staff role; database RLS remains the security boundary for privileged operations.</Notice>
    <div className="admin-overview-top"><div className="admin-panel admin-overview-lead"><div className="admin-panel-kicker">PLATFORM STATUS <span className="admin-status status-neutral">AUTHENTICATED</span></div><h3>Operations are<br /><em>standing by.</em></h3><p>Identity comes from Supabase Auth and the visible role comes from server-issued app metadata. Operational records remain unavailable until their backend authorization is connected.</p><Link to="/admin/settings" className="admin-inline-link">View integration plan <span>â†—</span></Link><div className="admin-grid-mark" aria-hidden="true" /></div><div className="admin-panel admin-checklist"><div className="admin-panel-kicker">BEFORE LAUNCH</div>{[['01', 'Connect Supabase Auth', 'Required'], ['02', 'Implement role authorization', 'Required'], ['03', 'Add an immutable audit trail', 'Required'], ['04', 'Review staff access workflow', 'Pending']].map(item => <div className="admin-check-row" key={item[0]}><b>{item[0]}</b><span>{item[1]}</span><small>{item[2]}</small></div>)}</div></div>
    <div className="admin-section-title"><div><span>YOUR WORKSPACE</span><h3>Operational areas</h3></div><span className="admin-demo-tag">NO LIVE COUNTS</span></div>
    <div className="admin-area-grid">{sections.map(item => <Link className="admin-area-card" to={item.to} key={item.to}><span className="admin-area-code">{item.code} / AREA</span><strong>{item.title}</strong><small>{item.detail}</small><i>â†—</i></Link>)}</div>
    <div className="admin-bottom-grid"><div className="admin-panel"><div className="admin-panel-kicker">RECENT ACTIVITY <span className="admin-demo-tag">EMPTY STATE</span></div><div className="admin-inline-empty">Audit activity will appear after the server-side audit log is connected.</div></div><div className="admin-panel"><div className="admin-panel-kicker">SERVER-ISSUED ROLE</div><div className="admin-role-summary"><span className="admin-avatar">{displayRole.slice(0, 1).toUpperCase()}</span><div><strong>{displayRole.replaceAll('_', ' ')}</strong><small>Read from trusted Supabase Auth metadata</small></div></div><p className="admin-subtle">This role is presentation state only; RLS and trusted server functions must enforce every privileged action.</p></div></div>
  </>
}

export function AdminTournaments() {
  const { role } = useAdminContext()
  const canManageTournaments = role ? hasPermission(role, 'tournaments.manage') : false
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')
  const [drafts, setDrafts] = useState<OwnedTournamentDraft[]>([])
  const [userId, setUserId] = useState('')
  const [recordsState, setRecordsState] = useState<'loading' | 'ready' | 'signed-out' | 'error'>('loading')
  const [recordsError, setRecordsError] = useState('')
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [publishMessage, setPublishMessage] = useState('')
  const [publishError, setPublishError] = useState('')
  const [reloadRecords, setReloadRecords] = useState(0)
  useEffect(() => {
    let current = true
    setRecordsState('loading')
    setRecordsError('')
    import('./tournamentRepository').then(({ listMyTournamentDrafts }) => listMyTournamentDrafts()).then(result => {
      if (!current) return
      setUserId(result.userId)
      setDrafts(result.drafts)
      setRecordsState(result.userId ? 'ready' : 'signed-out')
    }).catch((error: unknown) => {
      if (!current) return
      setRecordsError(error instanceof Error ? error.message : 'Supabase draft request failed.')
      setRecordsState('error')
    })
    return () => { current = false }
  }, [reloadRecords])
  const filtered = drafts.filter(item => `${item.title} ${item.gameName} ${item.format}`.toLowerCase().includes(query.toLowerCase()))
  async function createRecord(input: TournamentDraftInput) {
    const { createTournamentRecord, listMyTournamentDrafts } = await import('./tournamentRepository')
    const created = await createTournamentRecord(input)
    const refreshed = await listMyTournamentDrafts()
    setUserId(refreshed.userId)
    setDrafts(refreshed.drafts)
    setRecordsState('ready')
    if (!refreshed.drafts.some(record => record.id === created.id)) throw new Error(`The insert and owner read succeeded, but the refreshed draft list did not contain ${created.title}. Persistence is unverified.`)
    setCreateOpen(false)
    setSavedMessage(`â€œ${created.title}â€ was inserted and returned in your owner-scoped Supabase draft list.`)
  }
  async function publishRecord(draft: OwnedTournamentDraft) {
    if (role !== 'owner' || draft.createdBy !== userId || publishingId) return
    const summary = [
      `Tournament: ${draft.title}`,
      `Game: ${draft.gameName}`,
      `Format: ${draft.format}`,
      `Starts: ${draft.start ? new Date(draft.start).toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Kampala' }) : 'Not scheduled'} EAT`,
      `Capacity: ${draft.capacity || 'Not set'}`,
      '',
      'Publishing changes this draft to Registration open. The server will reject expired or invalid registration dates.',
    ].join('\n')
    if (!window.confirm(`${summary}\n\nPublish this tournament?`)) return
    setPublishingId(draft.id)
    setPublishMessage('')
    setPublishError('')
    try {
      const { publishTournamentRecord, listMyTournamentDrafts } = await import('./tournamentRepository')
      const published = await publishTournamentRecord(draft.id)
      const refreshed = await listMyTournamentDrafts()
      setUserId(refreshed.userId)
      setDrafts(refreshed.drafts)
      setRecordsState('ready')
      setPublishMessage(`“${draft.title}” is now Registration open and was confirmed in the public tournament listing.`)
      if (published.status !== 'registration_open') throw new Error('The server returned an unexpected publishing status.')
    } catch (error: unknown) {
      setPublishError(error instanceof Error ? error.message : 'The tournament could not be published.')
    } finally {
      setPublishingId(null)
    }
  }
  return <>
    <AdminPageHeading eyebrow="OPERATIONS / TOURNAMENTS" title="Tournament desk" description="Review your private draft records and create new drafts with your verified Supabase account."><PageActions label="Create tournament" disabled={!canManageTournaments} disabledTitle="Requires the server-issued tournaments.manage permission" onClick={() => { setSavedMessage(''); setCreateOpen(true) }} /></AdminPageHeading>
    <Notice>Drafts in this workspace are fetched for the signed-in account. Only the Owner sees Publish actions; paid drafts remain blocked until payment integration is enabled. The RPC validates ownership, role, and registration dates on the server.</Notice>
    {savedMessage && <p className="admin-draft-success" role="status">{savedMessage}</p>}
    {publishMessage && <p className="admin-draft-success" role="status">{publishMessage}</p>}
    {publishError && <p className="admin-record-error" role="alert">{publishError}</p>}
    <section className="admin-published-records" aria-labelledby="owned-drafts-title">
      <div className="admin-section-title"><div><span>SUPABASE / PRIVATE TO YOUR ACCOUNT</span><h3 id="owned-drafts-title">Your tournament drafts</h3></div><button className="admin-button secondary" type="button" disabled={recordsState === 'loading'} onClick={() => setReloadRecords(value => value + 1)}>Refresh drafts</button></div>
      <div className="admin-toolbar"><label className="admin-search"><span>âŒ•</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your drafts" aria-label="Search your drafts" /></label></div>
      {recordsState === 'loading' && <p className="admin-inline-empty" role="status">Checking Supabase Auth and loading your draftsâ€¦</p>}
      {recordsState === 'signed-out' && <p className="admin-inline-empty" role="status">No Supabase Auth session. Sign in through Supabase Auth before loading private drafts.</p>}
      {recordsState === 'error' && <div className="admin-record-error" role="alert"><span>{recordsError}</span><button className="admin-button secondary" type="button" onClick={() => setReloadRecords(value => value + 1)}>Try again</button></div>}
      {recordsState === 'ready' && (filtered.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>TOURNAMENT</th><th>GAME</th><th>FORMAT</th><th>STARTS</th><th>CAPACITY</th><th>BANNER</th>{role === 'owner' && <th>ACTION</th>}</tr></thead><tbody>{filtered.map(item => { const paid = item.entryFee > 0; return <tr key={item.id}><td><div className="admin-event-cell"><div><strong>{item.title}</strong><small>PRIVATE DRAFT Â· {item.createdBy === userId ? 'YOUR ACCOUNT' : 'HIDDEN'}</small></div></div></td><td>{item.gameName}</td><td>{item.format}</td><td>{item.start ? new Date(item.start).toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Kampala' }) : 'Not scheduled'}</td><td>{item.capacity || 'Not set'}</td><td>{item.bannerUrl ? 'Custom URL' : 'Game artwork'}</td>{role === 'owner' && <td><button className="admin-button secondary" type="button" disabled={publishingId !== null || paid} title={paid ? 'Paid publishing is unavailable until payment integration is enabled' : undefined} onClick={() => publishRecord(item)}>{paid ? 'Paid draft' : publishingId === item.id ? 'Publishing…' : 'Publish'}</button></td>}</tr> })}</tbody></table></div> : <p className="admin-inline-empty">{drafts.length ? 'No drafts match your search.' : 'No private tournament drafts yet. Create a draft after signing in through Supabase Auth.'}</p>)}
    </section>
    {createOpen && <CreateTournamentDialog onClose={() => setCreateOpen(false)} onSave={createRecord} />}
  </>
}

export function AdminPlayers() {
  const [query, setQuery] = useState('')
  return <><AdminPageHeading eyebrow="OPERATIONS / PLAYERS" title="Players & accounts" description="Account lookup and game identity review will be available after trusted admin access is implemented."><PageActions label="Export players" /></AdminPageHeading><Notice>Player profiles and game accounts are not connected. Search is ready for integration but has no live records to filter.</Notice><div className="admin-toolbar"><label className="admin-search"><span>âŒ•</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search username or game ID" aria-label="Search players" /></label><label className="admin-select"><span>GAME ACCOUNT</span><select><option>All games</option>{games.map(game => <option key={game.id}>{game.name}</option>)}</select></label><label className="admin-select"><span>VERIFICATION</span><select><option>Any status</option><option>Verified</option><option>Pending</option><option>Unverified</option></select></label></div><EmptyTable title={query ? 'No matching players' : 'No player records loaded'} note="Connect authenticated player data and server-side authorization to review player profiles." columns={['PLAYER', 'GAME ACCOUNTS', 'TOURNAMENTS', 'STATUS', 'JOINED']} /></>
}

export function AdminMatches() {
  const [tab, setTab] = useState('All queue')
  return <><AdminPageHeading eyebrow="OPERATIONS / MATCHES" title="Result review" description="Review evidence and disputes with a traceable referee workflow."><PageActions label="Open review queue" /></AdminPageHeading><Notice tone="warning">Match verification is unavailable until assigned referee permissions, evidence storage, and an auditable server-side decision flow are implemented.</Notice><div className="admin-tabs" role="tablist" aria-label="Match queue filters">{['All queue', 'Evidence review', 'Disputes'].map(item => <button role="tab" aria-selected={tab === item} className={tab === item ? 'selected' : ''} onClick={() => setTab(item)} key={item}>{item}</button>)}</div><EmptyTable title="No matches in this queue" note={`${tab} has no connected records. No results will be verified in this preview.`} columns={['MATCH', 'TOURNAMENT', 'PLAYERS', 'EVIDENCE', 'STATUS', 'ACTION']} /></>
}

export function AdminFinance() {
  const [query, setQuery] = useState('')
  return <><AdminPageHeading eyebrow="OPERATIONS / FINANCE" title="Financial review" description="Payment requests and transaction records need trusted server-side processing before they can appear here." /><Notice tone="warning">Deposits, withdrawals, payouts, and financial approvals are unavailable. No money movement or transaction data is connected.</Notice><div className="admin-finance-note"><div className="admin-finance-icon">UGX</div><div><strong>Currency display: UGX</strong><p>Amounts will use the tournament or transaction currency returned by the backend. This workspace contains no financial amounts.</p></div><span>NO TRANSACTION DATA</span></div><div className="admin-toolbar"><label className="admin-search"><span>âŒ•</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search reference or player" aria-label="Search financial records" /></label><label className="admin-select"><span>TYPE</span><select><option>All requests</option><option>Deposit</option><option>Withdrawal</option></select></label><label className="admin-select"><span>STATUS</span><select><option>Any status</option><option>Pending</option><option>Processing</option><option>Completed</option></select></label></div><EmptyTable title={query ? 'No matching requests' : 'No payment requests loaded'} note="Finance data is private and will only be accessible through authenticated, server-authorized operations." columns={['REQUEST', 'PLAYER', 'DIRECTION', 'AMOUNT (UGX)', 'STATUS', 'REVIEW']} /></>
}

export function AdminContent() {
  const [message, setMessage] = useState('')
  const [draft, setDraft] = useState('')
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setMessage(draft.trim() ? 'Preview saved in this page only. Nothing was published or stored.' : 'Enter a short announcement before saving this preview.') }
  return <><AdminPageHeading eyebrow="OPERATIONS / CONTENT" title="Content desk" description="Manage public-facing announcements and featured placements after content storage is connected."><PageActions label="Add banner" /></AdminPageHeading><Notice>Content controls are local preview only. No banner, announcement, or featured tournament can be published.</Notice><div className="admin-content-grid"><section className="admin-panel"><div className="admin-panel-kicker">ANNOUNCEMENT PREVIEW <span className="admin-demo-tag">NOT PUBLISHED</span></div><form className="admin-form" onSubmit={submit}><label>Announcement text<input maxLength={120} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Write a short preview announcement" /></label><div className="admin-form-help">{draft.length}/120 characters</div><button className="admin-button secondary" type="submit">Save local preview</button>{message && <p className="admin-feedback" role="status">{message}</p>}</form></section><section className="admin-panel"><div className="admin-panel-kicker">FEATURED TOURNAMENTS</div><div className="admin-inline-empty">No featured placements configured. Connect content management to choose published events.</div></section><section className="admin-panel"><div className="admin-panel-kicker">HOMEPAGE ARTWORK</div><div className="admin-inline-empty">Artwork library is not connected. Existing site illustrations remain unchanged.</div></section></div></>
}

export function AdminStaff() {
  return <><AdminPageHeading eyebrow="ACCESS / STAFF" title="Staff access" description="Staff invitations and role changes must only be available to verified Owners."><PageActions label="Invite staff" /></AdminPageHeading><Notice tone="warning">This screen does not list or invite real staff. Role changes require server-side checks, audit logging, and protection for the last Owner.</Notice><div className="admin-staff-callout"><span>OWNER CONTROL</span><strong>Role assignments are not stored in profiles or browser state.</strong><p>In this preview, the role selector only changes navigation visibility in memory. It is not an invitation or account permission.</p></div><EmptyTable title="No staff directory connected" note="A trusted staff-membership source and secure invitation endpoint are prerequisites." columns={['STAFF MEMBER', 'ROLE', 'STATUS', 'LAST ACTIVE', 'ACTIONS']} /></>
}

export function AdminSettings() {
  const [query, setQuery] = useState('')
  return <><AdminPageHeading eyebrow="PLATFORM / SETTINGS" title="Platform settings" description="Configuration and audit history are intentionally unavailable until server authorization is in place." /><Notice tone="warning">No platform settings are being read or changed. The existing Supabase migration has not been modified.</Notice><div className="admin-settings-grid"><section className="admin-panel"><div className="admin-panel-kicker">INTEGRATION STATUS</div>{[['Authentication', 'Not connected'], ['Role authorization', 'Not implemented'], ['Audit log', 'Not configured'], ['Database', 'Not connected']].map(row => <div className="admin-setting-row" key={row[0]}><span>{row[0]}</span><strong>{row[1]}</strong></div>)}<Link className="admin-inline-link" to="/admin">Back to overview â†—</Link></section><section className="admin-panel"><div className="admin-panel-kicker">AUDIT LOG <span className="admin-demo-tag">NO DATA</span></div><label className="admin-search"><span>âŒ•</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search audit events" aria-label="Search audit events" /></label><div className="admin-inline-empty">{query ? 'No matching audit events.' : 'Audit events will appear after immutable server-side logging is implemented.'}</div></section></div><p className="admin-security-link"><strong>Security implementation note</strong><span>Review <code>docs/admin-security.md</code> for the future Owner provisioning and authorization plan.</span></p></>
}

