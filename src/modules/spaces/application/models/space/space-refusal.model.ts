import type { SpaceRefusalReason } from './space-refusal-reason.model.js';

/**
 * Class SpaceRefusal
 *
 * @description
 * Thrown by a use case of the spaces module to refuse a request; it rolls back the transaction it
 * is thrown in. `refusal` says why, without quoting any value the caller did not send.
 */
export class SpaceRefusal extends Error {
  // #region Properties
  /**
   * Property refusal
   *
   * @description
   * Why the request is refused.
   *
   * @type {SpaceRefusalReason}
   * @readonly
   */
  public readonly refusal: SpaceRefusalReason;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Names the refusal after its reason.
   *
   * @param {SpaceRefusalReason} refusal - Why the request is refused.
   * @constructor
   */
  public constructor(refusal: SpaceRefusalReason) {
    super(`The request was refused: ${refusal.reason}.`);
    this.name = 'SpaceRefusal';
    this.refusal = refusal;
  }
  // #endregion
}
