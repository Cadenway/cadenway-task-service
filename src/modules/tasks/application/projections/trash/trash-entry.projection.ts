import type { TaskActor } from '../../../domain/value-objects/task/task-actor.value-object.js';
import type { ListRefView } from '../archive/list-ref.projection.js';
import type { TaskReferenceView } from '../task/task-reference.projection.js';

/**
 * Interface TrashEntryView
 *
 * @description
 * One element of the trash (`TrashEntry` of `openapi/internal/task-service.yaml`): a task and its
 * subtasks at every level, deleted together, with the list it comes back to, who deleted it and
 * when, and when it is erased.
 */
export interface TrashEntryView {
  // #region Properties
  /** Id of the entry. */
  readonly id: string;

  /** The root, with its name and status. */
  readonly task: TaskReferenceView;

  /** The parent the root had when it was deleted ("Sous-tâche de CAD-482"), `null` for none. */
  readonly parentKey: string | null;

  /** The subtasks deleted with it, at every level ("Avec 3 sous-tâches"). */
  readonly subtaskCount: number;

  /** The list the entry comes back to, `deleted` for "Liste supprimée". */
  readonly list: ListRefView;

  /** When it was deleted ("Supprimée il y a 2 jours"). */
  readonly trashedAt: Date;

  /** Who deleted it. */
  readonly trashedBy: TaskActor;

  /** When it is erased for good, 30 days after `trashedAt`. */
  readonly purgeAt: Date;
  // #endregion
}
