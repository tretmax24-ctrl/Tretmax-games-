import { useState, type SyntheticEvent } from 'react'
import type { Game } from '../data/tournaments'
import codmArtwork from '../assets/artwork/codm.svg'
import fcArtwork from '../assets/artwork/fc.svg'
import pubgArtwork from '../assets/artwork/pubg.svg'
import freeFireArtwork from '../assets/artwork/freefire.svg'
import eFootballArtwork from '../assets/artwork/efootball.svg'
import poolArtwork from '../assets/artwork/8ballpool.svg'
import chessArtwork from '../assets/artwork/chess.svg'
import arenaArtwork from '../assets/artwork/arena-stage.svg'

const artwork: Record<string, string> = { codm: codmArtwork, fc: fcArtwork, pubg: pubgArtwork, freefire: freeFireArtwork, efootball: eFootballArtwork, '8ballpool': poolArtwork, chess: chessArtwork, 'arena-stage': arenaArtwork }

export function GameArtwork({ game, compact = false, bannerUrl }: { game: Game; compact?: boolean; bannerUrl?: string | null }) {
  const [bannerFailed, setBannerFailed] = useState(false)
  const failBanner = (event: SyntheticEvent<HTMLImageElement>) => {
    event.currentTarget.hidden = true
    setBannerFailed(true)
  }
  const fallback = artwork[game.art] ?? arenaArtwork
  return <div className={`game-art game-art--${game.art}${compact ? ' game-art--compact' : ''}`} role="img" aria-label={`${game.name} tournament artwork`}>
    <img className="game-art-image" src={fallback} alt="" aria-hidden="true" />
    {bannerUrl && !bannerFailed && <img key={bannerUrl} className="game-art-image game-art-image--banner" src={bannerUrl} alt="" aria-hidden="true" onError={failBanner} />}
    <span className="art-wordmark">{game.shortName}</span><span className="art-index">TMX / {game.id.toUpperCase()}</span>
  </div>
}
