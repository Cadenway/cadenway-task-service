import type { AccessRequestEvents } from '../../ports/outbound/messaging/access-request/access-request-events.port.js';
import type { AccessRequestRepository } from '../../ports/outbound/persistence/access-request/access-request-repository.port.js';
import type { RequestAttemptRepository } from '../../ports/outbound/persistence/attempt/request-attempt-repository.port.js';
import type { TransactionClock } from '../../ports/outbound/time/transaction/transaction-clock.port.js';

/**
 * Interface AccessRequestsStore
 *
 * @description
 * The repositories, the events and the clock of the access-requests module, all bound to the
 * tenant transaction of one unit of work: what they write commits together, or not at all.
 */
export interface AccessRequestsStore {
  // #region Properties
  /**
   * Property requests
   *
   * @description
   * The requests for access.
   *
   * @type {AccessRequestRepository}
   * @readonly
   */
  readonly requests: AccessRequestRepository;

  /**
   * Property attempts
   *
   * @description
   * The attempts of the hourly limit.
   *
   * @type {RequestAttemptRepository}
   * @readonly
   */
  readonly attempts: RequestAttemptRepository;

  /**
   * Property events
   *
   * @description
   * The outbox of the transaction.
   *
   * @type {AccessRequestEvents}
   * @readonly
   */
  readonly events: AccessRequestEvents;

  /**
   * Property clock
   *
   * @description
   * The instant of the transaction.
   *
   * @type {TransactionClock}
   * @readonly
   */
  readonly clock: TransactionClock;
  // #endregion
}
