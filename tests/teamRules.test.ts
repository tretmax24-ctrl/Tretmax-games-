import assert from 'node:assert/strict'
import test from 'node:test'
import { canRegisterLockedTeam, requiredTeamSize } from '../src/lib/teamRules.ts'

test('team formats map to exact roster sizes', () => {
  assert.equal(requiredTeamSize('Duo · Single elimination'), 2)
  assert.equal(requiredTeamSize('Trio · Battle royale'), 3)
  assert.equal(requiredTeamSize('Squad'), 4)
  assert.equal(requiredTeamSize('Solo'), null)
})

test('team registration only permits locked exact rosters', () => {
  assert.equal(canRegisterLockedTeam('Duo', 'forming', 2).allowed, false)
  assert.equal(canRegisterLockedTeam('Duo', 'locked', 3).allowed, false)
  assert.equal(canRegisterLockedTeam('Duo', 'locked', 2).allowed, true)
})
