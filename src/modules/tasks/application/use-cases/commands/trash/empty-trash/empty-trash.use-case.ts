import { canWriteTasksOf } from '../../../../../domain/policies/task/task-write.policy.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { TrashListAccess } from '../../../../models/placement/trash-list-access.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { TrashWrites } from '../../../../ports/outbound/feature/trash/trash-writes.port.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import type { EmptyTrashInput } from './empty-trash.input.js';
import type { EmptyTrashOutput } from './empty-trash.output.js';

/**
 * Class EmptyTrash
 *
 * @description
 * "Vider la corbeille" (`POST /internal/v1/trash/empty`; `openapi/public/trash.yaml`): takes every
 * entry the actor may restore out of the trash at once (the entries of the lists on which they
 * have `edit`, as if the lists and their spaces were not deleted: `ListTrashLists` of spaces
 * filtered with `canWriteTasksOf`) and hands them to the purge job, in one `UPDATE` of the entry
 * rows that sets the hand-over instant and actor (O(entries they may restore), no task written).
 * The entries leave the trash at once: they no longer list, restore or erase by a person
 * (`trash-entry-not-found`), and their tasks answer `task-not-found`. When at least one left, it
 * enqueues one `task.purge-trash` job in the same transaction (no occurrence key), which erases
 * them in bounded batches, with this actor. The entries of the lists the actor may not restore
 * stay. While the switch of the writes of the trash is off (`TrashWrites`), it refuses first,
 * before any read, with `trash-writes-disabled`, which the route answers as a route the service
 * does not have. The membership of the actor is read `FOR SHARE` first; an actor with `edit` on no
 * list writes nothing.
 */
export class EmptyTrash {
  // #region Properties
  /** The switch of the writes of the trash. */
  private readonly writes: TrashWrites;

  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** The spaces module, for the lists of the trash of the actor. */
  private readonly spaces: SpaceDirectory;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the switch of the writes of the trash, the transaction port and the two directories.
   *
   * @param {TrashWrites} writes - The switch of the writes of the trash.
   * @param {TasksUnitOfWork} unitOfWork - The tenant transaction.
   * @param {MemberDirectory} members - The copy of the memberships.
   * @param {SpaceDirectory} spaces - The spaces module.
   * @constructor
   */
  public constructor(
    writes: TrashWrites,
    unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ) {
    this.writes = writes;
    this.unitOfWork = unitOfWork;
    this.spaces = spaces;
    this.viewers = new ViewerResolver(members);
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Hands the entries to the purge.
   *
   * @param {EmptyTrashInput} input - The actor.
   * @returns {Promise<EmptyTrashOutput>} How many entries left the trash.
   * @throws {TaskRefusal} `trash-writes-disabled` while the switch is off, then
   * `organization-not-found`.
   */
  public async execute(input: EmptyTrashInput): Promise<EmptyTrashOutput> {
    if (!this.writes.isEnabled()) {
      throw new TaskRefusal({ reason: 'trash-writes-disabled' });
    }
    return this.unitOfWork.run(async (store: TasksStore): Promise<EmptyTrashOutput> => {
      const { organizationId } = input;
      const viewer: Viewer = await this.viewers.resolve(organizationId, input.actorUserId, true);
      const listIds: readonly string[] = (await this.spaces.trashLists(organizationId, viewer))
        .filter((access: TrashListAccess): boolean => canWriteTasksOf(access.role))
        .map((access: TrashListAccess): string => access.list.id);
      if (listIds.length === 0) {
        return { entryCount: 0 };
      }
      const now: Date = await store.clock.now();
      const entryCount: number = await store.trash.requestPurge(organizationId, listIds, now, {
        type: 'user',
        id: input.actorUserId,
      });
      if (entryCount > 0) {
        await store.jobs.purgeTrash();
      }
      return { entryCount };
    });
  }
  // #endregion
}
