/** An immutable binding, outcome and durable outbox identity. */
export interface NotificationDeliveryDecision {
  // #region Properties
  /** Tenant of the decision and its outbox fact. */
  readonly organizationId: string;

  /** Correlation identifying the logical decision. */
  readonly authorizationRequestId: string;

  /** Account to which the authorization was bound. */
  readonly recipientId: string;

  /** Type of the exact task selector. */
  readonly subjectKind: 'task-id' | 'task-key';

  /** Exact selector value. */
  readonly subjectValue: string;

  /** Deadline from the original request. */
  readonly expiresAt: Date;

  /** Generic outcome that reveals no task details. */
  readonly decision: 'permit' | 'deny';

  /** Clock sample after the access decision. */
  readonly decidedAt: Date;

  /** Exclusive eligibility deadline of this decision. */
  readonly validUntil: Date;

  /** ID of the outbox fact written in the same transaction. */
  readonly eventId: string;

  /** An immutable decision always emits version one. */
  readonly eventVersion: number;
  // #endregion
}
