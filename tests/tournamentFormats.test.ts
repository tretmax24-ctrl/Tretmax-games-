import assert from 'node:assert/strict'
import test from 'node:test'
import { isPlayerFormat, playerFormatsForGame } from '../src/admin/tournamentFormats.ts'

test('every supported game slug exposes only its backend-supported formats', () => {
  for (const slug of ['call-of-duty-mobile', 'free-fire', 'pubg-mobile']) {
    assert.deepEqual(playerFormatsForGame(slug), ['Solo', 'Duo', 'Trio', 'Squad'])
  }
  for (const slug of ['ea-sports-fc-mobile', 'efootball', '8ballpool', 'chess']) {
    assert.deepEqual(playerFormatsForGame(slug), ['Solo'])
  }
})

test('game and mode switches fall back to Solo and reject ambiguous values', () => {
  assert.deepEqual(playerFormatsForGame('call-of-duty-mobile', 'Solo queue'), ['Solo'])
  assert.deepEqual(playerFormatsForGame('free-fire', 'Battle Royale'), ['Solo', 'Duo', 'Trio', 'Squad'])
  assert.equal(isPlayerFormat('Team / squad'), false)
  assert.equal(isPlayerFormat('Squad'), true)
})

test('stored player formats are exact backend values', () => {
  for (const value of ['Solo', 'Duo', 'Trio', 'Squad']) assert.equal(isPlayerFormat(value), true)
})
