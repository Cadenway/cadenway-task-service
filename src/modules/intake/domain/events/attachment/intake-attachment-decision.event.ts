import type { IntakeAttachmentOwnership } from '../../value-objects/attachment/intake-attachment-ownership.value-object.js';

/** An immutable Task decision available for publication in the same transaction as the slot. */
export type IntakeAttachmentDecision = IntakeAttachmentOwnership &
  ({ readonly kind: 'claimed'; readonly taskKey: string } | { readonly kind: 'released' });
