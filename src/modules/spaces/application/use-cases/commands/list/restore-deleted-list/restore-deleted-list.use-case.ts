import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import { canEdit } from '../../../../../domain/policies/access/access-role.policy.js';
import type { AccessRole } from '../../../../../domain/value-objects/access/access-role.value-object.js';
import type { GrantEntry } from '../../../../../domain/value-objects/access/grant-entry.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { StoredGrant } from '../../../../models/access/stored-grant.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { AccessResolver } from '../../../../services/access/access-resolver.service.js';
import type { RestoreDeletedListInput } from './restore-deleted-list.input.js';
import type { RestoreDeletedListOutput } from './restore-deleted-list.output.js';

/**
 * Function entriesOf
 *
 * @description
 * The grants of a space or a list as the access events carry them, in the order they were first
 * given.
 *
 * @param {readonly StoredGrant[]} grants - The stored grants.
 * @returns {GrantEntry[]} Each person and role.
 */
function entriesOf(grants: readonly StoredGrant[]): GrantEntry[] {
  return grants.map((grant: StoredGrant): GrantEntry => ({
    userId: grant.userId,
    role: grant.role,
  }));
}

/**
 * Class RestoreDeletedList
 *
 * @description
 * Public operation of the spaces module for the tasks module: brings back the deleted list of a
 * trash entry the member restores, and its deleted space ("An entry comes back to its list: … a
 * deleted list comes back with it, at the end of its space, and a deleted space at the end of the
 * sidebar, without their other lists and tasks" of "Restoring" of `openapi/public/trash.yaml`).
 *
 * It reads the list and its space without lock first and decides on them: the role of the member
 * on the list as if neither were deleted (`listRoleAsIfNotDeletedOf`, the grants a tombstone keeps
 * included), from the role in the organization the caller passes; `not-found` without a role,
 * `role-insufficient` without `edit`, each writing nothing, so a list the member would not see
 * answers at once, whatever another transaction holds. Then it locks the space
 * `FOR NO KEY UPDATE` and the list `FOR NO KEY UPDATE` (spaces before lists, after the entry and
 * the tasks its caller locked), and decides again on the locked rows when either changed
 * meanwhile (another version).
 *
 * A deleted space comes back first (`Space.restoreFromTrash`: the tombstone cleared,
 * `restoredAt` = the instant of the transaction, the next version, `space.restored.v1`), then a
 * deleted list (`TaskList.restoreFromTrash`: the same, back live at the end of its space,
 * `list.restored.v1`). Each restored one then republishes who reaches it, at the version it took
 * (one change, one version): `space.access-republished.v1` with every grant of the space as it stands
 * (`changedUserIds` every person who holds one, possibly empty), and `list.access-changed.v1` with the
 * switch and every grant of the list (`changed: ['grants', 'organizationAccess']`,
 * `changedUserIds: []`), so a consumer that kept the grants of before the deletion replaces them by
 * the current set, which no longer holds a grant the clean-up of a member removed silently
 * meanwhile. All by the member, before the events its caller appends next. A live list in a live
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
      const viewer: Viewer = { userId: input.actorUserId, role: input.viewerRole };
      const seenList: TaskList | null = await store.lists.findIncludingDeleted(
        input.organizationId,
        input.listId,
      );
      const seenSpace: Space | null =
        seenList === null
          ? null
          : await store.spaces.findIncludingDeleted(
              input.organizationId,
              seenList.snapshot.spaceId,
            );
      if (seenList === null || seenSpace === null) {
        return { outcome: 'not-found' };
      }
      const seen: RestoreDeletedListOutput | null = await this.refusalOf(
        store,
        viewer,
        seenSpace,
        seenList,
      );
      if (seen !== null) {
        return seen;
      }
      const space: Space | null = await store.spaces.lockIncludingDeleted(
        input.organizationId,
        seenSpace.snapshot.id,
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
      if (
        space.snapshot.version !== seenSpace.snapshot.version ||
        list.snapshot.version !== seenList.snapshot.version
      ) {
        const locked: RestoreDeletedListOutput | null = await this.refusalOf(
          store,
          viewer,
          space,
          list,
        );
        if (locked !== null) {
          return locked;
        }
      }
      if (!space.isDeleted && !list.isDeleted) {
        return { outcome: 'restored', listRestored: false, spaceRestored: false };
      }
      const actor: EventActor = { type: 'user', id: input.actorUserId };
      const at: Date = await store.clock.now();
      if (space.isDeleted) {
        await this.restoreSpace(store, space.restoreFromTrash(at), actor);
      }
      if (list.isDeleted) {
        await this.restoreList(store, list.restoreFromTrash(at), actor);
      }
      return {
        outcome: 'restored',
        listRestored: list.isDeleted,
        spaceRestored: space.isDeleted,
      };
    });
  }

  /**
   * Method refusalOf
   *
   * @description
   * The refusal of a restoration of the list by the member, from its role as if not deleted:
   * `not-found` without a role, `role-insufficient` without `edit`, `null` with `edit`.
   *
   * @param {SpacesStore} store - The store of the transaction.
   * @param {Viewer} viewer - The member and its role in the organization.
   * @param {Space} space - The space of the list.
   * @param {TaskList} list - The list.
   * @returns {Promise<RestoreDeletedListOutput | null>} The refusal, or `null`.
   */
  private async refusalOf(
    store: SpacesStore,
    viewer: Viewer,
    space: Space,
    list: TaskList,
  ): Promise<RestoreDeletedListOutput | null> {
    const role: AccessRole | null = await this.access.listRoleAsIfNotDeleted(
      store.grants,
      viewer,
      space.snapshot,
      list.snapshot,
    );
    if (role === null) {
      return { outcome: 'not-found' };
    }
    return canEdit(role) ? null : { outcome: 'role-insufficient', role };
  }

  /**
   * Method restoreSpace
   *
   * @description
   * Writes a space back from the trash, appends `space.restored.v1`, then `space.access-republished.v1`
   * with every grant of the space at the same version.
   *
   * @param {SpacesStore} store - The store of the transaction.
   * @param {Space} space - The space after `restoreFromTrash`.
   * @param {EventActor} actor - The member who restores the entry.
   * @returns {Promise<void>} Resolves once written and appended.
   */
  private async restoreSpace(store: SpacesStore, space: Space, actor: EventActor): Promise<void> {
    await store.spaces.update(space);
    await store.events.spaceRestored(space, actor);
    const grants: GrantEntry[] = entriesOf(
      await store.grants.listOf(space.snapshot.organizationId, {
        kind: 'space',
        spaceId: space.snapshot.id,
      }),
    );
    await store.events.spaceAccessRepublished(
      space,
      grants,
      grants.map((grant: GrantEntry): string => grant.userId),
      actor,
    );
  }

  /**
   * Method restoreList
   *
   * @description
   * Writes a list back from the trash, appends `list.restored.v1`, then `list.access-changed.v1`
   * with its switch and every grant of it at the same version.
   *
   * @param {SpacesStore} store - The store of the transaction.
   * @param {TaskList} list - The list after `restoreFromTrash`.
   * @param {EventActor} actor - The member who restores the entry.
   * @returns {Promise<void>} Resolves once written and appended.
   */
  private async restoreList(store: SpacesStore, list: TaskList, actor: EventActor): Promise<void> {
    await store.lists.update(list);
    await store.events.listRestored(list, actor);
    const grants: GrantEntry[] = entriesOf(
      await store.grants.listOf(list.snapshot.organizationId, {
        kind: 'list',
        spaceId: list.snapshot.spaceId,
        listId: list.snapshot.id,
      }),
    );
    await store.events.listAccessChanged(list, grants, ['grants', 'organizationAccess'], [], actor);
  }
  // #endregion
}
