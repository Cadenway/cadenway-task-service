/** A refusal mapped by the presentation layer to the published problem. */
export class GoalError extends Error {
  // #region Constructor
  /** Keeps the stable reason and optional version or role for presentation. */
  public constructor(
    public readonly failure:
      | {
          readonly reason:
            'missing-organization' | 'missing-goal' | 'missing-space' | 'missing-result';
        }
      | {
          readonly reason:
            'organization-role-forbidden' | 'owner-ineligible' | 'result-target-invalid';
        }
      | { readonly reason: 'role-insufficient'; readonly role: 'comment' | 'view' }
      | { readonly reason: 'version-mismatch'; readonly version: number },
  ) {
    super(failure.reason);
  }
  // #endregion
}
