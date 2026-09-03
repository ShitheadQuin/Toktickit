import { describe, it, expect } from 'vitest';
import { validateAttachmentUpload } from '../../src/attachment-validation';

const valid = { mimeType: 'image/png', sizeBytes: 1024, activeAttachmentCount: 0 };
const FIVE_MB = 5 * 1024 * 1024;

describe('validateAttachmentUpload', () => {
  it('passes a valid file with no error', () => {
    expect(validateAttachmentUpload(valid)).toBeNull();
  });

  it('accepts every BR-15 allowed type', () => {
    for (const mimeType of ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']) {
      expect(validateAttachmentUpload({ ...valid, mimeType })).toBeNull();
    }
  });

  it('rejects a disallowed type with UNSUPPORTED_MEDIA_TYPE', () => {
    const error = validateAttachmentUpload({ ...valid, mimeType: 'application/zip' });
    expect(error).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE', status: 415 });
  });

  it('accepts a file exactly at the 5 MB boundary', () => {
    expect(validateAttachmentUpload({ ...valid, sizeBytes: FIVE_MB })).toBeNull();
  });

  it('rejects a file one byte over the 5 MB boundary with PAYLOAD_TOO_LARGE', () => {
    const error = validateAttachmentUpload({ ...valid, sizeBytes: FIVE_MB + 1 });
    expect(error).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', status: 413 });
  });

  it('accepts the 5th active attachment but rejects the 6th with ATTACHMENT_LIMIT_REACHED', () => {
    expect(validateAttachmentUpload({ ...valid, activeAttachmentCount: 4 })).toBeNull();
    const error = validateAttachmentUpload({ ...valid, activeAttachmentCount: 5 });
    expect(error).toMatchObject({ code: 'ATTACHMENT_LIMIT_REACHED', status: 409 });
  });

  // UNIT-02 - BR-27: type, then size, then count - a file failing several checks returns only
  // the first, in this fixed order.
  it('returns only the type error when a file is both a disallowed type and oversized', () => {
    const error = validateAttachmentUpload({
      mimeType: 'application/zip',
      sizeBytes: FIVE_MB + 1,
      activeAttachmentCount: 0,
    });
    expect(error).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
  });

  it('returns only the size error when a file is both oversized and over the attachment limit', () => {
    const error = validateAttachmentUpload({
      mimeType: 'image/png',
      sizeBytes: FIVE_MB + 1,
      activeAttachmentCount: 5,
    });
    expect(error).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('returns only the type error when all three checks fail at once', () => {
    const error = validateAttachmentUpload({
      mimeType: 'application/zip',
      sizeBytes: FIVE_MB + 1,
      activeAttachmentCount: 5,
    });
    expect(error).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
  });
});
