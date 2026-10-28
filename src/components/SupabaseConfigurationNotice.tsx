import { supabaseConfig } from '../lib/supabaseConfig'

export function SupabaseConfigurationNotice() {
  if (supabaseConfig.isConfigured) return null

  return (
    <aside className="supabase-setup-notice" role="status" aria-live="polite">
      <strong>Supabase setup needed</strong>
      <span>
        The app is using its local demo data. Copy <code>.env.example</code> to{' '}
        <code>.env.local</code>, add your project URL and publishable key, then restart Vite.
      </span>
      <details>
        <summary>Configuration details</summary>
        <ul>
          {supabaseConfig.issues.map((issue) => <li key={issue}>{issue}</li>)}
        </ul>
      </details>
    </aside>
  )
}
