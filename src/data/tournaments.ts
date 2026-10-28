export type Game = { id: string; name: string; shortName: string; category: string; accent: string; art: string }
export type TournamentStatus = 'Draft' | 'Registration open' | 'Registration closed' | 'Check in' | 'Coming soon' | 'In progress' | 'Completed' | 'Cancelled'
export type Tournament = {
  id: string; gameId: string; title: string; format: string; start: string; dateLabel: string
  entryFee: number; prizePool: number; players: number | null; capacity: number; status: TournamentStatus
  description: string; rules: string[]; schedule: { time: string; label: string }[]
  gameName?: string; bannerUrl?: string | null; prizeDescription?: string | null; registrationClosesAt?: string | null; isDatabaseRecord?: boolean
}

// These three titles are retained from the original frontend's mock tournament entries.
export const games: Game[] = [
  { id: 'codm', name: 'Call of Duty: Mobile', shortName: 'CODM', category: 'Battle royale', accent: 'lime', art: 'codm' },
  { id: 'freefire', name: 'Free Fire', shortName: 'FREE FIRE', category: 'Battle royale', accent: 'orange', art: 'freefire' },
  { id: 'fc25', name: 'EA Sports FC 25', shortName: 'FC 25', category: 'Sports', accent: 'violet', art: 'fc' },
  { id: 'efootball', name: 'eFootball', shortName: 'eFOOTBALL', category: 'Sports', accent: 'cyan', art: 'efootball' },
  { id: '8ballpool', name: '8 Ball Pool', shortName: '8 BALL', category: 'Pool', accent: 'blue', art: '8ballpool' },
  { id: 'chess', name: 'Chess', shortName: 'CHESS', category: 'Strategy', accent: 'gold', art: 'chess' },
  { id: 'pubgm', name: 'PUBG Mobile', shortName: 'PUBG', category: 'Battle royale', accent: 'orange', art: 'pubg' },
]

const artworkGameBySlug: Record<string, string> = {
  'call-of-duty-mobile': 'codm', 'ea-sports-fc-mobile': 'fc25', efootball: 'efootball',
  'free-fire': 'freefire', 'pubg-mobile': 'pubgm', '8ballpool': '8ballpool', chess: 'chess',
}

export function gameForSlug(slug: string, name?: string): Game {
  const source = games.find(game => game.id === (artworkGameBySlug[slug] ?? slug))
  if (!source) return { id: slug, name: name ?? slug, shortName: (name ?? slug).slice(0, 12).toUpperCase(), category: 'Competitive', accent: 'lime', art: 'arena-stage' }
  return { ...source, id: slug, name: name ?? source.name }
}

export const tournaments: Tournament[] = [
  { id: 'nightfall-showdown', gameId: 'codm', title: 'Nightfall Showdown', format: 'Solo · Single elimination', start: '2026-10-31T19:00:00+03:00', dateLabel: '31 OCT · 7:00 PM EAT', entryFee: 0, prizePool: 250000, players: 32, capacity: 64, status: 'Registration open', description: 'When the lights go low, the best players step up. A fast, focused solo bracket for Call of Duty: Mobile competitors.', rules: ['Use your registered in-game name for every match.', 'Join the room within 10 minutes of the scheduled match.', 'Submit match results with a screenshot after each round.', 'No cheats, exploits, or alternate accounts.'], schedule: [{ time: '6:30 PM', label: 'Check-in opens' }, { time: '7:00 PM', label: 'Round of 64 begins' }, { time: '9:00 PM', label: 'Final match' }] },
  { id: 'east-africa-cup', gameId: 'fc25', title: 'East Africa Cup', format: '1v1 · Single elimination', start: '2026-11-02T17:00:00+03:00', dateLabel: '02 NOV · 5:00 PM EAT', entryFee: 5000, prizePool: 500000, players: 18, capacity: 32, status: 'Registration open', description: 'A regional bracket for players ready to make every possession count. Bring your best squad and your best game.', rules: ['Matches are played in online friendlies.', 'Both players must confirm the final score.', 'A 10-minute grace period applies to scheduled matches.', 'No disconnect abuse or unsporting conduct.'], schedule: [{ time: '4:30 PM', label: 'Check-in opens' }, { time: '5:00 PM', label: 'Bracket begins' }, { time: '8:00 PM', label: 'Final match' }] },
  { id: 'drop-zone-duos', gameId: 'pubgm', title: 'Drop Zone Duos', format: 'Duo · Battle royale', start: '2026-11-05T20:00:00+03:00', dateLabel: '05 NOV · 8:00 PM EAT', entryFee: 0, prizePool: 150000, players: 48, capacity: 100, status: 'Coming soon', description: 'Find your drop partner and make the last circle count. A duo survival event for PUBG Mobile players.', rules: ['Register with one teammate; both players must check in.', 'Use the lobby details shared by the tournament organiser.', 'Final placements are verified using match results.', 'No teaming with other registered duos.'], schedule: [{ time: '7:30 PM', label: 'Check-in opens' }, { time: '8:00 PM', label: 'Lobby opens' }, { time: '8:15 PM', label: 'Match begins' }] },
  { id: 'kampala-night-scrims', gameId: 'codm', title: 'Kampala Night Scrims', format: 'Squad · Practice lobby', start: '2026-10-27T20:00:00+03:00', dateLabel: 'SAMPLE STATUS · 8:00 PM EAT', entryFee: 0, prizePool: 0, players: 20, capacity: 40, status: 'In progress', description: 'An illustrative community practice session currently shown in progress. This is not a real live match.', rules: ['Practice lobby only; no prizes are attached.', 'Use the event host instructions to join.', 'Keep match chat respectful.', 'This demo status is not connected to a live match feed.'], schedule: [{ time: '7:30 PM', label: 'Check-in opens' }, { time: '8:00 PM', label: 'Practice lobby' }, { time: '9:00 PM', label: 'Session ends' }] },
]

export const ugx = (amount: number, zeroLabel = 'Free') => amount === 0 ? zeroLabel : `UGX ${new Intl.NumberFormat('en-UG').format(amount)}`
