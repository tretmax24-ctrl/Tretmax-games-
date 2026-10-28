export type AttendanceCounts = { requiredCount: number; checkedInCount: number; pendingCount: number; noShowCount: number; entryCheckedIn: boolean }

export function isTeamInviteCode(value: string) { return /^tm_[0-9a-f]{64}$/.test(value) }
export function attendanceLabel(summary: AttendanceCounts) { return `${summary.checkedInCount}/${summary.requiredCount} CHECKED IN · ${summary.pendingCount} pending · ${summary.noShowCount} no-show · ${summary.entryCheckedIn ? 'Entry ready' : 'Entry waiting'}` }
