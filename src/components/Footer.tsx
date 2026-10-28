import { Link } from 'react-router-dom'
import { Brand } from './Brand'

export function Footer() {
  return <footer className="site-footer"><div className="footer-main"><div><Brand compact /><p>Tournament discovery for players in Uganda.<br />Rankings and competition tools are still in development.</p></div><div className="footer-links"><div><span className="footer-label">EXPLORE</span><Link to="/tournaments">Tournaments</Link><Link to="/games">Games</Link><Link to="/leaderboard">Leaderboard</Link></div><div><span className="footer-label">GET STARTED</span><Link to="/how-it-works">How it works</Link><Link to="/register">Create account</Link><Link to="/login">Log in</Link><Link to="/profile">Player profile</Link></div></div></div><div className="footer-bottom"><span>© 2026 TRETMAX GAMES</span><span>SUPABASE-BACKED EVENT DISCOVERY</span><span>DESIGNED FOR PLAYERS IN UGANDA</span></div></footer>
}
