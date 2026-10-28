export type BattleRoyaleScoringRules = {
  placementPoints: Record<number, number>
  eliminationPoints: number
  rounds: number
  tieBreakers: Array<'eliminations' | 'bestPlacement' | 'earliestResult'>
}
export type BattleRoyaleResult = { participantId: string; round: number; placement: number; eliminations: number; verified: boolean; recordedAt?: string }
export type BattleRoyaleStanding = { participantId: string; points: number; eliminations: number; bestPlacement: number; roundsPlayed: number; earliestResult: string }

export function calculateBattleRoyaleStandings(results: BattleRoyaleResult[], rules: BattleRoyaleScoringRules): BattleRoyaleStanding[] {
  const seen = new Set<string>(); const aggregate = new Map<string, BattleRoyaleStanding>()
  for (const result of results) {
    if (!result.verified) throw new Error('Only verified battle-royale results can be scored.')
    if (result.round < 1 || result.round > rules.rounds || result.placement < 1 || result.eliminations < 0) throw new Error('Battle-royale result is outside the tournament rules.')
    const key = `${result.participantId}:${result.round}`
    if (seen.has(key)) throw new Error('A participant cannot have duplicate results for one round.')
    seen.add(key)
    const current = aggregate.get(result.participantId) ?? { participantId: result.participantId, points: 0, eliminations: 0, bestPlacement: Number.POSITIVE_INFINITY, roundsPlayed: 0, earliestResult: result.recordedAt ?? '' }
    current.points += rules.placementPoints[result.placement] ?? 0
    current.points += result.eliminations * rules.eliminationPoints
    current.eliminations += result.eliminations; current.bestPlacement = Math.min(current.bestPlacement, result.placement); current.roundsPlayed += 1
    if (result.recordedAt && (!current.earliestResult || result.recordedAt < current.earliestResult)) current.earliestResult = result.recordedAt
    aggregate.set(result.participantId, current)
  }
  return [...aggregate.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    for (const tieBreaker of rules.tieBreakers) {
      const diff = tieBreaker === 'eliminations' ? b.eliminations - a.eliminations : tieBreaker === 'bestPlacement' ? a.bestPlacement - b.bestPlacement : (a.earliestResult || '\uffff').localeCompare(b.earliestResult || '\uffff')
      if (diff) return diff
    }
    return a.participantId.localeCompare(b.participantId)
  })
}
