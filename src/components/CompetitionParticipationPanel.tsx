import type { TournamentStatus } from '../data/tournaments'

type Props = {
  isTeamEvent: boolean
  status: TournamentStatus
}

/**
 * Team and check-in controls stay visibly unavailable until their reviewed RPCs
 * are deployed. This component intentionally has no browser persistence.
 */
export function CompetitionParticipationPanel({ isTeamEvent, status }: Props) {
  const checkInWindow = status === 'Check in'
  return <section className="participation-panel" aria-label="Competition participation status">
    <div className="section-kicker"><span /> COMPETITION WORKFLOW</div>
    <div className="participation-grid">
      <div>
        <strong>{isTeamEvent ? 'TEAM ROSTERS' : 'PLAYER CHECK-IN'}</strong>
        <p>{isTeamEvent ? 'Manage your roster from your profile, then select a locked team on this event when its format and game match.' : 'Check-in is server-controlled and will open only inside the published event window.'}</p>
        <button className="button button--outline" type="button" disabled>{isTeamEvent ? 'TEAM REGISTRATION UNAVAILABLE' : checkInWindow ? 'CHECK-IN UNAVAILABLE' : 'CHECK-IN NOT OPEN'}</button>
      </div>
      <div className="participation-note"><span aria-hidden="true">i</span><p>No local or fake attendance state is stored. The reviewed check-in contract will enforce identity, deadlines and no-show handling.</p></div>
    </div>
    <div className="participation-note competition-coming-soon"><span aria-hidden="true">i</span><p><strong>BRACKET & MATCH SCHEDULE</strong><br />Published opponents, room details and verified results will appear here after the secure bracket-generation and match-result operations are deployed.</p></div>
  </section>
}
