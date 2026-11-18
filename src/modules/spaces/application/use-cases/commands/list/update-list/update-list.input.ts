import type { TaskListPatch } from '../../../../../domain/value-objects/list/task-list-patch.value-object.js';

/**
 * Interface UpdateListInput
 *
 * @description
 * A JSON Merge Patch of a list or a sprint.
 */
export interface UpdateListInput {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the verified internal token.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property actorUserId
   *
   * @description
   * The account of the actor of the internal token.
   *
   * @type {string}
   * @readonly
   */
  readonly actorUserId: string;

  /**
   * Property listId
   *
   * @description
   * The id of the list.
   *
   * @type {string}
   * @readonly
   */
  readonly listId: string;

  /**
   * Property expectedVersions
   *
   * @description
   * The versions `If-Match` names, `null` without the header or with `*`.
   *
   * @type {readonly number[] | null}
   * @readonly
   */
  readonly expectedVersions: readonly number[] | null;

  /**
   * Property patch
   *
   * @description
   * The members to change; an empty patch changes nothing.
   *
   * @type {TaskListPatch}
   * @readonly
   */
  readonly patch: TaskListPatch;
  // #endregion
}
