export type BracketParticipant = { id: string; label: string }
export type BracketMatchStatus = 'ready' | 'bye' | 'completed'

export type BracketMatch = {
  id: string
  round: number
  matchNumber: number
  participantA: BracketParticipant | null
  participantB: BracketParticipant | null
  winnerId: string | null
  status: BracketMatchStatus
  nextMatchId: string | null
}

export type BracketRound = { round: number; matches: BracketMatch[] }
export type SingleEliminationBracket = { size: number; rounds: BracketRound[] }

const nextPowerOfTwo = (value: number) => {
  let size = 1
  while (size < value) size *= 2
  return size
}

function matchId(round: number, matchNumber: number) { return `r${round}-m${matchNumber}` }

/** Creates an immutable, deterministic bracket. Input order is the seed order. */
export function generateSingleEliminationBracket(input: BracketParticipant[]): SingleEliminationBracket {
  const participants = input.filter((participant, index, all) => participant.id.trim() && all.findIndex(item => item.id === participant.id) === index)
  if (!participants.length) return { size: 0, rounds: [] }
  const size = nextPowerOfTwo(participants.length)
  const roundCount = Math.log2(size)
  const rounds: BracketRound[] = []
  for (let round = 1; round <= roundCount; round += 1) {
    const matchCount = size / 2 ** round
    rounds.push({ round, matches: Array.from({ length: matchCount }, (_, index) => ({
      id: matchId(round, index + 1), round, matchNumber: index + 1,
      participantA: null, participantB: null, winnerId: null,
      status: 'ready' as BracketMatchStatus,
      nextMatchId: round < roundCount ? matchId(round + 1, Math.ceil((index + 1) / 2)) : null,
    })) })
  }
  participants.forEach((participant, index) => {
    const match = rounds[0].matches[Math.floor(index / 2)]
    if (index % 2 === 0) match.participantA = participant
    else match.participantB = participant
  })
  for (const round of rounds) {
    for (const match of round.matches) {
      const hasA = Boolean(match.participantA)
      const hasB = Boolean(match.participantB)
      if (hasA !== hasB) {
        match.status = 'bye'
        match.winnerId = (match.participantA ?? match.participantB)?.id ?? null
      } else if (!hasA && !hasB) {
        match.status = 'bye'
      }
      if (match.winnerId && match.nextMatchId) {
        const next = rounds[round.round].matches[Math.floor((match.matchNumber - 1) / 2)]
        if ((match.matchNumber - 1) % 2 === 0) next.participantA = participantById(rounds, match.winnerId)
        else next.participantB = participantById(rounds, match.winnerId)
      }
    }
  }
  return rounds.reduce((bracket) => bracket, { size, rounds })
}

function participantById(rounds: BracketRound[], id: string) {
  for (const round of rounds) for (const match of round.matches) {
    if (match.participantA?.id === id) return match.participantA
    if (match.participantB?.id === id) return match.participantB
  }
  return null
}

export function completeBracketMatch(bracket: SingleEliminationBracket, matchIdValue: string, winnerId: string): SingleEliminationBracket {
  const rounds = bracket.rounds.map(round => ({ ...round, matches: round.matches.map(match => ({ ...match })) }))
  const match = rounds.flatMap(round => round.matches).find(item => item.id === matchIdValue)
  if (!match || match.status === 'bye' || ![match.participantA?.id, match.participantB?.id].includes(winnerId)) throw new Error('Winner must be one of the scheduled participants.')
  if (match.winnerId) throw new Error('This match already has a winner.')
  match.winnerId = winnerId; match.status = 'completed'
  if (match.nextMatchId) {
    const next = rounds.flatMap(round => round.matches).find(item => item.id === match.nextMatchId)
    if (!next) throw new Error('Advancement target is missing.')
    const participant = match.participantA?.id === winnerId ? match.participantA : match.participantB
    if (match.matchNumber % 2 === 1) next.participantA = participant
    else next.participantB = participant
  }
  return { ...bracket, rounds }
}
