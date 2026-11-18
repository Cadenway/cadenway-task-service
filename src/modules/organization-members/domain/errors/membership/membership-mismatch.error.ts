import { DomainError } from './domain.error.js';

/**
 * Class MembershipMismatchError
 *
 * @description
 * An event of a membership that names another organization or another account than the copy
 * holds. A membership never moves, an assumption of this module that the contract implies without
 * stating it (each membership has its own `memberId`, and a person who joins again gets a new one),
 * so the event is a defect of its producer and is never applied.
 */
export class MembershipMismatchError extends DomainError {
  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Refuses the event without quoting its ids.
   *
   * @constructor
   */
  public constructor() {
    super('The event names another organization or account than its membership.');
  }
  // #endregion
}
