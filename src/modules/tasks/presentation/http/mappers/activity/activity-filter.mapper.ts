import type { ListListActivityInput } from '../../../../application/use-cases/queries/activity/list-list-activity/list-list-activity.input.js';
import type { ListTaskActivityInput } from '../../../../application/use-cases/queries/activity/list-task-activity/list-task-activity.input.js';

/**
 * Constant UUID
 *
 * @description
 * A UUID in its canonical text form, in either case.
 *
 * @type {RegExp}
 */
const UUID: RegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Function toKinds
 *
 * @description
 * The kinds an activity query keeps, without duplicates, `null` when the query names none: every
 * kind.
 *
 * @param {ListTaskActivityInput['kinds']} kinds - The `kind` parameter, already split.
 * @returns {ListTaskActivityInput['kinds']} The kinds, or `null` for every kind.
 */
export function toKinds(
  kinds: ListTaskActivityInput['kinds'] | undefined,
): ListTaskActivityInput['kinds'] {
  return kinds === undefined ? null : [...new Set(kinds)];
}

/**
 * Function toActorIds
 *
 * @description
 * The actors a list activity query keeps, without duplicates, `null` when the query names none:
 * every actor. An account id is the form PostgreSQL returns, so an id that is a UUID is
 * lower-cased; the id of any other actor (`task-service`, an automation, a git provider) is kept as
 * sent, since the filter matches the id of the entry whatever the type of the actor.
 *
 * @param {readonly string[] | undefined} actorIds - The `actorId` parameter, already split.
 * @returns {ListListActivityInput['actorIds']} The actors, or `null` for every actor.
 */
export function toActorIds(
  actorIds: readonly string[] | undefined,
): ListListActivityInput['actorIds'] {
  return actorIds === undefined
    ? null
    : [...new Set(actorIds.map((id: string): string => (UUID.test(id) ? id.toLowerCase() : id)))];
}
