import { Link } from 'react-router-dom'
import { DemoNotice } from '../components/DemoNotice'
import { PageHeading } from '../components/PageHeading'

const steps = [
  ['01', 'Set up your player profile', 'Create your profile and manually add the game IDs you use. Tretmax does not use publisher APIs; staff review can be added later where needed.', 'PROFILE'],
  ['02', 'Choose your tournament', 'Browse published events by game, format, entry fee, prize information, rules and registration deadline before you join.', 'DISCOVER'],
  ['03', 'Register and check in', 'Free solo registration is sent to the reviewed server registration flow with your linked game ID. Team registration and check-in are still being prepared.', 'CHECK IN'],
  ['04', 'Play and report results', 'Follow the organiser schedule and submit match evidence when the match-result workflow is available. Verification and disputes are not live yet.', 'COMPETE'],
  ['05', 'Climb the leaderboard', 'Rankings will use verified tournament results. Current leaderboard and prize displays remain clearly labelled until those workflows are deployed.', 'RISE'],
]

const faqs = [
  ['How do I link a game ID?', 'Open Profile after signing in, choose a supported game, and enter the in-game name and ID exactly as they appear in that game. These are manual identifiers; Tretmax does not call official publisher APIs.'],
  ['Can I join a paid tournament?', 'Paid registration and payment verification are disabled. Free events are the only supported registration mode in this launch phase.'],
  ['When does check-in happen?', 'Each published event can show its check-in window. The player check-in action is not available until the reviewed check-in workflow is deployed, so do not treat a schedule label as a completed check-in.'],
  ['How are results and disputes handled?', 'Match reporting, evidence review, forfeits and disputes require their secure server workflows. They are planned and are not represented as completed by this interface.'],
]

export function HowItWorksPage() {
  return <div className="section-wrap content-page"><PageHeading kicker="FROM LOBBY TO LEGEND" title="HOW TO" highlight="PLAY." copy="A clear path from finding your next event to stepping into the arena."/><DemoNotice>Profile editing and published tournament discovery are connected to Supabase. Free registration uses the reviewed server contract when it is deployed. Team entry, check-in, match verification and payouts are not available yet.</DemoNotice><div className="journey-list">{steps.map(([number, title, copy, label]) => <article key={number} className="journey-step"><span className="journey-number">{number}</span><div><span className="journey-label">{label}</span><h2>{title}</h2><p>{copy}</p></div><span className="journey-mark">→</span></article>)}</div><div className="backend-boundary"><div className="section-kicker"><span /> CLEAR EXPECTATIONS</div><h2>WHAT'S LIVE<br /><em>AND WHAT ISN'T.</em></h2><div className="boundary-grid"><div><span className="boundary-mark boundary-mark--yes">✓</span><h3>AVAILABLE NOW</h3><p>Supabase-authenticated profiles, manual game IDs, published tournament details, public artwork fallbacks and honest free-entry states.</p></div><div><span className="boundary-mark">×</span><h3>STILL IN REVIEW</h3><p>Team rosters, check-in, brackets, match results, disputes, verified winners, notifications, payments and payouts.</p></div></div><Link className="button button--lime" to="/tournaments">Explore tournaments <span>→</span></Link></div><section className="faq-section"><div className="section-kicker"><span /> PLAYER FAQ</div><h2>GOOD TO <em>KNOW.</em></h2><div className="faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div></section></div>
}
