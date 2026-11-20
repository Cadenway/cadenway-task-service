import { LIST_ACTOR_TYPES } from '../../../../../domain/value-objects/list/list-actor.value-object.js';
import type { ListActor } from '../../../../../domain/value-objects/list/list-actor.value-object.js';

/**
 * Function toStoredActor
 *
 * @description
 * Reads an actor stored as two columns (`archived_by_*` of a list, `deleted_by_*` of a list or a
 * space): `null` when either column is null, which the domain refuses unless its instant is null
 * too (the checks of the tables keep the three together).
 *
 * @param {string | null} type - The stored type.
 * @param {string | null} id - The stored id.
 * @returns {ListActor | null} The actor, or `null`.
 * @throws {Error} When the stored type is not one of `Actor`.
 */
export function toStoredActor(type: string | null, id: string | null): ListActor | null {
  if (type === null || id === null) {
    return null;
  }
  const known: ListActor['type'] | undefined = LIST_ACTOR_TYPES.find(
    (candidate: ListActor['type']): boolean => candidate === type,
  );
  if (known === undefined) {
    throw new Error('A stored actor type is not user, automation, git or system.');
  }
  return { type: known, id };
}
