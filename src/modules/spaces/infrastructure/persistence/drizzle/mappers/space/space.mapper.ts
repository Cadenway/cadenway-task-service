import { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { SpaceStatus } from '../../../../../domain/value-objects/status/space-status.value-object.js';
import type { SpaceStatuses } from '../../../../../domain/value-objects/status/space-statuses.value-object.js';
import type { StatusKey } from '../../../../../domain/value-objects/status/status-key.value-object.js';
import { STATUS_KEYS } from '../../../../../domain/value-objects/status/status-key.value-object.js';
import type { Visibility } from '../../../../../domain/value-objects/space/visibility.value-object.js';
import type { spaces } from '../../schemas/space/space.schema.js';
import { toLookColor, toLookIcon } from '../look/look.mapper.js';

/**
 * Type SpaceRow
 *
 * @description
 * A row of `spaces`.
 *
 * @type {typeof spaces.$inferSelect}
 */
export type SpaceRow = typeof spaces.$inferSelect;

/**
 * Function isRecord
 *
 * @description
 * Whether a parsed JSON value is an object that is neither `null` nor an array.
 *
 * @param {unknown} value - The value.
 * @returns {boolean} `true` for a plain record.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Function toSpaceStatus
 *
 * @description
 * Reads one stored status. A member of the wrong type falls back to its default (`null` name,
 * not hidden) instead of reaching the domain, so a stored row is never trusted blindly; the
 * domain still validates the name when it restores the space.
 *
 * @param {unknown} value - The stored `{ name, hidden }`, or anything else.
 * @returns {SpaceStatus} The status.
 */
function toSpaceStatus(value: unknown): SpaceStatus {
  if (!isRecord(value)) {
    return { name: null, hidden: false };
  }
  const name: unknown = value.name;
  const hidden: unknown = value.hidden;
  return {
    name: typeof name === 'string' ? name : null,
    hidden: hidden === true,
  };
}

/**
 * Function toSpaceStatuses
 *
 * @description
 * Parses the `statuses` column into the ten statuses by key. A key missing from the stored
 * object, for example one a later release adds, takes the default status; unknown keys are
 * dropped.
 *
 * @param {unknown} stored - The parsed `jsonb` value.
 * @returns {SpaceStatuses} Every status key, always present.
 */
export function toSpaceStatuses(stored: unknown): SpaceStatuses {
  const source: Readonly<Record<string, unknown>> = isRecord(stored) ? stored : {};
  const entries: [StatusKey, SpaceStatus][] = STATUS_KEYS.map(
    (key: StatusKey): [StatusKey, SpaceStatus] => [key, toSpaceStatus(source[key])],
  );
  // `Object.fromEntries` types its result loosely; the entries cover every `StatusKey` above.
  return Object.fromEntries(entries) as Record<StatusKey, SpaceStatus>;
}

/**
 * Function toVisibility
 *
 * @description
 * Narrows the stored visibility; the `CHECK` constraint of the table admits two values only.
 *
 * @param {string} value - The stored visibility.
 * @returns {Visibility} The visibility.
 * @throws {Error} When the value is neither `organization` nor `private`.
 */
export function toVisibility(value: string): Visibility {
  if (value === 'organization' || value === 'private') {
    return value;
  }
  throw new Error('A stored visibility is neither organization nor private.');
}

/**
 * Function toSpace
 *
 * @description
 * Maps a row to the space it stores. The statuses are parsed and completed, and the color, icon
 * and visibility narrowed, before the domain restores the aggregate.
 *
 * @param {SpaceRow} row - The row.
 * @returns {Space} The space.
 * @throws {Error} When the color, icon or visibility is outside its set.
 */
export function toSpace(row: SpaceRow): Space {
  return Space.restore({
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    prefix: row.prefix,
    description: row.description,
    icon: toLookIcon(row.icon),
    color: toLookColor(row.color),
    visibility: toVisibility(row.visibility),
    ownerUserId: row.ownerUserId,
    awaitingOwner: row.awaitingOwner,
    statuses: toSpaceStatuses(row.statuses),
    createdAt: row.createdAt,
    version: row.version,
  });
}
