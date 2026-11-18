import type { TaskRefusalReason } from './task-refusal-reason.model.js';

/**
 * Class TaskRefusal
 *
 * @description
 * Thrown by a use case of the tasks module to refuse a request; it rolls back the transaction it
 * is thrown in. `refusal` says why, without quoting any value the caller did not send.
 */
export class TaskRefusal extends Error {
  // #region Properties
  /** Why the request is refused. */
  public readonly refusal: TaskRefusalReason;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Names the refusal after its reason.
   *
   * @param {TaskRefusalReason} refusal - Why the request is refused.
   * @constructor
   */
  public constructor(refusal: TaskRefusalReason) {
    super(`The request was refused: ${refusal.reason}.`);
    this.name = 'TaskRefusal';
    this.refusal = refusal;
  }
  // #endregion
}
