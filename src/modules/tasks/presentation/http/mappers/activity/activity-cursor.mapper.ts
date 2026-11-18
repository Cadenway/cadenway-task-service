import type { ActivityPosition } from '../../../../application/models/activity/activity-position.model.js';
import { decodeInstantCursor, encodeInstantCursor } from '../page/page-cursor.mapper.js';
import type { InstantPosition } from '../page/page-cursor.mapper.js';

/**
 * Function toInstantPosition
 *
 * @description
 * Gives the position of an activity page the shape the generic cursor reads.
 *
 * @param {ActivityPosition | null} position - Where the next page starts, or `null`.
 * @returns {InstantPosition | null} The same position.
 */
function toInstantPosition(position: ActivityPosition | null): InstantPosition | null {
  return position === null ? null : { instant: position.occurredAt, id: position.id };
}

/**
 * Function toActivityPosition
 *
 * @description
 * Gives a decoded position the shape the use cases take.
 *
 * @param {InstantPosition | null} position - The decoded position, or `null`.
 * @returns {ActivityPosition | null} The same position.
 */
function toActivityPosition(position: InstantPosition | null): ActivityPosition | null {
  return position === null ? null : { occurredAt: position.instant, id: position.id };
}

/**
 * Function taskActivityFilters
 *
 * @description
 * What defines the collection of the activity of a task, fingerprinted into its cursor: the
 * collection, the key of the task and the kinds kept, so a cursor never continues another
 * collection. The kinds are the sorted, distinct values, so the order the caller wrote them in
 * does not change the collection.
 *
 * @param {string} taskKey - The key of the task, from the path.
 * @param {readonly string[] | null} kinds - The kinds kept, `null` for every kind.
 * @returns {object} The filters.
 */
function taskActivityFilters(
  taskKey: string,
  kinds: readonly string[] | null,
): {
  readonly collection: 'task-activity';
  readonly taskKey: string;
  readonly kind: string[] | null;
} {
  return { collection: 'task-activity', taskKey, kind: sortedDistinct(kinds) };
}

/**
 * Function listActivityFilters
 *
 * @description
 * What defines the collection of the activity of a list, fingerprinted into its cursor: the
 * collection, the list (lower-cased, since the path accepts a UUID in either case), the kinds and
 * the actors kept.
 *
 * @param {string} listId - The list of the path.
 * @param {readonly string[] | null} kinds - The kinds kept, `null` for every kind.
 * @param {readonly string[] | null} actorIds - The actors kept, `null` for every actor.
 * @returns {object} The filters.
 */
function listActivityFilters(
  listId: string,
  kinds: readonly string[] | null,
  actorIds: readonly string[] | null,
): {
  readonly collection: 'list-activity';
  readonly listId: string;
  readonly kind: string[] | null;
  readonly actorId: string[] | null;
} {
  return {
    collection: 'list-activity',
    listId: listId.toLowerCase(),
    kind: sortedDistinct(kinds),
    actorId: sortedDistinct(actorIds),
  };
}

/**
 * Function sortedDistinct
 *
 * @description
 * The distinct values of a filter in a fixed order, `null` for no filter.
 *
 * @param {readonly string[] | null} values - The values as the caller wrote them.
 * @returns {string[] | null} The distinct values, sorted.
 */
function sortedDistinct(values: readonly string[] | null): string[] | null {
  return values === null ? null : [...new Set(values)].sort();
}

/**
 * Function toTaskActivityCursor
 *
 * @description
 * Encodes where the next page of the activity of a task starts as the opaque cursor of the kit.
 *
 * @param {ActivityPosition | null} position - Where the next page starts, or `null`.
 * @param {string} taskKey - The key of the task, from the path.
 * @param {readonly string[] | null} kinds - The kinds kept, `null` for every kind.
 * @returns {string | null} The cursor, or `null` on the last page.
 */
export function toTaskActivityCursor(
  position: ActivityPosition | null,
  taskKey: string,
  kinds: readonly string[] | null,
): string | null {
  return encodeInstantCursor(toInstantPosition(position), taskActivityFilters(taskKey, kinds));
}

/**
 * Function toTaskActivityPosition
 *
 * @description
 * Decodes the cursor of a previous page of the activity of a task, with the same kinds.
 *
 * @param {string | undefined} cursor - The `cursor` query parameter.
 * @param {string} taskKey - The key of the task, from the path.
 * @param {readonly string[] | null} kinds - The kinds kept, `null` for every kind.
 * @returns {ActivityPosition | null} Where the page starts, or `null` for the first page.
 * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this
 * collection.
 */
export function toTaskActivityPosition(
  cursor: string | undefined,
  taskKey: string,
  kinds: readonly string[] | null,
): ActivityPosition | null {
  return toActivityPosition(decodeInstantCursor(cursor, taskActivityFilters(taskKey, kinds)));
}

/**
 * Function toListActivityCursor
 *
 * @description
 * Encodes where the next page of the activity of a list starts as the opaque cursor of the kit.
 *
 * @param {ActivityPosition | null} position - Where the next page starts, or `null`.
 * @param {string} listId - The list of the path.
 * @param {readonly string[] | null} kinds - The kinds kept, `null` for every kind.
 * @param {readonly string[] | null} actorIds - The actors kept, `null` for every actor.
 * @returns {string | null} The cursor, or `null` on the last page.
 */
export function toListActivityCursor(
  position: ActivityPosition | null,
  listId: string,
  kinds: readonly string[] | null,
  actorIds: readonly string[] | null,
): string | null {
  return encodeInstantCursor(
    toInstantPosition(position),
    listActivityFilters(listId, kinds, actorIds),
  );
}

/**
 * Function toListActivityPosition
 *
 * @description
 * Decodes the cursor of a previous page of the activity of a list, with the same filters.
 *
 * @param {string | undefined} cursor - The `cursor` query parameter.
 * @param {string} listId - The list of the path.
 * @param {readonly string[] | null} kinds - The kinds kept, `null` for every kind.
 * @param {readonly string[] | null} actorIds - The actors kept, `null` for every actor.
 * @returns {ActivityPosition | null} Where the page starts, or `null` for the first page.
 * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this
 * collection.
 */
export function toListActivityPosition(
  cursor: string | undefined,
  listId: string,
  kinds: readonly string[] | null,
  actorIds: readonly string[] | null,
): ActivityPosition | null {
  return toActivityPosition(
    decodeInstantCursor(cursor, listActivityFilters(listId, kinds, actorIds)),
  );
}
