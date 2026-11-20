import type { AccessSpace } from '../../../domain/policies/access/access-role.policy.js';
import type { ListGrants } from '../../../domain/value-objects/access/list-grants.value-object.js';

/**
 * Interface TrashListAccess
 *
 * @description
 * A lean row of the trash reads of lists: a list of the organization, live, archived or deleted,
 * in a live or deleted space, with what its state and the role of a member "as if not deleted"
 * read ("Who" of `openapi/public/trash.yaml`), and nothing else of the list.
 */
export interface TrashListAccess {
  // #region Properties
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
   * Property spaceId
   *
   * @description
   * The id of the space of the list.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceId: string;

  /**
   * Property name
   *
   * @description
   * The name of the list, as it is now.
   *
   * @type {string}
   * @readonly
   */
  readonly name: string;

  /**
   * Property organizationAccess
   *
   * @description
   * The switch "Accès de l’organisation" of the list.
   *
   * @type {boolean}
   * @readonly
   */
  readonly organizationAccess: boolean;

  /**
   * Property archivedAt
   *
   * @description
   * When the list was archived, `null` for a list that is not.
   *
   * @type {Date | null}
   * @readonly
   */
  readonly archivedAt: Date | null;

  /**
   * Property deletedAt
   *
   * @description
   * When the list was deleted, on its own or with its space, `null` for a list that is not.
   *
   * @type {Date | null}
   * @readonly
   */
  readonly deletedAt: Date | null;

  /**
   * Property space
   *
   * @description
   * The visibility, the owner, the tombstone and whether the space of the list awaits an owner.
   *
   * @type {AccessSpace}
   * @readonly
   */
  readonly space: AccessSpace;

  /**
   * Property grants
   *
   * @description
   * The grants of the member on the space and on the list, those a tombstone keeps included.
   *
   * @type {ListGrants}
   * @readonly
   */
  readonly grants: ListGrants;
  // #endregion
}
