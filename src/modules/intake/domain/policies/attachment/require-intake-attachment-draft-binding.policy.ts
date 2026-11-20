import { IntakeAttachmentError } from '../../errors/attachment/intake-attachment.error.js';
import type { IntakeAttachmentDraftBinding } from '../../value-objects/attachment/intake-attachment-draft-binding.value-object.js';

/** Requires the exact tenant, publication and digest before any applicant operation. */
export function requireIntakeAttachmentDraftBinding(
  expected: IntakeAttachmentDraftBinding,
  received: IntakeAttachmentDraftBinding,
): void {
  if (
    expected.organizationId !== received.organizationId ||
    expected.publicationId !== received.publicationId ||
    expected.draftDigest !== received.draftDigest
  ) {
    throw new IntakeAttachmentError('unavailable');
  }
}
