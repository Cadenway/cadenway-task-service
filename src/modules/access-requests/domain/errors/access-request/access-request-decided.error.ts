import { DomainError } from './domain.error.js';

/**
 * Class AccessRequestDecidedError
 *
 * @description
 * A second answer to a request for access: a request changes once, from `pending` to `approved` or
 * `refused` ("A request someone answered meanwhile answers `409 access-request.already-decided`" of
 * `openapi/public/access.yaml`, with `details.state`). It carries how the request was answered.
 */
export class AccessRequestDecidedError extends DomainError {
  // #region Properties
  /**
   * Property status
   *
   * @description
   * How the request was answered first.
   *
   * @type {'approved' | 'refused'}
   * @readonly
   */
  public readonly status: 'approved' | 'refused';
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Refuses the answer with the current status of the request.
   *
   * @param {'approved' | 'refused'} status - How the request was answered first.
   * @constructor
   */
  public constructor(status: 'approved' | 'refused') {
    super('The access request was already answered.');
    this.status = status;
  }
  // #endregion
}
