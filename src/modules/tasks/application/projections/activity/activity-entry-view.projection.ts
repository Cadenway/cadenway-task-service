import type { ActivityKind } from '../../../domain/value-objects/activity/activity-kind.value-object.js';
import type { TaskActor } from '../../../domain/value-objects/task/task-actor.value-object.js';
import type { ActivityChange } from '../../../domain/value-objects/activity/activity-change.value-object.js';
import type { TaskReferenceView } from '../task/task-reference.projection.js';

/**
 * Interface ActivityEntryView
 *
 * @description
 * One entry of an activity log with the task it is about, as that task is now.
 */
export interface ActivityEntryView {
  // #region Properties
  /** Id of the entry. */
  readonly id: string;

  /** When the change was made; for merged changes, the last of them. */
  readonly occurredAt: Date;

  /** What kind of change. */
  readonly kind: ActivityKind;

  /** Who made it. */
  readonly actor: TaskActor;

  /** The task, with its name and status as they are now. */
  readonly task: TaskReferenceView;

  /** The list the task was in when the change was made. */
  readonly listId: string;

  /** The detail of the kind. */
  readonly change: ActivityChange;
  // #endregion
}
