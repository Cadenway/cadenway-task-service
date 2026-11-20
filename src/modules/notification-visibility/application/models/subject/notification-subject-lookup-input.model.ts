import type { NotificationSubject } from './notification-subject.model.js';

/** Subject lookup for the active account in the verified tenant. */
export interface NotificationSubjectLookupInput {
  // #region Properties
  /** Tenant of the read transaction. */
  readonly organizationId: string;

  /** Account whose active membership and roles are checked. */
  readonly userId: string;

  /** Bounded references in response order. */
  readonly subjects: readonly NotificationSubject[];
  // #endregion
}
