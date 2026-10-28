import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export type AuthState = {
  user: User | null
  session: Session | null
  loading: boolean
  error: string
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
