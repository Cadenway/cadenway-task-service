import type { StatusKey } from '../../../domain/value-objects/task/status-key.value-object.js';

/**
 * Interface TaskReferenceView
 *
 * @description
 * A task named by another resource, with its name and status as they are now (`TaskRef`).
 */
export interface TaskReferenceView {
  // #region Properties
  /** The key, as `CAD-482`. */
  readonly key: string;

  /** Name of the task. */
  readonly name: string;

  /** Status of the task. */
  readonly status: StatusKey;
  // #endregion
}
