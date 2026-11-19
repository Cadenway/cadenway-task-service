import { ParentInvalidError } from '../../errors/subtask/parent-invalid.error.js';
import { SubtaskDepthExceededError } from '../../errors/subtask/subtask-depth-exceeded.error.js';
import { SubtaskLimitReachedError } from '../../errors/subtask/subtask-limit-reached.error.js';
import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { ListInvalidError } from '../../errors/task/list-invalid.error.js';
import type { RestoredRootParent } from '../../value-objects/subtask/restored-root-parent.value-object.js';
import type { SubtaskParent } from '../../value-objects/subtask/subtask-parent.value-object.js';
import type { TaskAttachment } from '../../value-objects/subtask/task-attachment.value-object.js';
import type { TaskKey } from '../../value-objects/task/task-key.value-object.js';
import type { TaskState } from '../../value-objects/task/task-state.value-object.js';
import {
  MAX_DIRECT_SUBTASKS,
  MAX_LEVELS,
} from '../../value-objects/task/task-limits.value-object.js';

/**
 * Function checkShape
 *
 * @description
 * Refuses a parent level, a child count or a subtree height no tree can have.
 *
 * @param {SubtaskParent} parent - The parent.
 * @param {number} height - The height of the subtree that goes under it, 1 for a new subtask.
 * @throws {InvalidTaskError} When the level or the height is not a positive integer, or the count
 * not a non-negative integer.
 */
function checkShape(parent: SubtaskParent, height: number): void {
  if (!Number.isInteger(parent.level) || parent.level < 1) {
    throw new InvalidTaskError('the level of a parent is a positive integer');
  }
  if (!Number.isInteger(parent.childCount) || parent.childCount < 0) {
    throw new InvalidTaskError('the subtask count of a parent is a non-negative integer');
  }
  if (!Number.isInteger(height) || height < 1) {
    throw new InvalidTaskError('the height of a subtree is a positive integer');
  }
}

/**
 * Function checkFit
 *
 * @description
 * The levels and the count of a parent that receives a subtree: the parent level plus the height
 * of the subtree is 3 at most, and the parent has fewer than 25 direct subtasks
 * (`openapi/public/tasks.yaml:28-30`, 440-442 and 835-837).
 *
 * @param {SubtaskParent} parent - The parent.
 * @param {number} height - The height of the subtree.
 * @throws {SubtaskDepthExceededError} When the subtree would reach below the third level.
 * @throws {SubtaskLimitReachedError} When the parent already has 25 direct subtasks.
 */
function checkFit(parent: SubtaskParent, height: number): void {
  if (parent.level + height > MAX_LEVELS) {
    throw new SubtaskDepthExceededError();
  }
  if (parent.childCount >= MAX_DIRECT_SUBTASKS) {
    throw new SubtaskLimitReachedError();
  }
}

/**
 * Function checkNewSubtask
 *
 * @description
 * Whether a parent accepts a new subtask, created under it or with it
 * (`openapi/public/tasks.yaml:28-30` and 835-837): a parent at the third level answers
 * `task.subtask-depth-exceeded`, a parent with 25 subtasks `task.subtask-limit-reached`, in that
 * order (open question 8 of the design).
 *
 * @param {SubtaskParent} parent - The parent, read under lock.
 * @throws {InvalidTaskError} When the shape of the parent is impossible.
 * @throws {SubtaskDepthExceededError} When the parent is at the third level.
 * @throws {SubtaskLimitReachedError} When the parent already has 25 direct subtasks.
 */
export function checkNewSubtask(parent: SubtaskParent): void {
  checkShape(parent, 1);
  checkFit(parent, 1);
}

/**
 * Function checkAttachment
 *
 * @description
 * Whether a task, with its subtasks, may become a subtask of another task
 * (`openapi/public/tasks.yaml:437-443`), in the order of open question 8 of the design:
 *
 * 1. the parent is neither the task nor one of its descendants (`task.parent-invalid`);
 * 2. a `listId` given in the same patch is the list of the parent (`task.list-invalid`);
 * 3. the task and its subtasks fit within 3 levels under it (`task.subtask-depth-exceeded`);
 * 4. the parent has fewer than 25 direct subtasks (`task.subtask-limit-reached`).
 *
 * When the parent is already the parent of the task, nothing moves: only the list is checked.
 *
 * @param {TaskKey} taskKey - The key of the task that attaches.
 * @param {string | null} currentParentId - The id of its parent before the change, or `null`.
 * @param {TaskAttachment} attachment - The parent and the subtree of the task.
 * @param {string | undefined} listId - The `listId` of the same patch, if any.
 * @throws {InvalidTaskError} When the shape of the parent or the subtree is impossible.
 * @throws {ParentInvalidError} When the parent is the task or one of its descendants.
 * @throws {ListInvalidError} When `listId` is not the list of the parent.
 * @throws {SubtaskDepthExceededError} When the subtree would reach below the third level.
 * @throws {SubtaskLimitReachedError} When the parent already has 25 direct subtasks.
 */
export function checkAttachment(
  taskKey: TaskKey,
  currentParentId: string | null,
  attachment: TaskAttachment,
  listId: string | undefined,
): void {
  const { parent, subtree } = attachment;
  checkShape(parent, subtree.height);
  const sameParent: boolean = parent.id === currentParentId;
  if (
    !sameParent &&
    (parent.id === subtree.taskId ||
      parent.key.equals(taskKey) ||
      subtree.descendantIds.includes(parent.id))
  ) {
    throw new ParentInvalidError(parent.key.format());
  }
  if (listId !== undefined && listId !== parent.listId) {
    throw new ListInvalidError();
  }
  if (!sameParent) {
    checkFit(parent, subtree.height);
  }
}

