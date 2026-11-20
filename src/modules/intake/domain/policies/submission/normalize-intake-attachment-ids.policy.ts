import { IntakeFormError } from '../../errors/form/intake-form.error.js';
import { MAX_INTAKE_ATTACHMENTS } from '../../value-objects/attachment/intake-attachment-limits.value-object.js';
import { isIntakeAttachmentId } from '../attachment/is-intake-attachment-id.policy.js';

/** Produces the case- and order-independent attachment selection defined by public Intake. */
export function normalizeIntakeAttachmentIds(ids: readonly string[] = []): string[] {
  const canonical = new Set<string>();
  if (ids.length <= MAX_INTAKE_ATTACHMENTS && ids.every(isIntakeAttachmentId)) {
    for (const id of ids) canonical.add(id.toLowerCase());
    if (canonical.size === ids.length) return [...canonical].sort();
  }
  throw new IntakeFormError({
    kind: 'invalid-submission',
    issues: [{ field: 'attachmentIds', reason: 'invalid' }],
  });
}
