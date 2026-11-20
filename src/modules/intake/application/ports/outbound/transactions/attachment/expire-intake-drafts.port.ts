import type { IntakeAttachmentDraft } from '../../../../../domain/aggregates/attachment/intake-attachment-draft.aggregate.js';
import type { ExpiredIntakeDraft } from '../../../../models/attachment/expired-intake-draft.model.js';
import type { IntakeAttachmentStore } from '../../persistence/attachment/intake-attachment-store.port.js';

type ExpiredDraftStore = Pick<
  IntakeAttachmentStore,
  'listReservations' | 'recordDecision' | 'saveDraft'
>;

/** Selects bounded candidates and processes each one in its own atomic tenant transaction. */
export interface ExpireIntakeDrafts {
  // #region Methods
  /** Reads only expired, unclosed draft identifiers. */
  findExpired(limit: number): Promise<readonly ExpiredIntakeDraft[]>;

  /** Runs the decision while one still-expired draft is locked in its tenant transaction. */
  withExpiredDraft(
    candidate: ExpiredIntakeDraft,
    decide: (draft: IntakeAttachmentDraft, store: ExpiredDraftStore) => Promise<void>,
  ): Promise<boolean>;

  /** Removes one bounded page of terminal reservation details past their retention deadline. */
  purgeTerminalReservations(limit: number): Promise<void>;
  // #endregion
}
