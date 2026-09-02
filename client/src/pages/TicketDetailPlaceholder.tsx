import { Link } from 'react-router-dom';

// Stands in for the real Requester Ticket Detail screen (Issue #15, ui-spec.md 14) so the
// My Tickets "Open" link (Issue #14) has a real destination instead of a dead route. PR #25
// review comment 1. Deliberately does not fetch or render any Ticket data — that is #15's work.
export function TicketDetailPlaceholder() {
  return (
    <section>
      <h1 className="h4">Ticket Detail</h1>
      <p>This screen is coming in Issue #15.</p>
      <Link to="/my-tickets" className="btn btn-tt-secondary">
        Back to My Tickets
      </Link>
    </section>
  );
}
