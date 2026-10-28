import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase'
import { supabaseConfig } from './supabaseConfig'
import { AuthContext, type AuthState } from './auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabaseConfig.isConfigured) {
      setError(supabaseConfig.issues.join('; '))
      setLoading(false)
      return
    }
    const supabase = getSupabaseClient()
    let mounted = true
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return
      if (sessionError) setError(sessionError.message)
      setSession(data.session)
      setLoading(false)
    }).catch(reason => {
      if (!mounted) return
      setError(reason instanceof Error ? reason.message : 'Could not restore the Supabase Auth session.')
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      setError('')
      setLoading(false)
    })
    return () => { mounted = false; listener.subscription.unsubscribe() }
  }, [])

  const value = useMemo<AuthState>(() => ({
    user: session?.user ?? null,
    session,
    loading,
    error,
    signOut: async () => {
      const { error: signOutError } = await getSupabaseClient().auth.signOut()
      if (signOutError) throw signOutError
    },
  }), [session, loading, error])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

