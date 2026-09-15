import { useState } from 'react';

export interface ConversationEntry {
  id: number;
  ticketId: number;
  authorId: number;
  author: { id: number; name: string; role: string };
  body: string;
  createdAt: string;
}

const ROLE_LABEL: Record<string, string> = {
  REQUESTER: 'Requester',
  IT_STAFF: 'IT Staff',
  ADMINISTRATOR: 'Administrator',
};

// BR-16
const MAX_LENGTH = 2000;

const NOTE_CAPTION = 'Internal — not visible to Requester';

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface ConversationPanelProps {
  kind: 'comment' | 'note';
  ticketId: number;
  /** null while the list is still loading. */
  entries: ConversationEntry[] | null;
  loadFailed: boolean;
  onPosted: (entry: ConversationEntry) => void;
}

// ui-spec.md 7: the list-plus-composer layout shared by Public Comments and Internal Notes, used on
// both the Staff and Requester Ticket Detail screens. The two kinds are visually distinct by design,
// not by label alone - a white card for comments, an amber card with a lock and a caption for notes,
// and the same caption above the note composer, so the visibility is clear at the point of typing.
// BR-16: every body is rendered as a React text node, never as HTML.
export function ConversationPanel({ kind, ticketId, entries, loadFailed, onPosted }: ConversationPanelProps) {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isNote = kind === 'note';
  const noun = isNote ? 'notes' : 'comments';
  const composerId = `${kind}-composer-${ticketId}`;
  const canPost = text.trim() !== '' && text.length <= MAX_LENGTH && !posting;

  const post = async () => {
    if (!canPost) return;
    setPosting(true);
    setError(null);
    try {
      const response = await fetch(`/api/tickets/${ticketId}/${noun}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) {
        setError(payload?.error?.message ?? `Unable to post right now.`);
        return;
      }
      onPosted(payload as ConversationEntry);
      setText('');
    } catch {
      // The typed text is kept, so nothing is lost when the server can't be reached.
      setError('Unable to reach the server. Your text is still here - please try again.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className={`tt-conversation tt-conversation-${kind}`}>
      {loadFailed && <p className="text-muted">Unable to load {noun} right now.</p>}
      {!loadFailed && entries === null && <p className="text-muted">Loading {noun}…</p>}
      {!loadFailed && entries !== null && entries.length === 0 && (
        <p className="text-muted">{isNote ? 'No internal notes yet.' : 'No public comments yet.'}</p>
      )}

      {!loadFailed && entries !== null && entries.length > 0 && (
        <ul className="list-unstyled mb-3">
          {entries.map((entry) => (
            <li key={entry.id} className={`${isNote ? 'tt-note-internal' : 'tt-comment-public'} mb-2`}>
              <div className="tt-conversation-meta">
                {isNote && <span aria-hidden="true">🔒 </span>}
                <strong>{entry.author.name}</strong> · {ROLE_LABEL[entry.author.role] ?? entry.author.role} ·{' '}
                <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
              </div>
              {isNote && <div className="tt-note-caption">{NOTE_CAPTION}</div>}
              <p className="tt-conversation-body">{entry.body}</p>
            </li>
          ))}
        </ul>
      )}

      <div className={`tt-composer${isNote ? ' tt-composer-internal' : ''}`}>
        <label htmlFor={composerId} className="form-label">
          {isNote ? 'Add an internal note' : 'Add a public comment'}
        </label>
        {isNote && <p className="tt-note-caption mb-1">{NOTE_CAPTION}</p>}
        <textarea
          id={composerId}
          className="form-control tt-field tt-conversation-composer"
          rows={3}
          maxLength={MAX_LENGTH}
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={posting}
        />
        {error && (
          <div className="tt-inline-error mt-1" role="alert">
            {error}
          </div>
        )}
        <div className="d-flex justify-content-between align-items-center mt-2 gap-2">
          <span className="tt-composer-counter">{`${text.length} / ${MAX_LENGTH}`}</span>
          <button type="button" className="btn btn-tt-primary btn-sm" disabled={!canPost} onClick={post}>
            {posting ? 'Posting…' : isNote ? 'Post note' : 'Post comment'}
          </button>
        </div>
      </div>
    </div>
  );
}
