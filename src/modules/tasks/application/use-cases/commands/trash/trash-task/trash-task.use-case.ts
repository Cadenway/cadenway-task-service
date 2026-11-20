import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import { canWriteTasksOf } from '../../../../../domain/policies/task/task-write.policy.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { TaskActor } from '../../../../../domain/value-objects/task/task-actor.value-object.js';
import type { LocatedTask } from '../../../../models/task/located-task.model.js';
import type { LocateRequest } from '../../../../models/task/locate-request.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { LockedTrashTrees } from '../../../../models/trash/locked-trash-trees.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TrashWrites } from '../../../../ports/outbound/feature/trash/trash-writes.port.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import { TrashEntryViewBuilder } from '../../../../services/trash/trash-entry-view-builder.service.js';
import { TrashTreeLocker } from '../../../../services/trash/trash-tree-locker.service.js';
import { TrashWriter } from '../../../../services/trash/trash-writer.service.js';
import type { TrashTaskInput } from './trash-task.input.js';
import type { TrashTaskOutput } from './trash-task.output.js';

/** Limits retries when a task is restored between the tree read and the fallback lookup. */
const MAX_ATTEMPTS: number = 3;

/** Rolls back all task locks before retrying the ordered acquisition. */
class RetryTrashTree extends Error {}

/**
 * Class TrashTask
 *
 * @description
 * Moves a task the actor sees and its subtasks at every level to the trash as one entry
 * (`POST /internal/v1/tasks/{taskKey}/trash`; "Entries" of `openapi/public/trash.yaml`). While the
 * switch of the writes of the trash is off (`TrashWrites`, `TRASH_WRITES_ENABLED`), it refuses
 * first, before any read, with `trash-writes-disabled`, which the route answers as a route the
 * service does not have. The actor needs `edit` on the list of the task. Refusals in order:
 * `task-not-found`, `task-trashed` (the
 * task is in the trash already, with its entry when the actor may restore it), `role-insufficient`,
 * `task-archived` (an archived task "is deleted once restored"), `version-mismatch` (`If-Match` on
 * the task), checked first on the task read without a lock, so that a task the actor does not see
 * or may not change answers at once whatever another transaction holds. Locks follow the global
 * lock order: the membership of the actor `FOR SHARE`, then the task with its tree
 * (`TrashTreeLocker`: the task and every descendant of it in its list out of the trash, live or
 * archived, read in one recursive statement and locked in one statement in ascending id, without
 * their checklists, until the tree read under the locks holds nothing unlocked), the same order as
 * a batch of the deletion job, which locks whole trees in one statement by id: the task is not
 * locked by key first, so an older subtask under a newer parent cannot make the two wait for each
 * other. The current space and list are then held `FOR SHARE` and the role is read again. Every
 * refusal is then checked again on the task as locked (`TaskLocator.confirm`): in the
 * trash meanwhile, moved to a list the actor does not see or may not change, archived meanwhile,
 * `If-Match` on the locked version; a task trashed meanwhile, which the tree leaves out, answers
 * as the unlocked read then does. If it is live on that read, the transaction rolls back and retries
 * the ordered acquisition up to three times. An archived subtask goes with it and keeps its archive, out of
 * the archives while in the trash; a subtask deleted before keeps its own entry, and a subtask in
 * another list (an archived task whose parent moved away) stays. An entry holds at most 651 live
 * tasks and the archived subtasks under them, which the product does not limit.
 *
 * The entry gets the transaction instant, the actor and the parent the root reads with, and every
 * task its entry, its next version and `updatedAt`, in one statement (`TrashWriter`); then one
 * `task.trashed.v1` per task, the root first, then by depth and id. In the same transaction it
 * enqueues `task.drop-trashed-task-requests` for the tasks of the entry (key `entry:<entryId>`):
 * their pending access requests are dropped by the deletion-lifecycle job within seconds, and are
 * hidden at once, since `FindTaskReference(s)` no longer find a task in the trash. The trash is not
 * recorded in the activity log. The answer is the entry, with the list as the actor sees it.
 */
