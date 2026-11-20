import type { TaskParticipant } from '../../../../projections/task/task-participant.projection.js';

/** Resolves current members with access to an authorized task's list. */
export interface TaskParticipantDirectory {
  // #region Methods
  /** Pages eligible member IDs in user ID order from the tenant snapshot. */
  list(
    organizationId: string,
    listId: string,
    after: string | null,
    limit: number,
  ): Promise<readonly TaskParticipant[]>;
  // #endregion
}
