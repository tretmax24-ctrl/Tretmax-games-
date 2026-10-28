import type { PlayerFormat } from './tournamentFormats'

export type TournamentDraftInput = {
  title: string
  description: string
  gameId: string
  mode: string
  playerFormat: PlayerFormat
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
