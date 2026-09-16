import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { ROLE_BADGE_CLASS, USER_STATUS_BADGE_CLASS } from '../components/badge-classes';

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

interface FormState {
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

type Panel = { mode: 'create' } | { mode: 'edit'; user: UserRow } | null;

type ApiResult =
  | { ok: true; body: unknown }
  | { ok: false; code?: string; message: string; fields?: { field: string; message: string }[] };

// ui-spec.md 9: every badge shows its word, never color alone.
const ROLE_LABEL: Record<string, string> = { REQUESTER: 'Requester', IT_STAFF: 'IT Staff', ADMINISTRATOR: 'Administrator' };

const EMPTY_FORM: FormState = { name: '', email: '', role: 'REQUESTER', isActive: true };

// An email address contains no spaces, so the only break opportunities are the ones given to it.
// Without this the Email column breaks mid-word at narrow widths; <wbr> after the "@" moves the
// break to the boundary a reader expects (ui-spec.md 12, Issue #40).
function breakableEmail(email: string) {
  const at = email.lastIndexOf('@');
  if (at < 0) return email;
  return (
    <>
      {email.slice(0, at + 1)}
      <wbr />
      {email.slice(at + 1)}
    </>
  );
}

// ui-spec.md 8: the anticipated refusals get their own sentence next to what caused them, never a
// generic failure banner.
const KNOWN_ERRORS: Record<string, string> = {
  EMAIL_ALREADY_EXISTS: 'This email is already in use.',
  SELF_DEACTIVATION_BLOCKED: "You can't deactivate your own account.",
  LAST_ACTIVE_ADMIN_BLOCKED: 'At least one Administrator must stay active.',
};

async function send(url: string, method: 'POST' | 'PATCH', body?: object): Promise<ApiResult> {
  try {
    const response = await fetch(url, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => null);
    if (response.ok && payload) return { ok: true, body: payload };
    return {
      ok: false,
      code: payload?.error?.code,
      message: payload?.error?.message ?? 'Unable to save right now.',
      fields: payload?.error?.fields,
    };
  } catch {
    return { ok: false, message: 'Unable to reach the server. Please try again.' };
  }
}

// ui-spec.md 8: the one Administrator screen - a searchable user list with an optional role filter,
// and a side panel to create or edit a user. The server enforces every rule; this screen shows the
// server's answer next to the control it concerns.
export function UserManagement() {
  const { user, refreshUser } = useAuth();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [panel, setPanel] = useState<Panel>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [panelError, setPanelError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  // FR-18/FR-20: shown once. Dismissing it discards the password - nothing can show it again.
  const [reveal, setReveal] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    setUsers(null);
    setLoadError(null);

    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (roleFilter) params.set('role', roleFilter);
    const query = params.toString();

    fetch(`/api/users${query ? `?${query}` : ''}`, { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (cancelled) return;
        if (response.status === 403) {
          setLoadError("You don't have access to User Management.");
          return;
        }
        if (!response.ok || !Array.isArray(body)) {
          setLoadError('Unable to load users right now.');
          return;
        }
        setUsers(body as UserRow[]);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Unable to load users right now.');
      });

    return () => {
      cancelled = true;
    };
  }, [user, search, roleFilter, reloadToken]);

  const clearPanelMessages = () => {
    setFieldErrors({});
    setPanelError(null);
  };

  const openCreate = () => {
    setPanel({ mode: 'create' });
    setForm(EMPTY_FORM);
    clearPanelMessages();
    setFeedback(null);
  };

  const openEdit = (row: UserRow) => {
    setPanel({ mode: 'edit', user: row });
    setForm({ name: row.name, email: row.email, role: row.role, isActive: row.isActive });
    clearPanelMessages();
    setFeedback(null);
  };

  const showError = (result: Extract<ApiResult, { ok: false }>) => {
    if (result.code === 'EMAIL_ALREADY_EXISTS') setFieldErrors({ email: KNOWN_ERRORS.EMAIL_ALREADY_EXISTS });
    else if (result.code && KNOWN_ERRORS[result.code]) setPanelError(KNOWN_ERRORS[result.code]);
    else if (result.fields?.length) setFieldErrors(Object.fromEntries(result.fields.map(({ field, message }) => [field, message])));
    else setPanelError(result.message);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!panel) return;
    setSaving(true);
    clearPanelMessages();

