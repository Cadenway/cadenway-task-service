/**
 * Interface TrashList
 *
 * @description
 * A list as the trash reads it, from the spaces module: live, archived or deleted, in a live or
 * deleted space (an erased one is gone), with its name and state as they are now ("Liste
 * supprimée", `ListRef` of `openapi/internal/task-service.yaml`). `deleted` when the list or its
 * space is deleted, else `archived` when the list is archived, else `active`.
 */
export interface TrashList {
  // #region Properties
  /** Id of the list. */
  readonly id: string;

  /** Id of its space. */
  readonly spaceId: string;

  /** Its name. */
  readonly name: string;

  /** Its state now. */
  readonly state: 'active' | 'archived' | 'deleted';
  // #endregion
}
