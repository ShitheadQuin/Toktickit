import { Link } from 'react-router-dom';

// Lab 4 labsheet 8.5: an address that matches no screen shows not-found feedback in the shell,
// in the same style as "This Ticket does not exist.", instead of a blank page.
export function NotFound() {
  return (
    <section>
      <h1 className="h4 mb-3">Page not found</h1>
      <div className="alert tt-alert-error" role="alert">
        <p className="mb-2">There is no page at this address.</p>
        <Link to="/dashboard" className="btn btn-tt-secondary">
          Back to Dashboard
        </Link>
      </div>
    </section>
  );
}
