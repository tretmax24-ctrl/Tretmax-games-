import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { previewTeamInviteCode, redeemTeamInviteCode, type TeamInvitePreview } from '../admin/teamRepository'
import { useAuth } from '../lib/auth'
import { DemoNotice } from '../components/DemoNotice'
import { PageHeading } from '../components/PageHeading'
import { isTeamInviteCode } from '../lib/teamInvite'

function captureCode(): string {
  const value = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('code') ?? ''
  if (value) window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`)
  return value
}

export function TeamInvitePage() {
  const location = useLocation(); const navigate = useNavigate(); const { user, loading } = useAuth()
  const [code, setCode] = useState(() => captureCode() || String((location.state as { inviteCode?: string } | null)?.inviteCode ?? ''))
  const [preview, setPreview] = useState<TeamInvitePreview | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error' | 'joined'>('idle')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => { if (!user || !code) return; if (!isTeamInviteCode(code)) { setError('The invitation is invalid or unavailable.'); setState('error'); return } let active = true; setState('loading'); previewTeamInviteCode(code).then(result => { if (active) { setPreview(result); setState('ready') } }).catch(reason => { if (active) { setError(reason instanceof Error ? reason.message : 'The invitation is invalid or unavailable.'); setState('error') } }); return () => { active = false } }, [code, user])
  function signIn() { navigate('/login', { state: { returnTo: '/teams/join', inviteCode: code } }) }
  async function redeem() { if (!preview || !code || !window.confirm(`Join ${preview.teamName} for ${preview.gameName}? This invitation can only be redeemed once.`)) return; setState('loading'); setError(''); try { const result = await redeemTeamInviteCode(code); if (!result.ok) { setError(`${result.code}: ${result.message}`); setState('error'); return } setMessage(result.message); setState('joined'); setCode('') } catch (reason) { setError(reason instanceof Error ? reason.message : 'The invitation could not be redeemed.'); setState('error') } }
  return <div className="section-wrap content-page"><PageHeading kicker="PRIVATE TEAM INVITE" title="JOIN THE" highlight="SQUAD." copy="Review this private invitation before you decide to join." />{!code && <DemoNotice>This invitation link is missing its private code. Ask the captain to issue a new link.</DemoNotice>}{!user && !loading && code && <div className="invite-card"><h2>Sign in to preview this invitation.</h2><p>The code stays in this browser session and is not written to the URL or local storage.</p><button className="button button--lime" type="button" onClick={signIn}>SIGN IN TO CONTINUE</button></div>}{state === 'loading' && <p className="empty-state" role="status">Checking the private invitation…</p>}{state === 'error' && <div className="empty-state" role="alert"><span>INVITATION UNAVAILABLE</span><p>{error}</p><Link className="button button--outline" to="/profile">Open profile</Link></div>}{state === 'ready' && preview && <div className="invite-card"><span className="game-category">TEAM INVITATION</span><h2>{preview.teamName}</h2><p>{preview.gameName}</p><p>Expires {new Date(preview.expiresAt).toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Kampala' })} EAT</p><button className="button button--lime" type="button" onClick={redeem}>ACCEPT INVITATION</button><p className="small-note">You must have an eligible linked game ID for this game. The invitation is one-use.</p></div>}{state === 'joined' && <div className="invite-card"><p className="form-success" role="status">{message}</p><Link className="button button--lime" to="/profile">VIEW YOUR TEAMS</Link></div>}</div>
}
