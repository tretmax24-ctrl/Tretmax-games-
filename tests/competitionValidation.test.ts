import assert from 'node:assert/strict'
import test from 'node:test'
import { checkInDecision, validateRosterSize, validateTeamName } from '../src/lib/competitionValidation.ts'

test('team names and roster limits are validated before any backend call', () => {
  assert.equal(validateTeamName('ab'), 'Team name must be at least 3 characters.')
  assert.equal(validateTeamName('Kampala Core'), null)
  assert.equal(validateRosterSize(1, 2, 4, false), 'Add at least 2 active members.')
  assert.equal(validateRosterSize(5, 2, 4, false), 'A roster cannot exceed 4 members.')
  assert.equal(validateRosterSize(2, 2, 4, true), 'The roster is already locked.')
})

test('check-in permits only an owned entry inside the server-defined window', () => {
  const base = { status: 'Check in', ownsEntry: true, alreadyCheckedIn: false, opensAt: '2026-11-01T10:00:00Z', closesAt: '2026-11-01T10:30:00Z' }
  assert.deepEqual(checkInDecision({ ...base, now: new Date('2026-11-01T09:59:59Z') }), { allowed: false, code: 'CHECK_IN_NOT_STARTED' })
  assert.deepEqual(checkInDecision({ ...base, now: new Date('2026-11-01T10:15:00Z') }), { allowed: true })
  assert.deepEqual(checkInDecision({ ...base, now: new Date('2026-11-01T10:30:00Z') }), { allowed: false, code: 'CHECK_IN_CLOSED' })
  assert.deepEqual(checkInDecision({ ...base, ownsEntry: false, now: new Date('2026-11-01T10:15:00Z') }), { allowed: false, code: 'NOT_REGISTERED' })
})