/**
 * Function depthsUnder
 *
 * @description
 * The depth of each task of a tree under its root, read from their parent links: 0 for the root,
 * 1 for its subtasks, 2 below. The tree is an archive, or the live subtree an archive takes; the
 * events of both go root first, then by depth (`asyncapi/task-service.yaml`, "Archives, trash and
 * deletions").
 *
 * @param {string} rootId - The id of the root.
 * @param {readonly Pick<TaskState, 'id' | 'parentId'>[]} tasks - The tasks of the tree, the root
 * included, in any order.
 * @returns {ReadonlyMap<string, number>} The depth by task id.
 * @throws {InvalidTaskError} When the root is not among the tasks, a task is given twice, or a
 * task other than the root has no parent among them within the 3 levels of a tree.
 */
export function depthsUnder(
  rootId: string,
  tasks: readonly Pick<TaskState, 'id' | 'parentId'>[],
): ReadonlyMap<string, number> {
  const parents = new Map<string, string | null>();
  for (const task of tasks) {
    if (parents.has(task.id)) {
      throw new InvalidTaskError('a task appears once in its tree');
    }
    parents.set(task.id, task.parentId);
  }
  if (!parents.has(rootId)) {
    throw new InvalidTaskError('a tree holds its root');
  }
  const depths = new Map<string, number>();
  for (const task of tasks) {
    let depth: number = 0;
    let current: string = task.id;
    while (current !== rootId) {
      const parentId: string | null | undefined = parents.get(current);
      depth += 1;
      if (parentId === null || parentId === undefined || depth >= MAX_LEVELS) {
        throw new InvalidTaskError('every task of a tree hangs from its root within 3 levels');
      }
      current = parentId;
    }
    depths.set(task.id, depth);
  }
  return depths;
}

/**
 * Function archiveHeight
 *
 * @description
 * The number of levels of an archive, the root included: 1 for a root alone, 2 with subtasks, 3
 * with sub-subtasks. Its parent takes it back only when the level of the parent plus this height
 * is 3 at most (`takesRestoredRoot`).
 *
 * @param {string} rootId - The id of the root of the archive.
 * @param {readonly Pick<TaskState, 'id' | 'parentId'>[]} members - The tasks of the archive.
 * @returns {number} The height.
 * @throws {InvalidTaskError} When the members are not a tree under the root (`depthsUnder`).
 */
export function archiveHeight(
  rootId: string,
  members: readonly Pick<TaskState, 'id' | 'parentId'>[],
): number {
  return Math.max(...depthsUnder(rootId, members).values()) + 1;
}

/**
 * Function showsParent
 *
 * @description
 * Whether a task reads with its parent (`parentKey` of `Task` and of every `TaskSummary`,
 * `parent` of the detail) or as detached: it shows its parent only when the parent is in its
 * list, so that "a subtask is always in the list of its parent" (`listId` of `Task`,
 * `openapi/public/tasks.yaml`) holds in every answer. A live task always shares the list of its
 * parent, and so does every member of an archive under the root; only the root of an archive can
 * be elsewhere, when its live parent moved since (a move carries the live subtree only, "Tasks"
 * of `openapi/public/archives.yaml`). That root reads as detached, as its restoration leaves it
 * (`takesRestoredRoot`), and the parent of another list, its key, name and status, never reaches
 * a viewer of the list of the root who may not see that list: a decision of this service beyond
 * the contract (P3b-1, PR 2). The stored link is not changed: the restoration reads it.
 *
 * @param {string} taskListId - The list of the task.
 * @param {string} parentListId - The list its parent is in now.
 * @returns {boolean} `true` when the task reads with its parent, `false` when it reads as
 * detached.
 */
export function showsParent(taskListId: string, parentListId: string): boolean {
  return taskListId === parentListId;
}

/**
 * Function takesRestoredRoot
 *
 * @description
 * Whether the parent the root of an archive had takes it back when the archive is restored, or
 * the root is detached and becomes a top-level task of its list ("Restoring any task of an archive
 * restores the whole archive, from its root, to its list ... A parent that is no longer live, or
 * can no longer take it (25 subtasks, 3 levels), detaches the restored root", "Tasks" of
 * `openapi/public/archives.yaml`; `task.unarchived.v1`, `asyncapi/task-service.yaml`). The parent
 * takes it when it is live, in the list of the root (an archived task never moves, a live parent
 * may have), with fewer than 25 live direct subtasks, and when its level plus the height of the
 * archive is 3 at most (`openapi/public/tasks.yaml:28-30`). A detachment is a decision, not a
 * refusal: the restoration goes on either way.
 *
 * @param {RestoredRootParent} parent - The parent, read under lock.
 * @param {string} rootListId - The list of the root.
 * @param {number} height - The height of the archive (`archiveHeight`).
 * @returns {boolean} `true` when the root keeps its parent, `false` when it is detached.
 * @throws {InvalidTaskError} When the level, the count or the height is impossible.
 */
export function takesRestoredRoot(
  parent: RestoredRootParent,
  rootListId: string,
  height: number,
): boolean {
  if (!Number.isInteger(parent.level) || parent.level < 1) {
    throw new InvalidTaskError('the level of a parent is a positive integer');
  }
  if (!Number.isInteger(parent.childCount) || parent.childCount < 0) {
    throw new InvalidTaskError('the subtask count of a parent is a non-negative integer');
  }
  if (!Number.isInteger(height) || height < 1) {
    throw new InvalidTaskError('the height of a subtree is a positive integer');
  }
  return (
    parent.live &&
    parent.listId === rootListId &&
    parent.childCount < MAX_DIRECT_SUBTASKS &&
    parent.level + height <= MAX_LEVELS
  );
}
