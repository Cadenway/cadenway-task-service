import type { ActivityKind } from '../../../../../domain/value-objects/activity/activity-kind.value-object.js';
import type { ActivityPosition } from '../../../../models/activity/activity-position.model.js';

/**
 * Interface ListTaskActivityInput
 *
 * @description
 * A page of the activity of a task.
 */
export interface ListTaskActivityInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;

  /** The key of the task. */
  readonly taskKey: string;

  /** The kinds to keep, `null` for every kind. */
  readonly kinds: readonly ActivityKind[] | null;

  /** The last entry of the previous page, `null` for the first page. */
  readonly after: ActivityPosition | null;

  /** The size of the page, 1 to 100. */
  readonly limit: number;
  // #endregion
}
