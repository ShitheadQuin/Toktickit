import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

// BR-24: files are stored under a server-generated name, never the Requester's own filename -
// this is what keeps a malicious filename from ever reaching the filesystem path.
export const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// BR-15: the only four types Lab 2 accepts. Keyed by MIME type since that is what BR-27's
// validation order checks; the extension is derived from it, never from the client's filename.
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

export const ALLOWED_ATTACHMENT_MIME_TYPES = Object.keys(EXTENSION_BY_MIME_TYPE);

// BR-15: 5 MB, same figure and same binary-MB math as the client's own limit in CreateTicket.tsx.
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export function isAllowedAttachmentType(mimeType: string): boolean {
  return mimeType in EXTENSION_BY_MIME_TYPE;
}

export function generateStoredFilename(mimeType: string): string {
  const extension = EXTENSION_BY_MIME_TYPE[mimeType] ?? '';
  return `${randomUUID()}${extension}`;
}

export async function saveAttachmentFile(storedFilename: string, buffer: Buffer): Promise<void> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, storedFilename), buffer);
}

// BR-26: called to clean up a file whose Attachment row failed to save, so no orphan is left
// behind. Swallows a missing file rather than throwing - the compensation already did its job.
export async function deleteAttachmentFile(storedFilename: string): Promise<void> {
  try {
    await unlink(path.join(UPLOAD_DIR, storedFilename));
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') throw error;
  }
}

export function attachmentFilePath(storedFilename: string): string {
  return path.join(UPLOAD_DIR, storedFilename);
}
