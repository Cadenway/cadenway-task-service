import type { CancelReason } from './cancel-reason.value-object.js';
import type { PriorityKey } from './priority-key.value-object.js';
import type { StatusKey } from './status-key.value-object.js';
import type { TaskActor } from './task-actor.value-object.js';
import type { TaskKey } from './task-key.value-object.js';

/**
 * Interface TaskDraft
 *
 * @description
 * A checked and normalized new task, what a repository inserts once the spaces module allocated
 * its key: PostgreSQL assigns its `id`, `createdAt` and `updatedAt` (the transaction instant), its
 * version starts at 1 and its checklist is empty. Every member already satisfies the invariants
 * of `Task` (`openapi/internal/task-service.yaml:2135-2259`).
 */
export interface TaskDraft {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * Organization of the task, the organization of the request.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property spaceId
   *
   * @description
   * Space of the list of the task.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceId: string;

  /**
   * Property listId
   *
   * @description
   * List of the task; for a subtask, the list of its parent.
   *
   * @type {string}
   * @readonly
   */
  readonly listId: string;

  /**
   * Property parentId
   *
   * @description
   * Id of the parent of a subtask; `null` for a top-level task.
   *
   * @type {string | null}
   * @readonly
   */
  readonly parentId: string | null;

  /**
   * Property parentKey
   *
   * @description
   * Key of that parent; `null` exactly when `parentId` is.
   *
   * @type {TaskKey | null}
   * @readonly
   */
  readonly parentKey: TaskKey | null;

  /**
   * Property name
   *
   * @description
   * "Nom de la tâche", trimmed, 1 to 300 characters.
   *
   * @type {string}
   * @readonly
   */
  readonly name: string;

  /**
   * Property description
   *
   * @description
   * "Description", Markdown stored as sent, 50,000 characters at most; `null` when there is none.
   *
   * @type {string | null}
   * @readonly
   */
  readonly description: string | null;

  /**
   * Property status
   *
   * @description
   * "Statut".
   *
   * @type {StatusKey}
   * @readonly
   */
  readonly status: StatusKey;

  /**
   * Property cancelReason
   *
   * @description
   * "Motif d’annulation"; not `null` exactly when the status is `cancelled`.
   *
   * @type {CancelReason | null}
   * @readonly
   */
  readonly cancelReason: CancelReason | null;

  /**
   * Property cancelNote
   *
   * @description
   * "Précision" of the cancellation, trimmed, 1 to 500 characters; `null` when there is none, and
   * always `null` unless the status is `cancelled`.
   *
   * @type {string | null}
   * @readonly
   */
  readonly cancelNote: string | null;

  /**
   * Property priority
   *
   * @description
   * "Priorité".
   *
   * @type {PriorityKey}
   * @readonly
   */
  readonly priority: PriorityKey;

  /**
   * Property assigneeIds
   *
   * @description
   * "Assignés", 20 distinct accounts at most, in the order they were assigned.
   *
   * @type {readonly string[]}
   * @readonly
   */
  readonly assigneeIds: readonly string[];

  /**
   * Property labels
   *
   * @description
   * "Étiquettes", 20 at most, each trimmed with 1 to 32 characters, distinct by `labelKey`, in the
   * order they were added and in their first spelling.
   *
   * @type {readonly string[]}
   * @readonly
   */
  readonly labels: readonly string[];

  /**
   * Property dueDate
   *
   * @description
   * "Échéance", a calendar date `YYYY-MM-DD` from 0001-01-01; `null` when there is none.
   *
   * @type {string | null}
   * @readonly
   */
  readonly dueDate: string | null;

  /**
   * Property startDate
   *
   * @description
   * First day of the work, a calendar date on or before `dueDate`; always `null` without a due
   * date.
   *
   * @type {string | null}
   * @readonly
   */
  readonly startDate: string | null;

  /**
   * Property estimateMinutes
   *
   * @description
   * "Estimation", whole minutes from 1 to 60,000; `null` when there is none.
   *
   * @type {number | null}
   * @readonly
   */
  readonly estimateMinutes: number | null;

  /**
   * Property completedAt
   *
   * @description
   * When the task last entered `done`; not `null` exactly when the status is `done`.
   *
   * @type {Date | null}
   * @readonly
   */
  readonly completedAt: Date | null;

  /**
   * Property createdBy
   *
   * @description
   * Who created the task.
   *
   * @type {TaskActor}
   * @readonly
   */
  readonly createdBy: TaskActor;
  // #endregion
}
