/**
 * Interface ListRefView
 *
 * @description
 * The list of an archived task, with its name and state as they are now (`ListRef` of
 * `openapi/internal/task-service.yaml`): `archived` when the list is archived too ("Liste
 * archivée"), `active` otherwise.
 */
export interface ListRefView {
  // #region Properties
  /** Id of the list. */
  readonly id: string;

  /** Id of its space. */
  readonly spaceId: string;

  /** Its name. */
  readonly name: string;

  /** Its state now. */
  readonly state: 'active' | 'archived';
  // #endregion
}
