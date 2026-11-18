import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import { InvalidTaskError } from '../../../domain/errors/task/invalid-task.error.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { SubtreeShape } from '../../../domain/value-objects/subtask/subtree-shape.value-object.js';
import type { TaskAttachment } from '../../../domain/value-objects/subtask/task-attachment.value-object.js';
import type { SpaceStatusUse } from '../../../domain/value-objects/task/space-status-use.value-object.js';
import { TaskKey } from '../../../domain/value-objects/task/task-key.value-object.js';
import type { TaskPatch } from '../../../domain/value-objects/task/task-patch.value-object.js';
import type { ListPlacement } from '../../models/placement/list-placement.model.js';
import type { PlannedChange } from '../../models/placement/planned-change.model.js';
import type { LocatedTask } from '../../models/task/located-task.model.js';
import type { TaskChange } from '../../models/task/task-change.model.js';
import { TaskRefusal } from '../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import type { SpaceDirectory } from '../../ports/outbound/spaces/space/space-directory.port.js';

/**
 * Class TaskMovePlanner
 *
 * @description
 * Resolves the target of a patch for the domain: the list to move to and the task to attach to
 * are looked up, checked for existence and visibility (`list-invalid`, `parent-invalid`), and the
 * tasks that move with the task (its descendants, and the new parent) are locked in one ordered
 * statement after the task itself. It also picks the statuses the domain checks a new status
 * against: those of the space the task ends up in. The rules of the tree (depth, limit, cycles,
 * the list of a subtask) stay with `Task.update`.
 */
export class TaskMovePlanner {
  // #region Properties
  /** The spaces module, to see the target list and the list of the parent. */
  private readonly spaces: SpaceDirectory;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the directory of the spaces.
   *
   * @param {SpaceDirectory} spaces - The spaces module.
   * @constructor
   */
  public constructor(spaces: SpaceDirectory) {
    this.spaces = spaces;
  }
  // #endregion

  // #region Methods
  /**
   * Method plan
   *
   * @description
   * Resolves a patch.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {Viewer} viewer - The acting member.
   * @param {LocatedTask} located - The task, locked, and its place.
   * @param {TaskChange} change - The patch as the request says it.
   * @returns {Promise<PlannedChange>} The patch for the domain, the statuses to check and the
   * locked descendants (empty unless the task can change list).
   * @throws {TaskRefusal} `list-invalid` or `parent-invalid`.
   */
  public async plan(
    store: TasksStore,
    viewer: Viewer,
    located: LocatedTask,
    change: TaskChange,
  ): Promise<PlannedChange> {
    const { task, placement: current } = located;
    const { listId, parentKey, ...fields } = change;
    const target: ListPlacement = await this.resolveList(task, current, viewer, listId);
    const moves: boolean = target.list.id !== current.list.id;
    let statuses: SpaceStatusUse = target.space.statuses;
    let descendants: readonly Task[] = [];
    let attachment: TaskAttachment | null | undefined;
    if (parentKey === null) {
      attachment = null;
    }
    if (typeof parentKey === 'string') {
      const attached = await this.resolveParent(store, viewer, task, parentKey);
      attachment = attached.attachment;
      statuses = attached.statuses;
      descendants = attached.descendants;
    } else if (moves) {
      descendants = await this.lockDescendants(store, task, []);
    }
    const patch: TaskPatch = {
      ...fields,
      ...(listId === undefined
        ? {}
        : { list: { listId: target.list.id, spaceId: target.space.id } }),
      ...(attachment === undefined ? {} : { parent: attachment }),
    };
    return { patch, statuses, descendants };
  }

  /**
   * Method resolveList
   *
   * @description
   * Finds the list the task moves to, which the actor must see.
   *
   * @param {Task} task - The task.
   * @param {ListPlacement} current - Where the task is.
   * @param {Viewer} viewer - The acting member.
   * @param {string | undefined} listId - The list of the patch, if it names one.
   * @returns {Promise<ListPlacement>} The target, the current place when the patch names none.
   * @throws {TaskRefusal} `list-invalid` when the list is unknown or not seen.
   */
  private async resolveList(
    task: Task,
    current: ListPlacement,
    viewer: Viewer,
    listId: string | undefined,
  ): Promise<ListPlacement> {
    if (listId === undefined || listId === current.list.id) {
      return current;
    }
    const target: ListPlacement | null = await this.spaces.findVisibleList(
      task.snapshot.organizationId,
      viewer,
      listId,
    );
    if (target === null) {
      throw new TaskRefusal({ reason: 'list-invalid' });
    }
    return target;
  }

