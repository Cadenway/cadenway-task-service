import { IntakeAttachmentError } from '../../errors/attachment/intake-attachment.error.js';
import type { IntakeFormFields } from '../../value-objects/form/intake-form-fields.value-object.js';

/** Checks the current field policy, treating legacy settings as optional. */
export function requireIntakeAttachmentUploadsEnabled(mode: IntakeFormFields['attachments']): void {
  if (mode === 'disabled') throw new IntakeAttachmentError('disabled');
}
