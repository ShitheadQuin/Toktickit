import { ALLOWED_ATTACHMENT_MIME_TYPES, MAX_ATTACHMENT_BYTES, isAllowedAttachmentType } from './attachment-storage';

export type AttachmentValidationError =
  | { code: 'UNSUPPORTED_MEDIA_TYPE'; status: 415; message: string }
  | { code: 'PAYLOAD_TOO_LARGE'; status: 413; message: string }
  | { code: 'ATTACHMENT_LIMIT_REACHED'; status: 409; message: string };

export interface AttachmentUploadCandidate {
  mimeType: string;
  sizeBytes: number;
  activeAttachmentCount: number;
}

// BR-27: type, then size, then the per-Ticket count. A file failing more than one check returns
// only the first, in this fixed order - never more than one error per upload.
export function validateAttachmentUpload(
  candidate: AttachmentUploadCandidate,
): AttachmentValidationError | null {
  if (!isAllowedAttachmentType(candidate.mimeType)) {
    return {
      code: 'UNSUPPORTED_MEDIA_TYPE',
      status: 415,
      message: `File type must be one of ${ALLOWED_ATTACHMENT_MIME_TYPES.join(', ')}`,
    };
  }

  if (candidate.sizeBytes > MAX_ATTACHMENT_BYTES) {
    return { code: 'PAYLOAD_TOO_LARGE', status: 413, message: 'File exceeds the 5 MB limit' };
  }

  if (candidate.activeAttachmentCount >= 5) {
    return {
      code: 'ATTACHMENT_LIMIT_REACHED',
      status: 409,
      message: 'This Ticket already has 5 active attachments',
    };
  }

  return null;
}
