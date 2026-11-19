import type { TaskReferenceView } from './task-reference.projection.js';

/**
 * Interface TaskReferenceInListView
 *
 * @description
 * A task named by another resource (`TaskRef`: its key, name and status as they are now), with
 * the list it is in now, so that a reader can tell whether a task shows it as its parent
 * (`showsParent`). The list never leaves the service: the mappers of `TaskRef` drop it.
 */
export interface TaskReferenceInListView extends TaskReferenceView {
  // #region Properties
  /** The list the task is in now. */
  readonly listId: string;
  // #endregion
}
