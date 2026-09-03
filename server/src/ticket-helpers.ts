export type FieldError = { field: string; message: string };

export function formatTicketNumber(year: number, sequence: number | bigint): string {
  return `TKT-${year}-${String(sequence).padStart(6, '0')}`;
}

export function validateTicketText(
  summary: unknown,
  description: unknown,
): { summary: string; description: string; errors: FieldError[] } {
  const errors: FieldError[] = [];

  const trimmedSummary = typeof summary === 'string' ? summary.trim() : '';
  if (trimmedSummary.length < 5 || trimmedSummary.length > 120) {
    errors.push({ field: 'summary', message: 'summary must be 5-120 characters' });
  }

  const trimmedDescription = typeof description === 'string' ? description.trim() : '';
  if (trimmedDescription.length < 10 || trimmedDescription.length > 2000) {
    errors.push({ field: 'description', message: 'description must be 10-2000 characters' });
  }

  return { summary: trimmedSummary, description: trimmedDescription, errors };
}