  /**
   * Method resolveParent
   *
   * @description
   * Finds the task to attach to, which the actor must see, locks it with the descendants of the
   * task and reads its level and the number of its subtasks under that lock.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {Viewer} viewer - The acting member.
   * @param {Task} task - The task to attach.
   * @param {string} parentKey - The key of the new parent.
   * @returns {Promise<{ attachment: TaskAttachment; statuses: SpaceStatusUse; descendants: readonly Task[] }>}
   * The attachment for the domain, the statuses of the space of the parent and the descendants.
   * @throws {TaskRefusal} `parent-invalid` when the parent is unknown or not seen.
   */
  private async resolveParent(
    store: TasksStore,
    viewer: Viewer,
    task: Task,
    parentKey: string,
  ): Promise<{
    readonly attachment: TaskAttachment;
    readonly statuses: SpaceStatusUse;
    readonly descendants: readonly Task[];
  }> {
    const { organizationId } = task.snapshot;
    const invalid: TaskRefusal = new TaskRefusal({ reason: 'parent-invalid', parentKey });
    let key: TaskKey;
    try {
      key = TaskKey.parse(parentKey);
    } catch (error: unknown) {
      throw error instanceof InvalidTaskError ? invalid : error;
    }
    const found: Task | null = await store.tasks.findByKey(organizationId, key, false);
    const placement: ListPlacement | null =
      found === null
        ? null
        : await this.spaces.findVisibleList(organizationId, viewer, found.snapshot.listId);
    if (found === null || placement === null) {
      throw invalid;
    }
    const locked: readonly Task[] = await this.lockDescendants(store, task, [found.snapshot.id]);
    const parent: Task | undefined = locked.find(
      (candidate: Task): boolean => candidate.snapshot.id === found.snapshot.id,
    );
    if (parent === undefined) {
      throw invalid;
    }
    const subtree: SubtreeShape = await store.tasks.subtreeOf(organizationId, task.snapshot.id);
    const [level, childCount] = [
      await store.tasks.levelOf(organizationId, parent.snapshot.id),
      await store.tasks.childCount(organizationId, parent.snapshot.id),
    ];
    return {
      attachment: { parent: parent.asParent(level, childCount), subtree },
      statuses: placement.space.statuses,
      descendants: locked.filter((candidate: Task): boolean =>
        subtree.descendantIds.includes(candidate.snapshot.id),
      ),
    };
  }

  /**
   * Method lockDescendants
   *
   * @description
   * Locks the descendants of a task, and some other tasks, in one statement in id order; then reads
   * the tree again under the lock and locks the descendants that appeared meanwhile.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {Task} task - The task, locked by the caller.
   * @param {readonly string[]} otherIds - The other tasks to lock with them.
   * @returns {Promise<readonly Task[]>} The locked tasks: the descendants and the others.
   */
  private async lockDescendants(
    store: TasksStore,
    task: Task,
    otherIds: readonly string[],
  ): Promise<readonly Task[]> {
    const { organizationId, id } = task.snapshot;
    const first: SubtreeShape = await store.tasks.subtreeOf(organizationId, id);
    const locked: Task[] = [
      ...(await store.tasks.lockByIds(organizationId, [
        ...new Set<string>([...otherIds, ...first.descendantIds]),
      ])),
    ];
    const lockedIds: ReadonlySet<string> = new Set<string>(
      locked.map((candidate: Task): string => candidate.snapshot.id),
    );
    const late: readonly string[] = (
      await store.tasks.subtreeOf(organizationId, id)
    ).descendantIds.filter((descendantId: string): boolean => !lockedIds.has(descendantId));
    if (late.length > 0) {
      locked.push(...(await store.tasks.lockByIds(organizationId, late)));
    }
    return locked;
  }
  // #endregion
}