    if (panel.mode === 'create') {
      const result = await send('/api/users', 'POST', { name: form.name, email: form.email, role: form.role, isActive: form.isActive });
      setSaving(false);
      if (!result.ok) return showError(result);
      const created = result.body as UserRow & { initialPassword: string };
      setReveal({ email: created.email, password: created.initialPassword });
      setCopied(false);
      setFeedback('User created.');
      setPanel(null);
      setReloadToken((token) => token + 1);
      return;
    }

    const result = await send(`/api/users/${panel.user.id}`, 'PATCH', { name: form.name, email: form.email, role: form.role });
    setSaving(false);
    if (!result.ok) return showError(result);
    const updated = result.body as UserRow;
    setPanel({ mode: 'edit', user: updated });
    setFeedback('Changes saved.');
    setReloadToken((token) => token + 1);
    // Changing your own role takes you out of this screen; refreshing the session user lets the
    // route guard send you to your new role's home.
    if (user && updated.id === user.id && updated.role !== user.role) void refreshUser();
  };

  const toggleActive = async () => {
    if (!panel || panel.mode !== 'edit') return;
    const target = panel.user;
    clearPanelMessages();
    // FR-21: caught here before any request; the server refuses it as well.
    if (target.isActive && user && target.id === user.id) {
      setPanelError(KNOWN_ERRORS.SELF_DEACTIVATION_BLOCKED);
      return;
    }

    setSaving(true);
    const result = await send(`/api/users/${target.id}`, 'PATCH', { isActive: !target.isActive });
    setSaving(false);
    if (!result.ok) return showError(result);
    const updated = result.body as UserRow;
    setPanel({ mode: 'edit', user: updated });
    setFeedback(updated.isActive ? 'User activated.' : 'User deactivated.');
    setReloadToken((token) => token + 1);
  };

  const resetPassword = async () => {
    if (!panel || panel.mode !== 'edit') return;
    clearPanelMessages();
    setSaving(true);
    const result = await send(`/api/users/${panel.user.id}/reset-password`, 'POST');
    setSaving(false);
    if (!result.ok) return showError(result);
    setReveal({ email: panel.user.email, password: (result.body as { initialPassword: string }).initialPassword });
    setCopied(false);
    setFeedback('New initial password set.');
  };

  const copyPassword = async () => {
    if (!reveal) return;
    try {
      await navigator.clipboard.writeText(reveal.password);
      setCopied(true);
    } catch {
      // Clipboard access can be unavailable; the password is still on screen to copy by hand.
    }
  };

  return (
    <section className="tt-user-admin">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h1 className="h4 mb-0">User Management</h1>
        <button type="button" className="btn btn-tt-primary" onClick={openCreate}>
          Add user
        </button>
      </div>

      {feedback && (
        <div className="alert tt-alert-success" role="status">
          {feedback}
        </div>
      )}

      {reveal && (
        <div className="tt-initial-password-reveal mb-3" role="region" aria-label="One-time initial password">
          <p className="mb-2">
            Initial password for <strong>{reveal.email}</strong>:
          </p>
          <code className="d-inline-block mb-2">{reveal.password}</code>
          <p className="mb-2">Copy this now — it won&apos;t be shown again. The user must change it at their next login.</p>
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-tt-secondary btn-sm" onClick={() => void copyPassword()}>
              {copied ? 'Copied' : 'Copy password'}
            </button>
            <button
              type="button"
              className="btn btn-tt-primary btn-sm"
              onClick={() => {
                setReveal(null);
                setCopied(false);
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      <div className={`tt-user-management${panel ? ' tt-panel-open' : ''}`}>
        <div>
          <div className="tt-list-controls mb-3">
            <form
              className="row g-2 align-items-end"
              onSubmit={(event) => {
                event.preventDefault();
                setSearch(searchInput.trim());
              }}
            >
              <div className="col-12 col-md-6">
                <label htmlFor="user-search" className="form-label">
                  Search
                </label>
                <input
                  id="user-search"
                  type="search"
                  className="form-control tt-field"
                  placeholder="Name or email"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
              </div>
              <div className="col-auto">
                <button type="submit" className="btn btn-tt-secondary">
                  Search
                </button>
              </div>
              <div className="col-12 col-md">
                <label htmlFor="user-role-filter" className="form-label">
                  Filter by role
                </label>
                <select
                  id="user-role-filter"
                  className="form-select tt-field"
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value)}
                >
                  <option value="">All roles</option>
                  {Object.entries(ROLE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </form>
          </div>

          {loadError && (
            <div className="alert tt-alert-error" role="alert">
              <p className="mb-2">{loadError}</p>
              <button type="button" className="btn btn-tt-secondary btn-sm" onClick={() => setReloadToken((token) => token + 1)}>
                Try again
              </button>
            </div>
          )}

          {!loadError && users === null && (
            <div className="tt-skeleton-list" aria-busy="true">
              <span className="visually-hidden">Loading users…</span>
              {[0, 1, 2].map((placeholder) => (
                <div key={placeholder} className="tt-skeleton-row" />
              ))}
            </div>
          )}

          {!loadError && users !== null && users.length === 0 && <p className="tt-no-results py-3">No users match your search.</p>}

          {!loadError && users !== null && users.length > 0 && (
            <table className="table tt-user-table align-middle">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td className="tt-user-email">{breakableEmail(row.email)}</td>
                    <td>
                      <span className={`tt-badge ${ROLE_BADGE_CLASS[row.role] ?? ''}`}>{ROLE_LABEL[row.role] ?? row.role}</span>
                    </td>
                    <td>
                      <span className={`tt-badge ${USER_STATUS_BADGE_CLASS[row.isActive ? 'ACTIVE' : 'INACTIVE']}`}>
                        {row.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="btn btn-tt-secondary btn-sm" aria-label={`Edit ${row.name}`} onClick={() => openEdit(row)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {panel && (
          <aside className="tt-user-panel" aria-label={panel.mode === 'create' ? 'Add user' : 'Edit user'}>
            <form onSubmit={handleSubmit} noValidate>
              <h2 className="h5 mb-3">{panel.mode === 'create' ? 'Add user' : 'Edit user'}</h2>

              <label htmlFor="user-name" className="form-label">
                Name
              </label>
              <input
                id="user-name"
                className={`form-control tt-field${fieldErrors.name ? ' is-invalid' : ''}`}
                value={form.name}
                maxLength={100}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
              {fieldErrors.name && <div className="invalid-feedback d-block">{fieldErrors.name}</div>}

              <label htmlFor="user-email" className="form-label mt-3">
                Email
              </label>
              <input
                id="user-email"
                type="email"
                className={`form-control tt-field${fieldErrors.email ? ' is-invalid' : ''}`}
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
              {fieldErrors.email && <div className="invalid-feedback d-block">{fieldErrors.email}</div>}

              {/* BR-21: one role only, so a radio group rather than checkboxes (ui-spec.md 8). */}
              <fieldset className="mt-3">
                <legend className="form-label fs-6 mb-1">Role</legend>
                {Object.entries(ROLE_LABEL).map(([value, label]) => (
                  <div className="form-check" key={value}>
                    <input
                      className="form-check-input"
                      type="radio"
                      name="user-role"
                      id={`user-role-${value}`}
                      value={value}
                      checked={form.role === value}
                      onChange={() => setForm((current) => ({ ...current, role: value }))}
                    />
                    <label className="form-check-label" htmlFor={`user-role-${value}`}>
                      {label}
                    </label>
                  </div>
                ))}
                {fieldErrors.role && <div className="invalid-feedback d-block">{fieldErrors.role}</div>}
              </fieldset>

              {panel.mode === 'create' ? (
                <div className="form-check form-switch mt-3">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    role="switch"
                    id="user-active"
                    checked={form.isActive}
                    onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                  />
                  <label className="form-check-label" htmlFor="user-active">
                    Active
                  </label>
                </div>
              ) : (
                <p className="mt-3 mb-0">
                  Status:{' '}
                  <span className={`tt-badge ${USER_STATUS_BADGE_CLASS[panel.user.isActive ? 'ACTIVE' : 'INACTIVE']}`}>
                    {panel.user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </p>
              )}

              {panelError && (
                <div className="tt-inline-error mt-3" role="alert">
                  {panelError}
                </div>
              )}

              <div className="d-flex flex-wrap gap-2 mt-3">
                <button type="submit" className="btn btn-tt-primary" disabled={saving}>
                  {panel.mode === 'create' ? 'Create user' : 'Save changes'}
                </button>
                <button type="button" className="btn btn-tt-tertiary" onClick={() => setPanel(null)}>
                  Cancel
                </button>
              </div>

              {panel.mode === 'edit' && (
                <div className="d-flex flex-wrap gap-2 mt-3 pt-3 border-top">
                  <button type="button" className="btn btn-tt-secondary" disabled={saving} onClick={() => void resetPassword()}>
                    Set New Password
                  </button>
                  <button type="button" className="btn btn-tt-destructive" disabled={saving} onClick={() => void toggleActive()}>
                    {panel.user.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              )}
            </form>
          </aside>
        )}
      </div>
    </section>
  );
}
