export type TournamentDraftInput = {
  title: string
  description: string
  gameId: string
  mode: string
  playerFormat: string
  bracketFormat: string
  entryType: 'free' | 'paid'
  entryFeeMinor: number
  prizePoolMinor: number
  capacity: number
  registrationOpensAt: string
  registrationClosesAt: string
  checkInOpensAt: string
  checkInClosesAt: string
  start: string
  rules: string[]
  prizeDescription: string
  bannerUrl: string
}
