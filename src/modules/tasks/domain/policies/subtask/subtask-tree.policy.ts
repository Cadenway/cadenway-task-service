import { ParentInvalidError } from '../../errors/subtask/parent-invalid.error.js';
import { SubtaskDepthExceededError } from '../../errors/subtask/subtask-depth-exceeded.error.js';
import { SubtaskLimitReachedError } from '../../errors/subtask/subtask-limit-reached.error.js';
import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { ListInvalidError } from '../../errors/task/list-invalid.error.js';
import type { SubtaskParent } from '../../value-objects/subtask/subtask-parent.value-object.js';
import type { TaskAttachment } from '../../value-objects/subtask/task-attachment.value-object.js';
import type { TaskKey } from '../../value-objects/task/task-key.value-object.js';
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
