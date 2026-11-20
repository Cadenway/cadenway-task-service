import type { TaskReferenceView } from './task-reference.projection.js';

/**
 * Interface TaskReferenceInListView
 *
 * @description
 * A task named by another resource (`TaskRef`: its key, name and status as they are now), with
 * the list it is in now and whether it is in the trash, so that a reader can tell whether a task
 * shows it as its parent (`showsParent`). The list and the trash never leave the service: the
 * mappers of `TaskRef` drop them.
 */
export interface TaskReferenceInListView extends TaskReferenceView {
  // #region Properties
  /** The list the task is in now. */
  readonly listId: string;

  /** Whether the task is in the trash now. */
  readonly inTrash: boolean;
  // #endregion
}
