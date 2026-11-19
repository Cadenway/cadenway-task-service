import { listRoleAsIfNotDeletedOf } from '../../../../../domain/policies/access/access-role.policy.js';
import type { AccessRole } from '../../../../../domain/value-objects/access/access-role.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { toTrashList } from '../../../../mappers/list/trash-list.mapper.js';
import type { TrashListAccess } from '../../../../models/list/trash-list-access.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { FindTrashListInput } from './find-trash-list.input.js';
import type { FindTrashListOutput } from './find-trash-list.output.js';

/**
 * Class FindTrashList
 *
 * @description
 * Public operation of the spaces module for the tasks module: the list of one trash entry, live,
 * archived or deleted, in a live or deleted space, with the role the member has on it, or would
 * have if neither the list nor its space were deleted ("for a deleted list, the role they would
 * have on it" of "Who" of `openapi/public/trash.yaml`, `listRoleAsIfNotDeletedOf`), the grants a
 * tombstone keeps included. `null` when the list is unknown or erased, or gives the member no role
 * at all as if not deleted: the caller answers as for an unknown entry or task. One statement, no
 * lock. It runs in `SpacesUnitOfWork.run`, which joins the tenant transaction of the caller; it
 * appends no event.
 */
export class FindTrashList {
  // #region Properties
  /**
   * Property unitOfWork
   *
   * @description
   * The tenant transaction of the use case.
   *
   * @type {SpacesUnitOfWork}
   * @readonly
   */
  private readonly unitOfWork: SpacesUnitOfWork;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port.
   *
   * @param {SpacesUnitOfWork} unitOfWork - The tenant transaction.
   * @constructor
   */
  public constructor(unitOfWork: SpacesUnitOfWork) {
    this.unitOfWork = unitOfWork;
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads the list and the role of the member on it as if not deleted.
   *
   * @param {FindTrashListInput} input - The member, its role and the list.
   * @returns {Promise<FindTrashListOutput | null>} The list and the role, or `null`.
   */
  public async execute(input: FindTrashListInput): Promise<FindTrashListOutput | null> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<FindTrashListOutput | null> => {
      const viewer: Viewer = { userId: input.viewerUserId, role: input.viewerRole };
      const row: TrashListAccess | null = await store.lists.findTrashAccessVisibleTo(
        input.organizationId,
        viewer,
        input.listId,
      );
      if (row === null) {
        return null;
      }
      const role: AccessRole | null = listRoleAsIfNotDeletedOf(
        row.space,
        { organizationAccess: row.organizationAccess },
        viewer,
        row.grants,
      );
      return role === null ? null : { list: toTrashList(row), role };
    });
  }
  // #endregion
}
