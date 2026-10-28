import { Link } from 'react-router-dom'

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link className={`brand${compact ? ' brand--compact' : ''}`} to="/" aria-label="Tretmax Games home"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M5 7h22v5H18v14h-5V12H5V7Zm4 8h4l3 4 3-4h4l-5 7v4h-4v-4l-5-7Z" /></svg></span><span className="brand-name">TRETMAX<span>GAMES</span></span></Link>
}
