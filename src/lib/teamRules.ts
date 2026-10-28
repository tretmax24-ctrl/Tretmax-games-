export function requiredTeamSize(format: string): number | null {
  if (/squad/i.test(format)) return 4
  if (/trio/i.test(format)) return 3
  if (/duo/i.test(format)) return 2
  return null
}

export function canRegisterLockedTeam(format: string, rosterState: string, memberCount: number): { allowed: boolean; reason?: string } {
  const required = requiredTeamSize(format)
  if (!required) return { allowed: false, reason: 'This tournament format does not accept team registration.' }
  if (rosterState !== 'locked') return { allowed: false, reason: 'Lock the team roster before registering.' }
  if (memberCount !== required) return { allowed: false, reason: `${format} requires exactly ${required} members.` }
  return { allowed: true }
}
