/** Inputs of one durable Notification delivery decision. */
export interface NotificationDeliveryAuthorizationInput {
  // #region Properties
  /** Tenant established by the authenticated event subscription. */
  readonly organizationId: string;

  /** Immutable correlation ID supplied by Notification. */
  readonly authorizationRequestId: string;

  /** Account whose current visibility the decision depends on. */
  readonly recipientId: string;

  /** Exact task selector used by the recipient check. */
  readonly subject: {
    readonly kind: 'task-id' | 'task-key';
    readonly reference: string;
  };

  /** Exclusive expiry of the Notification authorization attempt. */
  readonly expiresAt: Date;
  // #endregion
}
