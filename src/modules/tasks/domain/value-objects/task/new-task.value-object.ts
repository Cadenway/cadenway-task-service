import type { AssigneeCandidate } from '../member/assignee-candidate.value-object.js';
import type { SubtaskParent } from '../subtask/subtask-parent.value-object.js';
import type { CancelReason } from './cancel-reason.value-object.js';
import type { PriorityKey } from './priority-key.value-object.js';
import type { Recurrence } from './recurrence.value-object.js';
import type { StatusKey } from './status-key.value-object.js';
import type { TaskActor } from './task-actor.value-object.js';
import type { TaskPlacement } from './task-placement.value-object.js';

/**
 * Interface NewTask
 *
 * @description
 * What a creation of a task or a subtask asks for (`TaskCreation` and `SubtaskCreation` of
 * `openapi/internal/task-service.yaml:2375-2529`), before checks and normalization. The members
 * with a default in the contract (`status` `todo`, `priority` `moyenne`, empty `labels`) arrive with
 * their value: the presentation applies the defaults. The application resolves the list, the
 * parent and the role of each assignee first. A subtask given at the creation of its parent
 * arrives with the status `todo`, the priority `moyenne` and the first assignee of the parent
 * (`openapi/public/tasks.yaml:106-109`); a subtask created alone without `assigneeIds` with the
 * first assignee of its parent, or none when that person can no longer be assigned (open question
 * 6 of the design).
 */
export interface NewTask {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * Organization of the request.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property placement
   *
   * @description
   * The list the caller sees and its space; for a subtask, the list of the parent.
   *
   * @type {TaskPlacement}
   * @readonly
   */
  readonly placement: TaskPlacement;

  /**
   * Property parent
   *
   * @description
   * The parent of a subtask, read under lock; `null` for a top-level task.
   *
   * @type {SubtaskParent | null}
   * @readonly
   */
  readonly parent: SubtaskParent | null;

  /**
   * Property name
   *
   * @description
   * "Nom de la tâche", as typed.
   *
   * @type {string}
   * @readonly
   */
  readonly name: string;

  /**
   * Property description
   *
   * @description
   * "Description", as sent; `null` for none.
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
   * "Motif d’annulation"; required with `cancelled`, refused with any other status; `null` for none.
   *
   * @type {CancelReason | null}
   * @readonly
   */
  readonly cancelReason: CancelReason | null;

  /**
   * Property cancelNote
   *
   * @description
   * "Précision (facultatif)", as typed; only with `cancelled`; `null` for none.
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
   * Property assignees
   *
   * @description
   * Accounts to assign with their role in the copy, in the order sent; the same account twice
   * counts once.
   *
   * @type {readonly AssigneeCandidate[]}
   * @readonly
   */
  readonly assignees: readonly AssigneeCandidate[];

  /**
   * Property dueDate
   *
   * @description
   * "Échéance"; `null` for none.
   *
   * @type {string | null}
   * @readonly
   */
  readonly dueDate: string | null;

  /**
   * Property startDate
   *
   * @description
   * First day of the work; needs a due date, on or before it. A milestone takes its due date
   * as the start when omitted, and an explicit start must agree with the due date.
   *
   * @type {string | null | undefined}
   * @readonly
   */
  readonly startDate?: string | null;

  /**
   * Property estimateMinutes
   *
   * @description
   * "Estimation" in whole minutes; `null` for none.
   *
   * @type {number | null}
   * @readonly
   */
  readonly estimateMinutes: number | null;

  /** When true, apply the milestone workflow and schedule (P3b-2 decision 11). */
  readonly milestone?: boolean;

  /** The cadence of the new task, defaulting to `none` (P3b-2 decision 13). */
  readonly recurrence?: Recurrence;

  /** Internal calendar anchor carried from a predecessor onto its monthly successor. */
  readonly monthlyAnchorDay?: number | null;

  /**
   * Property labels
   *
   * @description
   * "Étiquettes", as typed; a label that repeats another without regard to case is ignored.
   *
   * @type {readonly string[]}
   * @readonly
   */
  readonly labels: readonly string[];

  /**
   * Property createdBy
   *
   * @description
   * Who creates the task.
   *
   * @type {TaskActor}
   * @readonly
   */
  readonly createdBy: TaskActor;
  // #endregion
}
