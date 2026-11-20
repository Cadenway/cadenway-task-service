import type { IntakeAttachmentStore } from '../../ports/outbound/persistence/attachment/intake-attachment-store.port.js';
import type { IntakeStore } from '../../models/form/intake-store.model.js';

/** Requires the transaction-bound attachment capability for the published upload contract. */
export function intakeAttachments(store: IntakeStore): IntakeAttachmentStore {
  if (store.attachments === undefined)
    throw new Error('Intake attachment persistence is unavailable.');
  return store.attachments;
}
