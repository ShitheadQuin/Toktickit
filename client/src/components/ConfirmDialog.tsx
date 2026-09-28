import { useEffect, useId, useRef, type KeyboardEvent } from 'react';

interface Props {
  title: string;
  body?: string;
  confirmLabel: string;
  /** Lab 3 button classes: destructive for Cancel, primary for a neutral confirmation. */
  confirmClass?: 'btn-tt-destructive' | 'btn-tt-primary';
  onConfirm: () => void;
  onCancel: () => void;
}

// ui-spec.md 13 (Lab 4): the Lab 3 confirm dialog, now a real modal for keyboard users. Focus starts
// on Go back, Tab and Shift+Tab stay inside, Escape is the same as Go back, and focus returns to
// whatever opened the dialog when it closes.
export function ConfirmDialog({ title, body, confirmLabel, confirmClass = 'btn-tt-destructive', onConfirm, onCancel }: Props) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const goBack = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    goBack.current?.focus();
    return () => opener?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab' || !dialog.current) return;
    const buttons = Array.from(dialog.current.querySelectorAll<HTMLButtonElement>('button'));
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="tt-confirm-backdrop">
      <div ref={dialog} className="tt-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <h2 id={titleId} className={body ? 'h5 mb-2' : 'h5 mb-3'}>
          {title}
        </h2>
        {body && <p className="mb-3">{body}</p>}
        <div className="d-flex justify-content-end gap-2">
          <button ref={goBack} type="button" className="btn btn-tt-tertiary" onClick={onCancel}>
            Go back
          </button>
          <button type="button" className={`btn ${confirmClass}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
