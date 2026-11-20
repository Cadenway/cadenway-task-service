import type { PriorSprint } from '../../../../projections/reporting/prior-sprint.projection.js';

/** Reads sprint candidates in the current caller's tenant snapshot. */
export interface PriorSprintReader {
  // #region Methods
  /**
   * Return at most four sprints from this organization and space, ordered by descending end date
   * and ID. Apply the ordinary current list visibility rules before limiting, include archived
   * lists, and exclude deleted lists and spaces. A candidate's end date is strictly earlier than
   * beforeStartDate and no later than completedThroughDate.
   */
  listVisibleCompleted(
    organizationId: string,
    spaceId: string,
    viewer: { readonly userId: string; readonly role: 'owner' | 'admin' | 'member' | 'guest' },
    beforeStartDate: string,
    completedThroughDate: string,
  ): Promise<readonly PriorSprint[]>;
  // #endregion
}
