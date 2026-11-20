import type { NotificationDeliveryDecision } from '../../../../models/delivery-authorization/notification-delivery-decision.model.js';

/** Immutable delivery decision persistence in the subscriber's tenant transaction. */
export interface NotificationDeliveryDecisionStore {
  // #region Methods
  /** Serializes decisions sharing a tenant and correlation. */
  lock(organizationId: string, authorizationRequestId: string): Promise<void>;

  /** Reads the previous binding, if this correlation was already processed. */
  find(
    organizationId: string,
    authorizationRequestId: string,
  ): Promise<NotificationDeliveryDecision | null>;

  /** Persists a new binding and the outbox identity allocated by this transaction. */
  insert(record: NotificationDeliveryDecision): Promise<void>;
  // #endregion
}
