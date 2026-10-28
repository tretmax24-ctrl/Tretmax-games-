export type CheckInInput = {
  status: string
  ownsEntry: boolean
  alreadyCheckedIn: boolean
  now: Date
  opensAt: string | null
  closesAt: string | null
}

export type CheckInDecision = { allowed: true } | { allowed: false; code: 'NOT_REGISTERED' | 'ALREADY_CHECKED_IN' | 'TOURNAMENT_NOT_IN_CHECK_IN' | 'CHECK_IN_NOT_STARTED' | 'CHECK_IN_CLOSED' | 'CHECK_IN_WINDOW_UNCONFIGURED' }

export function validateTeamName(name: string): string | null {
  const value = name.trim()
  if (value.length < 3) return 'Team name must be at least 3 characters.'
  if (value.length > 40) return 'Team name must be 40 characters or fewer.'
  return null
}

export function validateRosterSize(size: number, minimum: number, maximum: number, locked: boolean): string | null {
  if (locked) return 'The roster is already locked.'
  if (!Number.isInteger(size) || size < minimum) return `Add at least ${minimum} active member${minimum === 1 ? '' : 's'}.`
  if (size > maximum) return `A roster cannot exceed ${maximum} members.`
  return null
}

export function checkInDecision(input: CheckInInput): CheckInDecision {
  if (!input.ownsEntry) return { allowed: false, code: 'NOT_REGISTERED' }
  if (input.alreadyCheckedIn) return { allowed: false, code: 'ALREADY_CHECKED_IN' }
  if (input.status !== 'Check in') return { allowed: false, code: 'TOURNAMENT_NOT_IN_CHECK_IN' }
  if (!input.opensAt || !input.closesAt) return { allowed: false, code: 'CHECK_IN_WINDOW_UNCONFIGURED' }
  const now = input.now.getTime()
  const opens = new Date(input.opensAt).getTime()
  const closes = new Date(input.closesAt).getTime()
  if (now < opens) return { allowed: false, code: 'CHECK_IN_NOT_STARTED' }
  if (now >= closes) return { allowed: false, code: 'CHECK_IN_CLOSED' }
  return { allowed: true }
}
