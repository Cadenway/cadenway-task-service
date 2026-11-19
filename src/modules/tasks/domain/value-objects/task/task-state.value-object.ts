import type { ChecklistItemState } from './checklist-item-state.value-object.js';
import type { TaskArchive } from './task-archive.value-object.js';
import type { TaskDraft } from './task-draft.value-object.js';
import type { TaskKey } from './task-key.value-object.js';
import type { TaskTrash } from './task-trash.value-object.js';

/**
 * Interface TaskState
 *
 * @description
 * A stored task (`Task` of `openapi/internal/task-service.yaml:2135-2259`): the members of its
 * draft, its key, its checklist, what PostgreSQL assigned, and the version shared by the task, its
 * assignees, its labels and its checklist. The read model adds `subtaskCounts` and
 * `checklistCounts`, which are not stored.
 */
export interface TaskState extends TaskDraft {
  // #region Properties
  /**
   * Property id
   *
   * @description
   * Id of the task, never shown outside task-service.
   *
   * @type {string}
   * @readonly
   */
  readonly id: string;

  /**
   * Property key
   *
   * @description
   * Key of the task, as `CAD-482`; it never changes.
   *
   * @type {TaskKey}
   * @readonly
   */
  readonly key: TaskKey;

  /**
   * Property checklist
   *
   * @description
   * "Checklist", 100 items at most, in increasing `position`, the order of addition.
   *
   * @type {readonly ChecklistItemState[]}
   * @readonly
   */
  readonly checklist: readonly ChecklistItemState[];

  /**
   * Property createdAt
   *
   * @description
   * When the task was created.
   *
   * @type {Date}
   * @readonly
   */
  readonly createdAt: Date;

  /**
   * Property updatedAt
   *
   * @description
   * When the task last changed, its assignees, labels and checklist included
   * (`openapi/internal/task-service.yaml:2250-2253`).
   *
   * @type {Date}
   * @readonly
   */
  readonly updatedAt: Date;

  /**
   * Property version
   *
   * @description
   * Version of the task, a positive integer: 1 at its creation, one more at each committed change
   * that changes something, a change of its assignees, labels or checklist included; also sent as
   * `ETag` (`openapi/internal/task-service.yaml:2254-2259`).
   *
   * @type {number}
   * @readonly
   */
  readonly version: number;

  /**
   * Property archive
   *
   * @description
   * The archive the task belongs to, `null` for a live task (`archivedAt` and `archivedBy`,
   * `openapi/internal/task-service.yaml`; "Tasks" of `openapi/public/archives.yaml`). An archived
   * task never changes until its archive is restored, but for the removal of a member from its
   * assignees.
   *
   * @type {TaskArchive | null}
   * @readonly
   */
  readonly archive: TaskArchive | null;

  /**
   * Property trash
   *
   * @description
   * The trash entry the task belongs to, `null` for a task that is not in the trash
   * (`openapi/public/trash.yaml`). A task in the trash is never archived: an archived task leaves
   * its archive when its list goes to the trash (`task.trashed.v1`). It never changes until its
   * entry is restored, but for the removal of a member from its assignees.
   *
   * @type {TaskTrash | null}
   * @readonly
   */
  readonly trash: TaskTrash | null;
  // #endregion
}
