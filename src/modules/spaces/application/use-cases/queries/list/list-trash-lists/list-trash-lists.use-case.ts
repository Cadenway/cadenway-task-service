import { listRoleAsIfNotDeletedOf } from '../../../../../domain/policies/access/access-role.policy.js';
import type { AccessRole } from '../../../../../domain/value-objects/access/access-role.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { toTrashList } from '../../../../mappers/list/trash-list.mapper.js';
import type { TrashListAccess } from '../../../../models/list/trash-list-access.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { TrashList } from '../../../../projections/list/trash-list.projection.js';
import type { ListTrashListsInput } from './list-trash-lists.input.js';
import type { ListTrashListsOutput } from './list-trash-lists.output.js';

/**
 * Class ListTrashLists
 *
 * @description
 * Public operation of the spaces module for the tasks module: the lists whose trash entries a
 * member may see, with the role they would have on each ("The trash shows the entries of the
 * lists the caller could change, with `edit` (for a deleted list, the role they would have on
 * it)" of "Who" of `openapi/public/trash.yaml`). Every list of the organization, live, archived or
 * deleted, in a live or deleted space (an erased one is gone), on which the member has a role as
 * `listRoleAsIfNotDeletedOf` computes it, the grants a tombstone keeps included; each with its
 * name, its state (`deleted` when the list or its space is deleted, else `archived` or `active`)
 * and that role. The caller applies its own threshold of a change (the same as for
 * `FindTrashList`), so "may restore" is decided in one place. One statement of lean rows, in the
 * style of `ListVisibleListIds` (O(lists of the organization)), in no particular order. The role
 * of the member in the organization comes from the caller. It runs in `SpacesUnitOfWork.run`,
 * which joins the tenant transaction of the caller (a read-only snapshot of the trash page
 * included); it takes no lock and appends no event.
 */
export class ListTrashLists {
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
   * Reads the lists of the trash of the member, with their roles.
   *
   * @param {ListTrashListsInput} input - The member and its role.
   * @returns {Promise<ListTrashListsOutput>} The lists the member has, or would have, a role on.
   */
  public async execute(input: ListTrashListsInput): Promise<ListTrashListsOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<ListTrashListsOutput> => {
      const viewer: Viewer = { userId: input.viewerUserId, role: input.viewerRole };
      const rows: TrashListAccess[] = await store.lists.listTrashAccessesVisibleTo(
        input.organizationId,
        viewer,
      );
      const lists: { readonly list: TrashList; readonly role: AccessRole }[] = [];
      for (const row of rows) {
        // The query kept the lists the condition gives a role on; one the policy refuses all the
        // same is left out (fail closed).
        const role: AccessRole | null = listRoleAsIfNotDeletedOf(
          row.space,
          { organizationAccess: row.organizationAccess },
          viewer,
          row.grants,
        );
        if (role !== null) {
          lists.push({ list: toTrashList(row), role });
        }
      }
      return { lists };
    });
  }
  // #endregion
}
