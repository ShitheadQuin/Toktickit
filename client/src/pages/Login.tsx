import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const result = await login(email, password);
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    // AC-02: a user with an initial password must change it before reaching the app.
    navigate(result.user.mustChangePassword ? '/change-password' : '/');
  };

  return (
    <div className="d-flex flex-column align-items-center text-center p-4">
      <h1>TokTickIT</h1>

      <form onSubmit={handleSubmit} className="d-flex flex-column" style={{ maxWidth: '20rem', width: '100%' }}>
        {error && (
          <div className="alert alert-danger tt-alert-error" role="alert">
            {error}
          </div>
        )}

        <label htmlFor="login-email" className="form-label text-start mt-2">
          Email
        </label>
        <input
          id="login-email"
          type="email"
          className="form-control tt-field"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={busy}
          required
        />

        <label htmlFor="login-password" className="form-label text-start mt-2">
          Password
        </label>
        <div className="input-group">
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            className="form-control tt-field"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
            required
          />
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => setShowPassword((prev) => !prev)}
            disabled={busy}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>

        <button type="submit" className="btn btn-tt-primary mt-3" disabled={busy}>
          {busy ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
              Signing in…
            </>
          ) : (
            'Sign In'
          )}
        </button>
      </form>
    </div>
  );
}
