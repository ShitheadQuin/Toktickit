import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// ui-spec.md 4: BR-10's three rules, mirrored live as the user types. No forced special
// character, matching specification.md's password rule.
function checkRules(password: string) {
  return {
    length: password.length >= 8 && password.length <= 72,
    letter: /[a-zA-Z]/.test(password),
    digit: /[0-9]/.test(password),
  };
}

function RuleItem({ met, label }: { met: boolean; label: string }) {
  return (
    <li className={met ? 'text-success' : 'text-muted'}>
      {met ? '✓' : '○'} {label}
    </li>
  );
}

export function ChangePassword() {
  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rules = checkRules(newPassword);
  const rulesSatisfied = rules.length && rules.letter && rules.digit;
  const confirmMatches = confirmPassword.length > 0 && confirmPassword === newPassword;
  const canContinue = rulesSatisfied && confirmMatches && !busy;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canContinue) return;

    setError(null);
    setBusy(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? 'Unable to change password. Please try again.');
        return;
      }
      await refreshUser();
      navigate('/');
    } catch {
      setError('Unable to change password. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="d-flex flex-column align-items-center text-center p-4">
      <h1>Change Password</h1>
      <p className="text-muted" style={{ maxWidth: '28rem' }}>
        You're signing in with a temporary password. Choose a new one to continue.
      </p>

      <form onSubmit={handleSubmit} className="d-flex flex-column" style={{ maxWidth: '20rem', width: '100%' }}>
        {error && (
          <div className="alert alert-danger tt-alert-error" role="alert">
            {error}
          </div>
        )}

        <label htmlFor="current-password" className="form-label text-start mt-2">
          Current Password
        </label>
        <input
          id="current-password"
          type="password"
          className="form-control tt-field"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          disabled={busy}
          required
        />

        <label htmlFor="new-password" className="form-label text-start mt-2">
          New Password
        </label>
        <input
          id="new-password"
          type="password"
          className="form-control tt-field"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          disabled={busy}
          required
        />

        <ul className="list-unstyled text-start mt-1 mb-0" style={{ fontSize: '0.875rem' }}>
          <RuleItem met={rules.length} label="At least 8 characters" />
          <RuleItem met={rules.letter} label="Contains a letter" />
          <RuleItem met={rules.digit} label="Contains a number" />
        </ul>

        <label htmlFor="confirm-password" className="form-label text-start mt-2">
          Confirm New Password
        </label>
        <input
          id="confirm-password"
          type="password"
          className="form-control tt-field"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          disabled={busy}
          required
        />

        <button type="submit" className="btn btn-tt-primary mt-3" disabled={!canContinue}>
          {busy ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
              Saving…
            </>
          ) : (
            'Continue'
          )}
        </button>
      </form>
    </div>
  );
}
