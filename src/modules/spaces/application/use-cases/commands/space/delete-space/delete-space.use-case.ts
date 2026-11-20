import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import { SpaceRefusal } from '../../../../models/space/space-refusal.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { TrashWrites } from '../../../../ports/outbound/feature/trash/trash-writes.port.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { GrantGuard } from '../../../../services/access/grant-guard.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import type { DeleteSpaceInput } from './delete-space.input.js';

/**
 * Class DeleteSpace
 *
 * @description
 * Deletes a space the actor manages (`DELETE /internal/v1/spaces/{spaceId}`, "Supprimer l’espace",
 * "Deletion" of `openapi/public/spaces.yaml`): the space and its lists, archived ones included,
 * become tombstones that every route answers `404` and every collection leaves out, with their
 * tasks, which the job `task.trash-deleted-tasks` then moves to the trash. The membership of the
 * actor is read `FOR SHARE`, then the space is locked `FOR NO KEY UPDATE`, then its lists not
 * deleted yet `FOR NO KEY UPDATE` in ascending id in one statement, then they are written in one
 * statement (spaces before lists, lists in ascending id: the lock order of the module). Refusals,
 * in this order: `space-not-found` (unknown, deleted, or not seen), `manage-forbidden` (seen but
 * not managed, `canManageSpace`), `version-mismatch` (`If-Match`). Otherwise the space takes
 * `deletedAt` = the instant of the transaction, `deletedBy` = the actor, the next version; every
 * list of it not deleted yet takes the same instant and actor at its own version, without event
 * (`TaskList.deleteWithSpace`, O(lists of the space)); `space.deleted.v1` is appended and the job
 * enqueued (occurrence key `space:<spaceId>:<version after>`) in the same tenant transaction. Not
 * recorded in the activity log. Its grants and those of its lists stay with the tombstones, its
 * prefixes stay reserved. While the writes of the trash are off (`TrashWrites`,
 * `TRASH_WRITES_ENABLED`), it answers `trash-writes-disabled` first, before the membership, which
 * the route maps to the answer of an unknown route.
 */
export class DeleteSpace {
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
   * Property viewers
   *
   * @description
   * Resolves the acting member.
   *
   * @type {ViewerResolver}
   * @readonly
   */
  private readonly viewers: ViewerResolver;

  /**
   * Property trashWrites
   *
   * @description
   * The switch of the writes of the trash, checked first.
   *
   * @type {TrashWrites}
   * @readonly
   */
  private readonly trashWrites: TrashWrites;

  /**
   * Property guard
   *
   * @description
   * Locks the space and checks that the actor manages it, as for its grants.
   *
   * @type {GrantGuard}
   * @readonly
   */
  private readonly guard: GrantGuard;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port, the directory of the members and the switch of the trash.
   *
   * @param {SpacesUnitOfWork} unitOfWork - The tenant transaction.
   * @param {MemberDirectory} members - The copy of the memberships.
   * @param {TrashWrites} trashWrites - The switch of the writes of the trash.
   * @constructor
   */
  public constructor(
    unitOfWork: SpacesUnitOfWork,
    members: MemberDirectory,
    trashWrites: TrashWrites,
  ) {
    this.unitOfWork = unitOfWork;
    this.viewers = new ViewerResolver(members);
    this.trashWrites = trashWrites;
    this.guard = new GrantGuard();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Deletes the space and its lists.
   *
   * @param {DeleteSpaceInput} input - The actor, the space and the versions `If-Match` accepts
   * (`null` when absent).
   * @returns {Promise<void>} Resolves once the deletion, its event and its job are written.
   * @throws {SpaceRefusal} `trash-writes-disabled` (first), `organization-not-found`,
   * `space-not-found`, `manage-forbidden` or `version-mismatch`.
   */
  public async execute(input: DeleteSpaceInput): Promise<void> {
    // Before the membership and the transaction, so that the answer carries nothing.
    if (!this.trashWrites.isEnabled()) {
      throw new SpaceRefusal({ reason: 'trash-writes-disabled' });
    }
    await this.unitOfWork.run(async (store: SpacesStore): Promise<void> => {
      const viewer: Viewer = await this.viewers.resolve(
        input.organizationId,
        input.actorUserId,
        true,
      );
      const stored: Space = await this.guard.lockManagedSpace(
        store,
        input.organizationId,
        viewer,
        input.spaceId,
        input.expectedVersions,
      );
      // In ascending id, the order of every locker of several lists, before the UPDATE that marks
      // them takes them in the order of its scan.
      await store.lists.lockUndeletedOfSpace(input.organizationId, stored.snapshot.id);
      const actor: EventActor = { type: 'user', id: input.actorUserId };
      const at: Date = await store.clock.now();
      const space: Space = stored.delete(actor, at);
      await store.spaces.update(space);
      const deletedListIds: readonly string[] = await store.lists.markDeletedWithSpace(
        input.organizationId,
        space.snapshot.id,
        actor,
        at,
      );
      await store.libraryCleanup.removeListViews(input.organizationId, deletedListIds);
      await store.libraryCleanup.removeSpaceTemplates(input.organizationId, space.snapshot.id);
      await store.events.spaceDeleted(space, actor);
      await store.trashQueue.enqueue({
        kind: 'space',
        spaceId: space.snapshot.id,
        version: space.snapshot.version,
      });
    });
  }
  // #endregion
}
