const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''

const issues: string[] = []

if (!url) {
  issues.push('VITE_SUPABASE_URL is missing')
} else {
  try {
    const parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      issues.push('VITE_SUPABASE_URL must use http or https')
    } else if (url === 'https://your-project.supabase.co') {
      issues.push('Replace the example VITE_SUPABASE_URL with your project URL')
    }
  } catch {
    issues.push('VITE_SUPABASE_URL must be a valid URL')
  }
}

if (!publishableKey) {
  issues.push('VITE_SUPABASE_PUBLISHABLE_KEY is missing')
} else if (publishableKey === 'your-supabase-publishable-key') {
  issues.push('Replace the example VITE_SUPABASE_PUBLISHABLE_KEY with your publishable key')
}

export const supabaseValues = { url, publishableKey }
export const supabaseConfig = { isConfigured: issues.length === 0, issues }
