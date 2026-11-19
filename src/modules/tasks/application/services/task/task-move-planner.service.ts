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
import { TaskEditGuard } from './task-edit-guard.service.js';

/**
 * How many times the subtree is read to lock it: the three levels the read goes down, plus the
 * read that finds nothing new. A subtree that keeps growing while it is locked is a defect.
 */
const MAX_LOCK_PASSES: number = 5;

/**
 * The most descendants a valid task can have: 25 subtasks, each with 25 subtasks of its own (three
 * levels at most). More means the stored tree breaks the limits, and locking it would be unbounded.
 */
const MAX_DESCENDANTS: number = 650;

/** The tasks locked for a move, and the subtree they were locked against. */
interface LockedSubtree {
  // #region Properties
  /** The locked descendants, and the other tasks asked for. */
  readonly tasks: readonly Task[];

  /** The subtree as the last read, under the locks, found it. */
  readonly shape: SubtreeShape;
  // #endregion
}

/**
 * Class TaskMovePlanner
 *
 * @description
 * Resolves the target of a patch for the domain: the list to move to and the task to attach to
 * are looked up, checked for existence and visibility (`list-invalid`, `parent-invalid`), then for
 * the role a change needs: a move needs `edit` on the list it goes to, an attachment `edit` on the
 * list of the new parent (`role-insufficient`; "It needs `edit` on the list of the task, and on the
 * list it moves to" of `openapi/public/tasks.yaml`); the list of the task itself was checked by
 * `TaskLocator`. An unseen target stays a `422`, a seen one without `edit` is a `403`, both after
 * `If-Match`. The tasks that move with the task (its descendants, and the new parent) are locked
 * in ordered statements after the task itself, until every descendant of the task is locked (a descendant
 * that left the subtree while the locks were taken is not kept). It also picks the statuses the domain checks a new status
 * against: those of the space the task ends up in. The rules of the tree (depth, limit, cycles,
 * the list of a subtask) stay with `Task.update`.
 */
export class TaskMovePlanner {
  // #region Properties
  /** The spaces module, to see the target list and the list of the parent. */
  private readonly spaces: SpaceDirectory;

  /** Checks the role a change needs on the target list and on the list of the new parent. */
  private readonly editing: TaskEditGuard;
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
    this.editing = new TaskEditGuard();
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
   * @throws {TaskRefusal} `list-invalid`, `parent-invalid`, or `role-insufficient` with the role
   * of the actor on the target list or on the list of the new parent.
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
      descendants = (await this.lockSubtree(store, task, [])).tasks;
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
   * Finds the list the task moves to, which the actor must see and have `edit` on.
   *
   * @param {Task} task - The task.
   * @param {ListPlacement} current - Where the task is.
   * @param {Viewer} viewer - The acting member.
   * @param {string | undefined} listId - The list of the patch, if it names one.
   * @returns {Promise<ListPlacement>} The target, the current place when the patch names none.
   * @throws {TaskRefusal} `list-invalid` when the list is unknown or not seen,
   * `role-insufficient` when the actor sees it without `edit`.
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
    this.editing.requireEdit(target.list);
    return target;
  }

  /**
   * Method resolveParent
   *
   * @description
   * Finds the task to attach to, which the actor must see with `edit` on its list (the task moves
   * to that list), locks it with the descendants of the task and reads its level and the number of
   * its subtasks under that lock. The parent was read without a lock to check its list:
   * when the locked parent is in another list, the visibility, the role and the statuses are those
   * of the list it is in now. A parent in the list of the task needs nothing more: the actor has
   * `edit` on that list already.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {Viewer} viewer - The acting member.
   * @param {Task} task - The task to attach.
   * @param {string} parentKey - The key of the new parent.
   * @returns {Promise<{ attachment: TaskAttachment; statuses: SpaceStatusUse; descendants: readonly Task[] }>}
   * The attachment for the domain, the statuses of the space of the parent and the descendants.
   * @throws {TaskRefusal} `parent-invalid` when the parent is unknown or not seen,
   * `role-insufficient` when the actor sees its list without `edit`.
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
    this.editing.requireEdit(placement.list);
    const { tasks: locked, shape: subtree } = await this.lockSubtree(store, task, [
      found.snapshot.id,
    ]);
    const parent: Task | undefined = locked.find(
      (candidate: Task): boolean => candidate.snapshot.id === found.snapshot.id,
    );
    if (parent === undefined) {
      throw invalid;
    }
    let statuses: SpaceStatusUse = placement.space.statuses;
    if (parent.snapshot.listId !== found.snapshot.listId) {
      const moved: ListPlacement | null = await this.spaces.findVisibleList(
        organizationId,
        viewer,
        parent.snapshot.listId,
      );
      if (moved === null) {
        throw invalid;
      }
      this.editing.requireEdit(moved.list);
      statuses = moved.space.statuses;
    }
    const [level, childCount] = [
      await store.tasks.levelOf(organizationId, parent.snapshot.id),
      await store.tasks.childCount(organizationId, parent.snapshot.id),
    ];
    return {
      attachment: { parent: parent.asParent(level, childCount), subtree },
      statuses,
      descendants: locked.filter((candidate: Task): boolean =>
        subtree.descendantIds.includes(candidate.snapshot.id),
      ),
    };
  }

  /**
   * Method lockSubtree
   *
   * @description
   * Locks the descendants of a task, and some other tasks, in statements in id order, until the
   * subtree read after the locks holds nothing that is not locked. A task locked on the strength
   * of an earlier read may have left the subtree meanwhile (another transaction re-parented it
   * before the lock was granted); the last read decides, so only the tasks that are still
   * descendants, and the other tasks asked for, are returned. Writers lock a task before they
   * change its parent or its subtasks, so the subtree cannot change once every task of it is
   * locked. A valid subtree has three levels and at most 650 descendants, which bounds the passes
   * and the locks.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {Task} task - The task, locked by the caller.
   * @param {readonly string[]} otherIds - The other tasks to lock with them.
   * @returns {Promise<LockedSubtree>} The locked descendants and other tasks, and the subtree they
   * were checked against.
   * @throws {Error} When the stored subtree is larger than a valid one, or keeps growing while it
   * is locked.
   */
  private async lockSubtree(
    store: TasksStore,
    task: Task,
    otherIds: readonly string[],
  ): Promise<LockedSubtree> {
    const { organizationId, id } = task.snapshot;
    const asked = new Set<string>();
    const held = new Map<string, Task>();
    for (let pass = 0; pass < MAX_LOCK_PASSES; pass += 1) {
      const shape: SubtreeShape = await store.tasks.subtreeOf(organizationId, id);
      if (shape.descendantIds.length > MAX_DESCENDANTS) {
        throw new Error(
          `The task ${id} has ${String(shape.descendantIds.length)} descendants, more than ${String(MAX_DESCENDANTS)}.`,
        );
      }
      const wanted: readonly string[] = [...new Set<string>([...otherIds, ...shape.descendantIds])];
      const unlocked: readonly string[] = wanted.filter(
        (wantedId: string): boolean => !asked.has(wantedId),
      );
      if (unlocked.length === 0) {
        return {
          tasks: [...held.values()].filter((candidate: Task): boolean =>
            wanted.includes(candidate.snapshot.id),
          ),
          shape,
        };
      }
      for (const wantedId of unlocked) {
        asked.add(wantedId);
      }
      for (const locked of await store.tasks.lockByIds(organizationId, unlocked)) {
        held.set(locked.snapshot.id, locked);
      }
    }
    throw new Error(`The subtree of the task ${id} kept changing while it was locked.`);
  }
  // #endregion
}
