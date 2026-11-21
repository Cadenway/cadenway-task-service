/** A delegated comment command with identity and tenant from the signed rule principal. */
export interface AutomationCommentInput {
  // #region Properties
  /** Tenant from the verified principal. */
  readonly organizationId: string;

  /** Task addressed by the command path. */
  readonly taskKey: string;

  /** The signed rule identity recorded as the author. */
  readonly ruleId: string;

  /** Current access to check before applying the rule. */
  readonly ruleAuthorUserId: string;

  /** Submitted Markdown without structured mentions or a reply target. */
  readonly body: string;
  // #endregion
}
