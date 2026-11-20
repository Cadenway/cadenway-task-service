import type { ExpiredIntakeDraft } from '../../../../models/attachment/expired-intake-draft.model.js';

/** Selects bounded candidates and processes each one in its own atomic tenant transaction. */
export interface ExpireIntakeDrafts {
  // #region Methods
  /** Reads only expired, unclosed draft identifiers. */
  findExpired(limit: number): Promise<readonly ExpiredIntakeDraft[]>;

  /** Locks and releases one still-expired draft, or skips a concurrent owner. */
  expire(candidate: ExpiredIntakeDraft): Promise<boolean>;
  // #endregion
}
