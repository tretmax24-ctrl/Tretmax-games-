import { Link } from 'react-router-dom'
import { DemoNotice } from '../components/DemoNotice'
import { PageHeading } from '../components/PageHeading'

const steps = [
  ['01', 'Set up your player profile', 'Create a player profile and add the game accounts you compete with. In a production version, profile setup will use Supabase Auth and verified account records.', 'PROFILE'],
  ['02', 'Choose your tournament', 'Browse events by game, format, entry fee, prize pool, and registration status. Check the rules and schedule before you register.', 'DISCOVER'],
  ['03', 'Register and check in', 'Submit your player and game ID, then check in before the event starts. Organisers share match instructions with registered players.', 'CHECK IN'],
  ['04', 'Play your matches', 'Join each match on time, follow the event rules, and report results. Match outcomes need confirmation and verification.', 'COMPETE'],
  ['05', 'Climb the leaderboard', 'Verified results can contribute to rankings and event standings. Sample leaderboards on this site are illustrative only.', 'RISE'],
]
export function HowItWorksPage() {
  return <div className="section-wrap content-page"><PageHeading kicker="FROM LOBBY TO LEGEND" title="HOW TO" highlight="PLAY." copy="A clear path from finding your next event to stepping into the arena."/><DemoNotice>Everything described here is a product preview. Authentication, event registration, check-in, match verification, and prizes require backend implementation.</DemoNotice><div className="journey-list">{steps.map(([number, title, copy, label]) => <article key={number} className="journey-step"><span className="journey-number">{number}</span><div><span className="journey-label">{label}</span><h2>{title}</h2><p>{copy}</p></div><span className="journey-mark">↗</span></article>)}</div><div className="backend-boundary"><div className="section-kicker"><span /> CLEAR EXPECTATIONS</div><h2>WHAT'S LIVE<br /><em>AND WHAT ISN'T.</em></h2><div className="boundary-grid"><div><span className="boundary-mark boundary-mark--yes">✓</span><h3>WORKING IN THIS DEMO</h3><p>Browse and search sample tournaments, view event details, explore games, and try clearly labeled local-only demo forms.</p></div><div><span className="boundary-mark">×</span><h3>NEEDS BACKEND SETUP</h3><p>Secure accounts, persistent registration, verified results, live brackets, payments, wallets, prizes, and leaderboard updates.</p></div></div><Link className="button button--lime" to="/tournaments">Explore tournaments <span>↗</span></Link></div></div>
}
