import type { TaskActor } from '../../../domain/value-objects/task/task-actor.value-object.js';

/**
 * Type HeldList
 *
 * @description
 * A list the spaces module holds `FOR SHARE` until the commit (`HoldList`): `live`; `deleted`
 * when the list or its space is deleted, with who deleted the list; `not-found` for a list erased
 * or unknown. A deletion of the list waits for the commit of the holder, or committed before and
 * is seen here.
 */
export type HeldList =
  | { readonly outcome: 'live' }
  | { readonly outcome: 'deleted'; readonly deletedBy: TaskActor }
  | { readonly outcome: 'not-found' };
