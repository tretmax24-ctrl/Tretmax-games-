import assert from 'node:assert/strict'
import test from 'node:test'
import { attendanceLabel, isTeamInviteCode } from '../src/lib/teamInvite.ts'

test('invitation codes accept only the deployed opaque format', () => {
  assert.equal(isTeamInviteCode(`tm_${'a'.repeat(64)}`), true)
  assert.equal(isTeamInviteCode(`tm_${'a'.repeat(63)}`), false)
  assert.equal(isTeamInviteCode('team-secret'), false)
})

test('attendance summary renders all server counts and entry state', () => {
  assert.equal(attendanceLabel({ requiredCount: 2, checkedInCount: 1, pendingCount: 1, noShowCount: 0, entryCheckedIn: false }), '1/2 CHECKED IN · 1 pending · 0 no-show · Entry waiting')
  assert.match(attendanceLabel({ requiredCount: 2, checkedInCount: 2, pendingCount: 0, noShowCount: 0, entryCheckedIn: true }), /Entry ready/)
})
