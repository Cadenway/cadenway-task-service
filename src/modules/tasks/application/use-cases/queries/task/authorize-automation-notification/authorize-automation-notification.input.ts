/** The verified tenant and the two accounts involved in a proposed automation notification. */
export interface AuthorizeAutomationNotificationInput {
  // #region Properties
  /** Organization from the verified internal token. */
  readonly organizationId: string;

  /** Canonical key of the task to which the notification would refer. */
  readonly taskKey: string;

  /** Account whose current edit authority permits the rule action. */
  readonly ruleAuthorUserId: string;

  /** Account that must currently be allowed to read the task. */
  readonly recipientUserId: string;
  // #endregion
}
