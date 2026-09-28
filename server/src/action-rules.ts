// Actions Taken rules that need no database: status moves (BR-09) and field validation (BR-06 to
// BR-08). The route adds what does need one: the Ticket, the assignee and the stored version.

export const ACTION_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type ActionStatusValue = (typeof ACTION_STATUSES)[number];

// BR-09. Completed and Cancelled are final, so they have no entry.
const NEXT_STATUSES: Record<ActionStatusValue, ActionStatusValue[]> = {
  PLANNED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function isActionStatus(value: unknown): value is ActionStatusValue {
  return ACTION_STATUSES.includes(value as ActionStatusValue);
}

export function checkActionStatusChange(from: ActionStatusValue, to: ActionStatusValue): boolean {
  return NEXT_STATUSES[from].includes(to);
}

export function isLocked(status: ActionStatusValue): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED';
}

// A withdrawn Action is cancelled after it exists; creating one already cancelled records nothing.
export function canCreateWithStatus(status: ActionStatusValue): boolean {
  return status !== 'CANCELLED';
}

export const MAX_TEXT = 2000;
export const MAX_ATTACHMENT_NOTES = 500;
// BR-06: allowance for a client clock slightly ahead of the server's.
export const FUTURE_ALLOWANCE_MS = 5 * 60 * 1000;

export type FieldError = { field: string; message: string };

export type ActionValues = {
  actionAt: Date;
  description: string;
  result: string | null;
  status: ActionStatusValue;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
};

// Optional text: missing, null or blank all mean "empty", stored as null.
function optionalText(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim();
  return text === '' ? null : text;
}

// Validates a whole Action, as created or as it would be after an update (stored values merged
// with the changes). Reports every failing field at once, in form order, so the client can show
// each message under its own field.
export function validateActionInput(
  input: Record<string, unknown>,
  context: { now: Date; ticketCreatedAt: Date },
): { value: ActionValues; fields: FieldError[] } {
  const fields: FieldError[] = [];

  const actionAt = input.actionAt instanceof Date ? input.actionAt : new Date(typeof input.actionAt === 'string' ? input.actionAt : NaN);
  if (Number.isNaN(actionAt.getTime())) {
    fields.push({ field: 'actionAt', message: 'Action Date/Time must be a valid date and time.' });
  } else if (actionAt.getTime() < Math.floor(context.ticketCreatedAt.getTime() / 60_000) * 60_000) {
    // The form's date/time field holds whole minutes, so the Ticket's creation time is compared at the
    // same precision; otherwise an Action added in the Ticket's first minute would be refused.
    fields.push({ field: 'actionAt', message: 'Action Date/Time cannot be before the Ticket was created.' });
  } else if (actionAt.getTime() > context.now.getTime() + FUTURE_ALLOWANCE_MS) {
    fields.push({ field: 'actionAt', message: 'Action Date/Time cannot be in the future.' });
  }

  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (!description) {
    fields.push({ field: 'description', message: 'Action Description is required.' });
  } else if (description.length > MAX_TEXT) {
    fields.push({ field: 'description', message: 'Action Description must be 2,000 characters or fewer.' });
  }

  const status = input.status;
  if (!isActionStatus(status)) {
    fields.push({ field: 'status', message: 'Status must be Planned, In Progress, Completed or Cancelled.' });
  }

  const result = optionalText(input.result);
  if (result === undefined) {
    fields.push({ field: 'result', message: 'Result must be text.' });
  } else if (result && result.length > MAX_TEXT) {
    fields.push({ field: 'result', message: 'Result must be 2,000 characters or fewer.' });
  } else if (!result && status === 'COMPLETED') {
    fields.push({ field: 'result', message: 'Result is required when the Action is Completed.' });
  }

  const followUpRequired = input.followUpRequired;
  if (typeof followUpRequired !== 'boolean') {
    fields.push({ field: 'followUpRequired', message: 'Follow Up Required must be true or false.' });
  }

  // BR-08: a note sent without the flag is discarded rather than rejected.
  let followUpNote: string | null = null;
  if (followUpRequired === true) {
    const note = optionalText(input.followUpNote);
    if (!note) {
      fields.push({ field: 'followUpNote', message: 'Follow Up Note is required when follow up is needed.' });
    } else if (note.length > MAX_TEXT) {
      fields.push({ field: 'followUpNote', message: 'Follow Up Note must be 2,000 characters or fewer.' });
    } else {
      followUpNote = note;
    }
  }

  const attachmentNotes = optionalText(input.attachmentNotes);
  if (attachmentNotes === undefined) {
    fields.push({ field: 'attachmentNotes', message: 'Attachment Notes must be text.' });
  } else if (attachmentNotes && attachmentNotes.length > MAX_ATTACHMENT_NOTES) {
    fields.push({ field: 'attachmentNotes', message: 'Attachment Notes must be 500 characters or fewer.' });
  }

  return {
    value: {
      actionAt,
      description,
      result: result ?? null,
      status: (isActionStatus(status) ? status : 'PLANNED') as ActionStatusValue,
      followUpRequired: followUpRequired === true,
      followUpNote,
      attachmentNotes: attachmentNotes ?? null,
    },
    fields,
  };
}
