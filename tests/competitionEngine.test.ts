import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSingleEliminationBracket, completeBracketMatch } from '../src/lib/bracketEngine.ts'
import { calculateBattleRoyaleStandings } from '../src/lib/battleRoyaleScoring.ts'

for (const count of [2, 3, 4, 7, 8, 16, 32]) test(`single elimination supports ${count} participants`, () => {
  const bracket = generateSingleEliminationBracket(Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, label: `P${i + 1}` })))
  assert.equal(bracket.size, 2 ** Math.ceil(Math.log2(count)))
  assert.equal(new Set(bracket.rounds.flatMap(round => round.matches).map(match => match.id)).size, bracket.size - 1)
  assert.equal(new Set(bracket.rounds[0].matches.flatMap(match => [match.participantA?.id, match.participantB?.id]).filter(Boolean)).size, count)
  assert.ok(bracket.rounds[0].matches.every(match => match.nextMatchId || bracket.rounds.length === 1))
})

test('advancement completes without duplicate winners', () => {
  const bracket = generateSingleEliminationBracket([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }])
  const completed = completeBracketMatch(bracket, 'r1-m1', 'a')
  assert.equal(completed.rounds[0].matches[0].winnerId, 'a')
  assert.throws(() => completeBracketMatch(completed, 'r1-m1', 'b'))
})

test('battle royale scoring applies configurable points and tie breakers', () => {
  const standings = calculateBattleRoyaleStandings([
    { participantId: 'b', round: 1, placement: 1, eliminations: 0, verified: true },
    { participantId: 'a', round: 1, placement: 2, eliminations: 2, verified: true },
  ], { placementPoints: { 1: 10, 2: 8 }, eliminationPoints: 1, rounds: 1, tieBreakers: ['eliminations', 'bestPlacement'] })
  assert.equal(standings[0].participantId, 'a')
  assert.throws(() => calculateBattleRoyaleStandings([{ participantId: 'a', round: 1, placement: 1, eliminations: 0, verified: false }], { placementPoints: { 1: 1 }, eliminationPoints: 1, rounds: 1, tieBreakers: [] }))
})
