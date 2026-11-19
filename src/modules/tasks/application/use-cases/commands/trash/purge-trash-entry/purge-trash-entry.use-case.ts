import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { TrashEntryRecord } from '../../../../models/trash/trash-entry-record.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TrashEntryLocator } from '../../../../services/trash/trash-entry-locator.service.js';
import { TrashEraser } from '../../../../services/trash/trash-eraser.service.js';
import type { PurgeTrashEntryInput } from './purge-trash-entry.input.js';

/**
 * Class PurgeTrashEntry
 *
 * @description
 * Erases a trash entry for good at once (`DELETE /internal/v1/trash/entries/{entryId}`; "Erasing"
 * of `openapi/public/trash.yaml`): its root and every task of it, their checklists, assignees,
 * labels and activity. An entry the actor may not restore (unknown, handed to the purge by "Vider
 * la corbeille", or of a list on which they would not have `edit` as if not deleted) answers
 * `trash-entry-not-found`. Locks: the membership of the actor `FOR SHARE`, the entry `FOR UPDATE`
 * (checked again on the locked row, so a restoration or an erasure that committed first leaves it
 * gone), then its tasks `FOR UPDATE` in one statement ordered by id (`lockTrashEntries`): 651
 * live tasks at most, plus the archived subtasks under them. The eraser emits one
 * `task.purged.v1` per task (its version plus one, the entry, the key of its root, its list, its
 * space and its parent as stored, the actor), erases the rows, detaches the tasks outside the
 * entry that hung from one of its tasks (tasks of other entries, and archived tasks left in
 * another list when their parent moved away), and hands a list left without a task to the spaces
 * module, which erases it when it is deleted, then its deleted space with its last list.
 */
export class PurgeTrashEntry {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Finds and locks the entry. */
  private readonly entries: TrashEntryLocator;

  /** Erases the entry. */
  private readonly eraser: TrashEraser;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port and the two directories.
   *
   * @param {TasksUnitOfWork} unitOfWork - The tenant transaction.
   * @param {MemberDirectory} members - The copy of the memberships.
   * @param {SpaceDirectory} spaces - The spaces module.
   * @constructor
   */
  public constructor(
    unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ) {
    this.unitOfWork = unitOfWork;
    this.viewers = new ViewerResolver(members);
    this.entries = new TrashEntryLocator(spaces);
    this.eraser = new TrashEraser(spaces);
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Erases the entry.
   *
   * @param {PurgeTrashEntryInput} input - The actor and the entry.
   * @returns {Promise<void>} Resolves once erased; the route answers `204`.
   * @throws {TaskRefusal} `organization-not-found` or `trash-entry-not-found`.
   * @throws {Error} When the entry has no root, a defect.
   */
  public async execute(input: PurgeTrashEntryInput): Promise<void> {
    await this.unitOfWork.run(async (store: TasksStore): Promise<void> => {
      const { organizationId, entryId } = input;
      const viewer: Viewer = await this.viewers.resolve(organizationId, input.actorUserId, true);
      const entry: TrashEntryRecord = await this.entries.lockRestorable(
        store,
        organizationId,
        viewer,
        entryId,
      );
      const tasks: readonly Task[] = await store.tasks.lockTrashEntries(
        organizationId,
        [entry.id],
        true,
      );
      await this.eraser.erase(store, organizationId, [
        { entry, tasks, actor: { type: 'user', id: input.actorUserId } },
      ]);
    });
  }
  // #endregion
}
