import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { getSupabaseClient } from '../lib/supabase'
import { DemoNotice } from '../components/DemoNotice'

function messageFor(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message)
  return 'Authentication request failed. Please try again.'
}

export function AuthPage() {
  const isRegister = useLocation().pathname === '/register'
  const navigate = useNavigate()
  const { user, loading: sessionLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setMessage('')
    setErrors([])
  }, [isRegister])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next: string[] = []
    if (isRegister && name.trim().length < 2) next.push('Enter a player name with at least 2 characters.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.push('Enter a valid email address.')
    if (password.length < 8) next.push('Password must be at least 8 characters.')
    setErrors(next)
    setMessage('')
    if (next.length) return
    setSubmitting(true)
    try {
      const supabase = getSupabaseClient()
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() } },
        })
        if (error) throw error
        if (data.session) {
          navigate('/profile', { replace: true })
        } else {
          setMessage('Account created. Check your email to confirm your address before signing in.')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        navigate('/profile', { replace: true })
      }
    } catch (error) {
      setErrors([messageFor(error)])
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="auth-layout"><div className="auth-art"><div className="hero-grid"/><span className="auth-art-label">TRETMAX / PLAYER ACCESS</span><div className="auth-monogram">T<span>.</span></div><p>THE NEXT<br />MATCH STARTS<br /><em>WITH YOU.</em></p></div><section className="auth-panel"><div className="section-kicker"><span /> {isRegister ? 'JOIN THE ARENA' : 'WELCOME BACK'}</div><h1>{isRegister ? <>CREATE YOUR<br /><em>PLAYER CARD.</em></> : <>STEP BACK<br /><em>INTO PLAY.</em></>}</h1><p className="auth-subtitle">{isRegister ? 'Create your Tretmax account with Supabase Auth.' : 'Sign in to access your account and private tournament drafts.'}</p><DemoNotice>{sessionLoading ? 'Restoring your secure Supabase session…' : 'Your account is handled by Supabase Auth. Email confirmation may be required before your first sign-in.'}</DemoNotice>{user && <p className="form-success" role="status">You are already signed in as {user.email}. <Link to="/profile">Open your profile</Link>.</p>}{message && <p className="form-success" role="status">{message}</p>}{errors.length > 0 && <ul className="form-errors" role="alert">{errors.map(error => <li key={error}>{error}</li>)}</ul>}<form className="auth-form" onSubmit={submit} noValidate>{isRegister && <label>PLAYER NAME<input value={name} onChange={e => setName(e.target.value)} autoComplete="nickname" placeholder="How players know you" aria-invalid={errors.some(error => error.startsWith('Enter a player'))} disabled={submitting}/></label>}<label>EMAIL ADDRESS<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" aria-invalid={errors.some(error => error.startsWith('Enter a valid'))} disabled={submitting}/></label><label>PASSWORD<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={isRegister ? 'new-password' : 'current-password'} placeholder="At least 8 characters" aria-invalid={errors.some(error => error.startsWith('Password'))} disabled={submitting}/></label><button className="button button--lime" type="submit" disabled={submitting || sessionLoading}>{submitting ? 'PLEASE WAIT…' : isRegister ? 'CREATE ACCOUNT' : 'SIGN IN'} <span>↗</span></button></form><p className="auth-switch">{isRegister ? 'Already have a profile?' : 'New to Tretmax?'} <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Log in' : 'Create an account'} <span>↗</span></Link></p></section></div>
}
