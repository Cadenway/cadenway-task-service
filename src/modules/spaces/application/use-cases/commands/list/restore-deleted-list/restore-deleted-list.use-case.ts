import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import { canEdit } from '../../../../../domain/policies/access/access-role.policy.js';
import type { AccessRole } from '../../../../../domain/value-objects/access/access-role.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { AccessResolver } from '../../../../services/access/access-resolver.service.js';
import type { RestoreDeletedListInput } from './restore-deleted-list.input.js';
import type { RestoreDeletedListOutput } from './restore-deleted-list.output.js';

/**
 * Class RestoreDeletedList
 *
 * @description
 * Public operation of the spaces module for the tasks module: brings back the deleted list of a
 * trash entry the member restores, and its deleted space ("An entry comes back to its list: … a
 * deleted list comes back with it, at the end of its space, and a deleted space at the end of the
 * sidebar, without their other lists and tasks" of "Restoring" of `openapi/public/trash.yaml`). It
 * reads the list without lock to find its space (a list never changes space), locks the space
 * `FOR NO KEY UPDATE`, then the list `FOR NO KEY UPDATE` (spaces before lists, after the entry and
 * the tasks its caller locked), and decides on the locked rows: the role of the member on the list
 * as if neither it nor its space were deleted (`listRoleAsIfNotDeletedOf`, the grants a tombstone
 * keeps included), from the role in the organization the caller passes; `not-found` without a
 * role, `role-insufficient` without `edit`, each writing nothing. Otherwise a deleted space comes
 * back first (`Space.restoreFromTrash`: the tombstone cleared, `restoredAt` = the instant of the
 * transaction, the next version, `space.restored.v1`), then a deleted list
 * (`TaskList.restoreFromTrash`: the same, back live at the end of its space, `list.restored.v1`),
 * both with the member as actor, before the events its caller appends next. A live list in a live
 * space, archived or not, answers `restored` with both flags `false` and writes nothing. It runs
 * in `SpacesUnitOfWork.run`, which joins the tenant transaction of the caller.
 */
export class RestoreDeletedList {
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

  /**
   * Property access
   *
   * @description
   * Computes the role of the member on the list as if not deleted.
   *
   * @type {AccessResolver}
   * @readonly
   */
  private readonly access: AccessResolver;
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
    this.access = new AccessResolver();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Brings the list and its space back when they are deleted and the member has `edit` on the
   * list as if not deleted.
   *
   * @param {RestoreDeletedListInput} input - The member, its role and the list.
   * @returns {Promise<RestoreDeletedListOutput>} What the restoration did.
   */
  public async execute(input: RestoreDeletedListInput): Promise<RestoreDeletedListOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<RestoreDeletedListOutput> => {
      const found: TaskList | null = await store.lists.findIncludingDeleted(
        input.organizationId,
        input.listId,
      );
      if (found === null) {
        return { outcome: 'not-found' };
      }
      const space: Space | null = await store.spaces.lockIncludingDeleted(
        input.organizationId,
        found.snapshot.spaceId,
        'update',
      );
      const list: TaskList | null = await store.lists.lockIncludingDeleted(
        input.organizationId,
        input.listId,
        'update',
      );
      if (space === null || list === null) {
        return { outcome: 'not-found' };
      }
      const viewer: Viewer = { userId: input.actorUserId, role: input.viewerRole };
      const role: AccessRole | null = await this.access.listRoleAsIfNotDeleted(
        store.grants,
        viewer,
        space.snapshot,
        list.snapshot,
      );
      if (role === null) {
        return { outcome: 'not-found' };
      }
      if (!canEdit(role)) {
        return { outcome: 'role-insufficient', role };
      }
      if (!space.isDeleted && !list.isDeleted) {
        return { outcome: 'restored', listRestored: false, spaceRestored: false };
      }
      const actor: EventActor = { type: 'user', id: input.actorUserId };
      const at: Date = await store.clock.now();
      if (space.isDeleted) {
        const back: Space = space.restoreFromTrash(at);
        await store.spaces.update(back);
        await store.events.spaceRestored(back, actor);
      }
      if (list.isDeleted) {
        const back: TaskList = list.restoreFromTrash(at);
        await store.lists.update(back);
        await store.events.listRestored(back, actor);
      }
      return {
        outcome: 'restored',
        listRestored: list.isDeleted,
        spaceRestored: space.isDeleted,
      };
    });
  }
  // #endregion
}
