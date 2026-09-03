import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRequester, type Requester } from '../context/RequesterContext';

type LoadState = 'loading' | 'loaded' | 'empty' | 'error';

export function RequesterSelector() {
  const { selectRequester } = useRequester();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>('loading');
  const [requesters, setRequesters] = useState<Requester[]>([]);
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadRequesters() {
      setState('loading');
      try {
        const response = await fetch('/api/requesters', { signal: AbortSignal.timeout(5000) });
        if (!response.ok) {
          throw new Error('Backend returned an error');
        }
        const data: Requester[] = await response.json();
        if (cancelled) return;
        setRequesters(data);
        setState(data.length === 0 ? 'empty' : 'loaded');
      } catch {
        if (!cancelled) {
          setState('error');
        }
      }
    }

    loadRequesters();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleContinue = () => {
    const chosen = requesters.find((requester) => String(requester.id) === selectedId);
    if (!chosen) return;
    selectRequester(chosen);
    navigate('/');
  };

  return (
    <div className="requester-selector d-flex flex-column align-items-center text-center p-4">
      <h1>TokTickIT</h1>
      <p className="text-muted" style={{ maxWidth: '32rem' }}>
        Select a Development Requester to test requester-specific ticket behavior. This is not a
        login screen. Authentication and role-based access will be introduced in Lab 3.
      </p>

      {state === 'loading' && <p role="status">Loading Development Requesters…</p>}

      {state === 'empty' && (
        <div className="alert alert-warning" role="alert">
          No active Development Requesters are available for testing yet.
        </div>
      )}

      {state === 'error' && (
        <div className="alert alert-danger tt-alert-error" role="alert">
          Unable to load Development Requesters. Please try again.
        </div>
      )}

      <label htmlFor="requester-select" className="form-label mt-2">
        Development Requester
      </label>
      <select
        id="requester-select"
        className="form-select tt-field mb-3"
        style={{ maxWidth: '20rem' }}
        value={selectedId}
        disabled={state !== 'loaded'}
        onChange={(event) => setSelectedId(event.target.value)}
      >
        <option value="" disabled>
          {state === 'loaded' ? 'Choose a Requester…' : '—'}
        </option>
        {requesters.map((requester) => (
          <option key={requester.id} value={requester.id}>
            {requester.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-tt-primary"
        disabled={state !== 'loaded' || !selectedId}
        onClick={handleContinue}
      >
        Continue
      </button>
    </div>
  );
}
