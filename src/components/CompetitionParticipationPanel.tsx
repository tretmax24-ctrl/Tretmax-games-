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
        <p>{isTeamEvent ? 'Team creation, invitations, roster locking and team registration will appear after their reviewed server operations are deployed.' : 'Check-in is server-controlled and will open only inside the published event window.'}</p>
        <button className="button button--outline" type="button" disabled>{isTeamEvent ? 'TEAM REGISTRATION UNAVAILABLE' : checkInWindow ? 'CHECK-IN UNAVAILABLE' : 'CHECK-IN NOT OPEN'}</button>
      </div>
      <div className="participation-note"><span aria-hidden="true">i</span><p>No local or fake attendance state is stored. The reviewed check-in contract will enforce identity, deadlines and no-show handling.</p></div>
    </div>
  </section>
}
