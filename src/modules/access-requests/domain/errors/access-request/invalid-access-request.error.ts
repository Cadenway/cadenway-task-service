import { DomainError } from './domain.error.js';

/**
 * Class InvalidAccessRequestError
 *
 * @description
 * A new or stored request for access that breaks an invariant of `AccessRequest` or
 * `AccessRequestCreation` of `openapi/internal/task-service.yaml`: for a request, what the contract
 * answers with `400 request.invalid` (the validators of the contract refuse it first); for a stored
 * state, a defect of the data.
 */
export class InvalidAccessRequestError extends DomainError {
  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Names the broken invariant.
   *
   * @param {string} invariant - Which invariant the request breaks, without any value.
   * @constructor
   */
  public constructor(invariant: string) {
    super(`The access request breaks an invariant: ${invariant}.`);
  }
  // #endregion
}
