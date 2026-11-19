import type { ActivityKind } from '../../../domain/value-objects/activity/activity-kind.value-object.js';

/**
 * Interface ListActivityFilter
 *
 * @description
 * What the activity of a list is read with: the list, the lists the actor has a role on and the
 * optional filters of the route.
 */
export interface ListActivityFilter {
  // #region Properties
  /** The list whose entries are read (the list the task was in when the change was made). */
  readonly listId: string;

  /** The lists the actor has a role on: only entries of tasks that are now in one of them are kept. */
  readonly listIds: readonly string[];

  /** The kinds to keep, `null` for every kind. */
  readonly kinds: readonly ActivityKind[] | null;

  /** The ids of the actors to keep, whatever their type, `null` for every actor. */
  readonly actorIds: readonly string[] | null;
  // #endregion
}
