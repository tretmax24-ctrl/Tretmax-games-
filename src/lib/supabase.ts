import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseConfig, supabaseValues } from './supabaseConfig'

export { supabaseConfig } from './supabaseConfig'

let client: SupabaseClient | undefined

/** Create the browser client only when a future integration explicitly requests it. */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseConfig.isConfigured) {
    throw new Error(`Supabase is not configured: ${supabaseConfig.issues.join('; ')}`)
  }

  if (!client) {
    client = createClient(supabaseValues.url, supabaseValues.publishableKey)
  }

  return client
}
