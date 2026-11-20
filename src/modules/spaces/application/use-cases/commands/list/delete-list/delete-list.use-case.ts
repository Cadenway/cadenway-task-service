import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import { SpaceRefusal } from '../../../../models/space/space-refusal.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { TrashWrites } from '../../../../ports/outbound/feature/trash/trash-writes.port.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { EditableListLocator } from '../../../../services/list/editable-list-locator.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import type { DeleteListInput } from './delete-list.input.js';

/**
 * Class DeleteList
 *
 * @description
 * Deletes a list or a sprint the actor has `edit` on, archived or not
 * (`DELETE /internal/v1/lists/{listId}`, "Supprimer la liste", "Deletion" of
 * `openapi/public/lists.yaml`): it becomes a tombstone that every route answers `404` and every
 * collection leaves out, with its tasks, which the job `task.trash-deleted-tasks` then moves to the
 * trash. The membership of the actor is read `FOR SHARE`, then the list is locked until the end of
 * the transaction (`EditableListLocator`, the guard of every write of a list, as `ArchiveList`).
 * Refusals, in this order: `list-not-found` (unknown, deleted, or no role on it),
 * `role-insufficient` (a role without `edit`), `version-mismatch` (`If-Match`). Otherwise the list
 * takes `deletedAt` = the instant of the transaction, `deletedBy` = the actor, the next version;
 * `list.deleted.v1` is appended and the job enqueued (occurrence key
 * `list:<listId>:<version after>`) in the same tenant transaction, so the three commit together.
 * Not recorded in the activity log. Its grants stay with the tombstone. While the writes of the
 * trash are off (`TrashWrites`, `TRASH_WRITES_ENABLED`), it answers `trash-writes-disabled` first,
 * before the membership, which the route maps to the answer of an unknown route.
 */
export class DeleteList {
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
   * Property lists
   *
   * @description
   * Locks the list and applies the refusals of a write.
   *
   * @type {EditableListLocator}
   * @readonly
   */
  private readonly lists: EditableListLocator;
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
    this.lists = new EditableListLocator();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Deletes the list.
   *
   * @param {DeleteListInput} input - The actor, the list and the versions `If-Match` accepts
   * (`null` when absent).
   * @returns {Promise<void>} Resolves once the deletion, its event and its job are written.
   * @throws {SpaceRefusal} `trash-writes-disabled` (first), `organization-not-found`, `list-not-found`, `role-insufficient` or
   * `version-mismatch`.
   */
  public async execute(input: DeleteListInput): Promise<void> {
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
      const stored: TaskList = await this.lists.lock(
        store,
        viewer,
        input.organizationId,
        input.listId,
        input.expectedVersions,
      );
      const actor: EventActor = { type: 'user', id: input.actorUserId };
      const list: TaskList = stored.delete(actor, await store.clock.now());
      await store.lists.update(list);
      await store.events.listDeleted(list, actor);
      await store.trashQueue.enqueue({
        kind: 'list',
        listId: list.snapshot.id,
        version: list.snapshot.version,
      });
    });
  }
  // #endregion
}
