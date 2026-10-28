export type PlayerFormat = 'Solo' | 'Duo' | 'Trio' | 'Squad'

const SOLO: PlayerFormat[] = ['Solo']
const TEAM_GAMES: PlayerFormat[] = ['Solo', 'Duo', 'Trio', 'Squad']

export function canonicalGameSlug(value: string): string {
  const slug = value.trim().toLowerCase().replace(/[_\s]+/g, '-').replace(/-+/g, '-')
  const aliases: Record<string, string> = { codm: 'call-of-duty-mobile', pubgm: 'pubg-mobile', fc25: 'ea-sports-fc-mobile', freefire: 'free-fire', '8ballpool': '8ballpool' }
  return aliases[slug] ?? slug
}

export function playerFormatsForGame(gameSlug: string, mode = ''): PlayerFormat[] {
  const normalized = canonicalGameSlug(gameSlug).replace(/-/g, '')
  const teamCapable = normalized === 'callofdutymobile' || normalized === 'freefire' || normalized === 'pubgmobile'
  if (!teamCapable || /solo|1v1|single\s*player/i.test(mode)) return SOLO
  return TEAM_GAMES
}

export function isPlayerFormat(value: string): value is PlayerFormat {
  return value === 'Solo' || value === 'Duo' || value === 'Trio' || value === 'Squad'
}
