import type { TaskActor } from '../task/task-actor.value-object.js';
import type { ActivityChange } from './activity-change.value-object.js';

/**
 * Interface ActivityEntryDraft
 *
 * @description
 * A new activity entry, what a repository inserts: PostgreSQL assigns its `id`. The `task`
 * reference of `ActivityEntry` (key, name and status as they are now) is joined at read time
 * (`openapi/internal/task-service.yaml:2622-2721`).
 */
export interface ActivityEntryDraft {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * Organization of the task.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property taskId
   *
   * @description
   * Id of the task the entry is about.
   *
   * @type {string}
   * @readonly
   */
  readonly taskId: string;

  /**
   * Property listId
   *
   * @description
   * The list the task was in when the change was made: the list after the change, for a change
   * made with a move (`openapi/internal/task-service.yaml:2663-2668`; open question 3 of the design).
   *
   * @type {string}
   * @readonly
   */
  readonly listId: string;

  /**
   * Property actor
   *
   * @description
   * Who made the change.
   *
   * @type {TaskActor}
   * @readonly
   */
  readonly actor: TaskActor;

  /**
   * Property occurredAt
   *
   * @description
   * When the change was made, the instant of its transaction; for merged changes, the last of them
   * (`openapi/internal/task-service.yaml:2641-2644`).
   *
   * @type {Date}
   * @readonly
   */
  readonly occurredAt: Date;

  /**
   * Property change
   *
   * @description
   * The kind of the entry and its member.
   *
   * @type {ActivityChange}
   * @readonly
   */
  readonly change: ActivityChange;
  // #endregion
}
