import type { AccessRequestRefusalReason } from './access-request-refusal-reason.model.js';

/**
 * Class AccessRequestRefusal
 *
 * @description
 * Thrown by a use case of the access-requests module to refuse a request; it rolls back the
 * transaction it is thrown in, so a refused approval leaves no grant and a refused attempt counts
 * for nothing. `refusal` says why, without quoting any value the caller did not send.
 */
export class AccessRequestRefusal extends Error {
  // #region Properties
  /**
   * Property refusal
   *
   * @description
   * Why the request is refused.
   *
   * @type {AccessRequestRefusalReason}
   * @readonly
   */
  public readonly refusal: AccessRequestRefusalReason;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Names the refusal after its reason.
   *
   * @param {AccessRequestRefusalReason} refusal - Why the request is refused.
   * @constructor
   */
  public constructor(refusal: AccessRequestRefusalReason) {
    super(`The request was refused: ${refusal.reason}.`);
    this.name = 'AccessRequestRefusal';
    this.refusal = refusal;
  }
  // #endregion
}