export class TrashTask {
  // #region Properties
  /** The switch of the writes of the trash. */
  private readonly writes: TrashWrites;

  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Finds the task. */
  private readonly locator: TaskLocator;

  /** Locks the placement and reads the role after the task locks. */
  private readonly spaces: SpaceDirectory;

  /** Locks the tree of the task. */
  private readonly trees: TrashTreeLocker;

  /** Moves the tree to the trash. */
  private readonly writer: TrashWriter;

  /** Builds the view of the entry. */
  private readonly views: TrashEntryViewBuilder;
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
    this.viewers = new ViewerResolver(members);
    this.locator = new TaskLocator(spaces);
    this.spaces = spaces;
    this.trees = new TrashTreeLocker();
    this.writer = new TrashWriter();
    this.views = new TrashEntryViewBuilder();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Moves the task and its tree to the trash.
   *
   * @param {TrashTaskInput} input - The actor, the task and the versions `If-Match` accepts.
   * @returns {Promise<TrashTaskOutput>} The entry.
   * @throws {TaskRefusal} `trash-writes-disabled` while the switch is off, then
   * `organization-not-found`, `task-not-found`, `task-trashed`, `role-insufficient`,
   * `task-archived` or `version-mismatch`.
   * @throws {Error} When the tree holds a cycle of parent links or keeps changing while it is
   * locked, or a task changed version under its lock: defects.
   */
  public async execute(input: TrashTaskInput): Promise<TrashTaskOutput> {
    if (!this.writes.isEnabled()) {
      throw new TaskRefusal({ reason: 'trash-writes-disabled' });
    }
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.unitOfWork.run(async (store: TasksStore): Promise<TrashTaskOutput> => {
          const { organizationId } = input;
          const viewer: Viewer = await this.viewers.resolve(
            organizationId,
            input.actorUserId,
            true,
          );
          const request: LocateRequest = {
            organizationId,
            viewer,
            taskKey: input.taskKey,
            edit: true,
            lock: false,
            archived: 'refuse',
            expectedVersions: input.expectedVersions,
          };
          const located: LocatedTask = await this.locator.locate(store, request);
          const locked: LockedTrashTrees = await this.trees.lock(
            store,
            organizationId,
            [located.task.snapshot.id],
            [],
            Number.POSITIVE_INFINITY,
          );
          const root: Task | undefined = locked.trees[0]?.root;
          if (root === undefined) {
            // A live task was restored between the reads: acquire its tree again.
            await this.locator.locate(store, request);
            throw new RetryTrashTree();
          }
          const [listLock] = await this.spaces.lockTrashLists(
            organizationId,
            [root.snapshot.listId],
            'hold',
            viewer,
          );
          if (listLock?.outcome !== 'live' || listLock.role === null) {
            throw new TaskRefusal({ reason: 'task-not-found' });
          }
          if (!canWriteTasksOf(listLock.role)) {
            throw new TaskRefusal({ reason: 'role-insufficient', role: listLock.role });
          }
          const { placement }: LocatedTask = await this.locator.confirm(store, request, root);
          const now: Date = await store.clock.now();
          const by: TaskActor = { type: 'user', id: input.actorUserId };
          const [tree] = await this.writer.trash(store, organizationId, locked.trees, by, now);
          if (tree === undefined) {
            throw new Error(`The trash of the task ${input.taskKey} made no entry.`);
          }
          await store.jobs.dropTrashedTaskRequests(
            tree.entry.id,
            tree.tasks.map((member: Task): string => member.snapshot.id),
          );
          const { list } = placement;
          return this.views.build(tree.entry, {
            id: list.id,
            spaceId: list.spaceId,
            name: list.name,
            state: list.archivedAt === null ? 'active' : 'archived',
          });
        });
      } catch (error: unknown) {
        if (!(error instanceof RetryTrashTree)) {
          throw error;
        }
      }
    }
    throw new Error(`The task ${input.taskKey} kept leaving its tree while it was locked.`);
  }
  // #endregion
}
