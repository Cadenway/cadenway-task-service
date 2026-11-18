import type { PagePosition } from '../../../../application/models/page/page-position.model.js';
import { toCursor, toPosition } from '../page/page-cursor.mapper.js';

/**
 * Function subtasksFilters
 *
 * @description
 * What defines the collection of the subtasks of a task, fingerprinted into its cursor: the
 * collection and the key of the parent, so a cursor of one task never continues another. The key
 * is already in the upper-case form the path accepts.
 *
 * @param {string} taskKey - The key of the parent, from the path.
 * @returns {{ readonly collection: 'subtasks'; readonly taskKey: string }} The filters.
 */
function subtasksFilters(taskKey: string): {
  readonly collection: 'subtasks';
  readonly taskKey: string;
} {
  return { collection: 'subtasks', taskKey };
}

/**
 * Function toSubtasksCursor
 *
 * @description
 * Encodes where the next page of the subtasks of a task starts as the opaque cursor of the kit.
 *
 * @param {PagePosition | null} position - Where the next page starts, or `null`.
 * @param {string} taskKey - The key of the parent, from the path.
 * @returns {string | null} The cursor, or `null` on the last page.
 */
export function toSubtasksCursor(position: PagePosition | null, taskKey: string): string | null {
  return toCursor(position, subtasksFilters(taskKey));
}

/**
 * Function toSubtasksPosition
 *
 * @description
 * Decodes the cursor of a previous page of the subtasks of a task.
 *
 * @param {string | undefined} cursor - The `cursor` query parameter.
 * @param {string} taskKey - The key of the parent, from the path.
 * @returns {PagePosition | null} Where the page starts, or `null` for the first page.
 * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this task.
 */
export function toSubtasksPosition(
  cursor: string | undefined,
  taskKey: string,
): PagePosition | null {
  return toPosition(cursor, subtasksFilters(taskKey));
}
