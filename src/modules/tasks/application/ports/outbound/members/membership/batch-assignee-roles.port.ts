import type { AssigneeCandidate } from '../../../../../domain/value-objects/member/assignee-candidate.value-object.js';

/** Resolves and holds the organization's current membership roles for a forest copy. */
export interface BatchAssigneeRoles {
  // #region Methods
  /** Resolves the current role of each requested account under membership locks. */
  hold(organizationId: string, userIds: readonly string[]): Promise<readonly AssigneeCandidate[]>;
  // #endregion
}
