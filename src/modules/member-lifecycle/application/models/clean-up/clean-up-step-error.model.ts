import type { CleanUpStep } from './clean-up-step.model.js';

/**
 * Function messageOf
 *
 * @description
 * The message of the cause of a failed batch, for the message of the error that wraps it.
 *
 * @param {unknown} cause - What the batch rejected with.
 * @returns {string} Its message, or its text.
 */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Class CleanUpStepError
 *
 * @description
 * A batch of the clean-up after a removed member that failed (the database, a lock or statement
 * timeout, a defect), with the step it belongs to and the batches the attempt committed before it,
 * so that the one log line of the kit for the failed attempt and the span of the job say where the
 * job stopped and what it had done: "grants batch failed after 2 committed batches: <cause>". The
 * failed batch rolled back alone; the original error is the `cause`.
 */
export class CleanUpStepError extends Error {
  // #region Properties
  /**
   * Property step
   *
   * @description
   * The step whose batch failed.
   *
   * @type {CleanUpStep}
   * @readonly
   */
  public readonly step: CleanUpStep;

  /**
   * Property batches
   *
   * @description
   * The batches the attempt committed before the failed one, of every step.
   *
   * @type {number}
   * @readonly
   */
  public readonly batches: number;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Wraps the failure of a batch.
   *
   * @param {CleanUpStep} step - The step whose batch failed.
   * @param {number} batches - The batches committed before it.
   * @param {unknown} cause - What the batch rejected with.
   * @constructor
   */
  public constructor(step: CleanUpStep, batches: number, cause: unknown) {
    super(`${step} batch failed after ${String(batches)} committed batches: ${messageOf(cause)}`, {
      cause,
    });
    this.name = 'CleanUpStepError';
    this.step = step;
    this.batches = batches;
  }
  // #endregion
}
