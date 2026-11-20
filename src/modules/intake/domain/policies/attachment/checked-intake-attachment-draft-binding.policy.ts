import { IntakeAttachmentError } from '../../errors/attachment/intake-attachment.error.js';
import type { IntakeAttachmentDraftBinding } from '../../value-objects/attachment/intake-attachment-draft-binding.value-object.js';

/** Keeps exactly the tenant, publication and lowercase digest on the P4 draft and its slots. */
export function checkedIntakeAttachmentDraftBinding(
  binding: IntakeAttachmentDraftBinding,
): IntakeAttachmentDraftBinding {
  const { organizationId, publicationId, draftDigest } = binding;
  if (
    !organizationId ||
    !publicationId ||
    !/^[\da-f]{64}$/.test(draftDigest) ||
    draftDigest.length !== 64
  ) {
    throw new IntakeAttachmentError('invalid-draft');
  }
  return { organizationId, publicationId, draftDigest };
}
